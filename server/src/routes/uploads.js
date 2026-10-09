const express = require('express');
const crypto = require('crypto');
const config = require('../config');
const { query } = require('../db');
const { bucket, objectUrl, presignUpload, headObject } = require('../s3');
const { describeFile, cleanRelativePath } = require('../fileTypes');
const { emit } = require('../realtime');
const { serializeFile, recordEvent } = require('../serialize');

const router = express.Router();

const MAX_SINGLE_PUT = 5 * 1024 ** 3; // S3 limit for one PUT request: 5 GB

/**
 * Step 1: client says "I have this file". We either reply "duplicate, skip it"
 * or create a row with status 'uploading' and return a presigned PUT URL.
 */
router.post('/init', async (req, res) => {
  const { folderId = null, relativePath, size, sha256 = null, mimeType, deviceName = null, source = 'desktop', localModifiedAt = null } =
    req.body || {};

  const relPath = cleanRelativePath(relativePath || '');
  if (!relPath) return res.status(400).json({ error: 'relativePath is required' });
  if (!Number.isFinite(size) || size < 0) return res.status(400).json({ error: 'size must be a number' });
  if (size > MAX_SINGLE_PUT) return res.status(413).json({ error: 'Files larger than 5 GB are not supported' });

  if (sha256) {
    const dup = await query(
      `SELECT f.*, sf.name AS folder_name FROM files f LEFT JOIN sync_folders sf ON sf.id = f.folder_id
       WHERE f.status = 'uploaded' AND f.sha256 = $1 AND f.folder_id IS NOT DISTINCT FROM $2 LIMIT 1`,
      [sha256, folderId]
    );
    if (dup.rows.length) {
      await recordEvent({
        fileId: dup.rows[0].id,
        folderId,
        type: 'duplicate_skipped',
        message: `${relPath} is identical to ${dup.rows[0].relative_path}, upload skipped`,
        deviceName,
      });
      return res.json({ duplicate: true, file: await serializeFile(dup.rows[0]) });
    }
  }

  const fileName = relPath.split('/').pop();
  const info = describeFile(fileName, mimeType);
  const key = `${config.aws.prefix}/${folderId || 'mobile'}/${crypto.randomUUID()}/${relPath}`;

  const { rows } = await query(
    `INSERT INTO files (folder_id, file_name, relative_path, extension, mime_type, category, size_bytes, sha256,
                        s3_bucket, s3_key, s3_url, status, source, source_device, local_modified_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'uploading',$12,$13,$14) RETURNING *`,
    [folderId, fileName, relPath, info.extension, info.mimeType, info.category, size, sha256,
     bucket, key, objectUrl(key), source, deviceName, localModifiedAt]
  );

  res.json({
    duplicate: false,
    fileId: rows[0].id,
    uploadUrl: await presignUpload(key, info.mimeType),
    contentType: info.mimeType, // client MUST send exactly this Content-Type header
  });
});

/** Step 2 (after the client PUT the bytes to S3): verify the object exists and publish it. */
router.post('/:id/complete', async (req, res) => {
  const { rows } = await query(`SELECT * FROM files WHERE id = $1`, [req.params.id]);
  const file = rows[0];
  if (!file) return res.status(404).json({ error: 'Upload not found' });
  if (file.status === 'uploaded') return res.json({ file: await serializeFile(file) });

  let head;
  try {
    head = await headObject(file.s3_key);
  } catch {
    return res.status(409).json({ error: 'File is not in S3 yet' });
  }
  if (Number(head.ContentLength) !== Number(file.size_bytes)) {
    return res.status(409).json({ error: `Size mismatch: expected ${file.size_bytes}, S3 has ${head.ContentLength}` });
  }

  const updated = await query(
    `UPDATE files SET status = 'uploaded', uploaded_at = NOW() WHERE id = $1 RETURNING *,
       (SELECT name FROM sync_folders WHERE id = files.folder_id) AS folder_name`,
    [file.id]
  );
  if (file.folder_id) {
    await query(`UPDATE sync_folders SET file_count = file_count + 1, last_synced_at = NOW() WHERE id = $1`, [file.folder_id]);
  }

  const payload = await serializeFile(updated.rows[0]);
  emit('file:created', payload);
  await recordEvent({ fileId: file.id, folderId: file.folder_id, type: 'uploaded', message: file.relative_path, deviceName: file.source_device });
  res.json({ file: payload });
});

/** Client reports the PUT failed. */
router.post('/:id/fail', async (req, res) => {
  const { rows } = await query(
    `UPDATE files SET status = 'failed' WHERE id = $1 AND status = 'uploading' RETURNING *`,
    [req.params.id]
  );
  if (rows[0]) {
    await recordEvent({
      fileId: rows[0].id,
      folderId: rows[0].folder_id,
      type: 'upload_failed',
      message: `${rows[0].relative_path}: ${String(req.body?.reason || 'unknown error').slice(0, 500)}`,
      deviceName: rows[0].source_device,
    });
  }
  res.json({ ok: true });
});

module.exports = router;
