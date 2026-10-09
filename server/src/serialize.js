const { presignDownload } = require('./s3');
const { logEvent } = require('./db');
const { emit } = require('./realtime');

/** Shape a `files` row for the apps, adding a fresh temporary view URL. */
async function serializeFile(row) {
  const viewUrl = row.status === 'uploaded' ? await presignDownload(row.s3_key, row.file_name) : null;
  return {
    id: row.id,
    folderId: row.folder_id,
    folderName: row.folder_name ?? null,
    fileName: row.file_name,
    relativePath: row.relative_path,
    extension: row.extension,
    mimeType: row.mime_type,
    category: row.category,
    sizeBytes: Number(row.size_bytes),
    sha256: row.sha256,
    s3Key: row.s3_key,
    s3Url: row.s3_url,
    viewUrl,
    status: row.status,
    source: row.source,
    sourceDevice: row.source_device,
    localModifiedAt: row.local_modified_at,
    uploadedAt: row.uploaded_at,
    createdAt: row.created_at,
  };
}

/** Write to the activity log and push it live to every app. */
async function recordEvent(event) {
  const row = await logEvent(event);
  if (row) emit('event:new', row);
  return row;
}

module.exports = { serializeFile, recordEvent };
