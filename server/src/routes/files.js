const express = require('express');
const { query } = require('../db');
const { presignDownload, deleteObject } = require('../s3');
const { emit } = require('../realtime');
const { serializeFile, recordEvent } = require('../serialize');

const router = express.Router();

const SELECT_FILE = `SELECT f.*, sf.name AS folder_name FROM files f LEFT JOIN sync_folders sf ON sf.id = f.folder_id`;

/** GET /api/files?search=&category=&folderId=&limit=&offset= */
router.get('/', async (req, res) => {
  const { search, category, folderId } = req.query;
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const offset = Math.max(Number(req.query.offset) || 0, 0);

  const where = [`f.status = 'uploaded'`];
  const params = [];
  if (search) {
    params.push(`%${search.toLowerCase()}%`);
    where.push(`(LOWER(f.file_name) LIKE $${params.length} OR LOWER(f.relative_path) LIKE $${params.length})`);
  }
  if (category && category !== 'all') {
    params.push(category);
    where.push(`f.category = $${params.length}`);
  }
  if (folderId) {
    params.push(folderId);
    where.push(`f.folder_id = $${params.length}`);
  }
  const whereSql = where.join(' AND ');

  const [list, count] = await Promise.all([
    query(`${SELECT_FILE} WHERE ${whereSql} ORDER BY f.uploaded_at DESC NULLS LAST LIMIT ${limit} OFFSET ${offset}`, params),
    query(`SELECT COUNT(*)::int AS total FROM files f WHERE ${whereSql}`, params),
  ]);

  res.json({ items: await Promise.all(list.rows.map(serializeFile)), total: count.rows[0].total, limit, offset });
});

router.get('/:id', async (req, res) => {
  const { rows } = await query(`${SELECT_FILE} WHERE f.id = $1`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'File not found' });
  res.json({ file: await serializeFile(rows[0]) });
});

/** GET /api/files/:id/url?download=1 -> fresh temporary link */
router.get('/:id/url', async (req, res) => {
  const { rows } = await query(`SELECT * FROM files WHERE id = $1 AND status = 'uploaded'`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'File not found' });
  const url = await presignDownload(rows[0].s3_key, rows[0].file_name, { download: req.query.download === '1' });
  res.json({ url });
});

/** DELETE /api/files/:id -> removes from S3, keeps the DB row as history (status 'deleted') */
router.delete('/:id', async (req, res) => {
  const { rows } = await query(`SELECT * FROM files WHERE id = $1 AND status = 'uploaded'`, [req.params.id]);
  const file = rows[0];
  if (!file) return res.status(404).json({ error: 'File not found' });

  await deleteObject(file.s3_key);
  await query(`UPDATE files SET status = 'deleted', deleted_at = NOW() WHERE id = $1`, [file.id]);
  if (file.folder_id) {
    await query(`UPDATE sync_folders SET file_count = GREATEST(file_count - 1, 0) WHERE id = $1`, [file.folder_id]);
  }

  emit('file:deleted', { id: file.id });
  await recordEvent({ fileId: file.id, folderId: file.folder_id, type: 'deleted', message: file.relative_path, deviceName: req.get('x-device-name') || null });
  res.json({ ok: true });
});

module.exports = router;
