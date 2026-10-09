const path = require('path');
const mime = require('mime-types');

const ARCHIVES = new Set(['zip', 'rar', '7z', 'tar', 'gz', 'bz2', 'xz']);
const DOCUMENTS = new Set([
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'ppt', 'pptx', 'txt', 'rtf', 'odt', 'ods', 'odp', 'md', 'json', 'xml', 'html',
]);

function describeFile(fileName, givenMime) {
  const extension = path.extname(fileName).slice(1).toLowerCase() || null;
  const mimeType = givenMime || mime.lookup(fileName) || 'application/octet-stream';

  let category = 'other';
  if (mimeType.startsWith('image/')) category = 'image';
  else if (mimeType.startsWith('video/')) category = 'video';
  else if (mimeType.startsWith('audio/')) category = 'audio';
  else if (extension && ARCHIVES.has(extension)) category = 'archive';
  else if ((extension && DOCUMENTS.has(extension)) || mimeType.startsWith('text/')) category = 'document';

  return { extension, mimeType, category };
}

/** Turns "..\a\\b/../c.txt" into "a/b/c.txt" so it is safe to use inside an S3 key. */
function cleanRelativePath(p) {
  return String(p)
    .replace(/\\/g, '/')
    .split('/')
    .filter((seg) => seg && seg !== '.' && seg !== '..')
    .join('/');
}

module.exports = { describeFile, cleanRelativePath };
