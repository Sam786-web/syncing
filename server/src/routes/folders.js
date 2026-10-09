const express = require('express');
const path = require('path');
const { query } = require('../db');
const { emit } = require('../realtime');
const { recordEvent } = require('../serialize');

const router = express.Router();

router.get('/', async (req, res) => {
  const { rows } = await query(`SELECT * FROM sync_folders WHERE is_active ORDER BY created_at`);
  res.json({ folders: rows });
});

/** Register (or re-activate) a watched folder. Called by the desktop app. */
router.post('/', async (req, res) => {
  const { localPath, deviceName, name } = req.body || {};
  if (!localPath || !deviceName) return res.status(400).json({ error: 'localPath and deviceName are required' });

  const { rows } = await query(
    `INSERT INTO sync_folders (name, device_name, local_path)
     VALUES ($1, $2, $3)
     ON CONFLICT (device_name, local_path) DO UPDATE SET is_active = TRUE, name = EXCLUDED.name
     RETURNING *`,
    [name || path.win32.basename(localPath) || localPath, deviceName, localPath]
  );
  emit('folders:changed', {});
  await recordEvent({ folderId: rows[0].id, type: 'folder_added', message: localPath, deviceName });
  res.json({ folder: rows[0] });
});

/** Stop syncing a folder (files already in S3 are kept). */
router.delete('/:id', async (req, res) => {
  const { rows } = await query(`UPDATE sync_folders SET is_active = FALSE WHERE id = $1 RETURNING *`, [req.params.id]);
  if (!rows[0]) return res.status(404).json({ error: 'Folder not found' });
  emit('folders:changed', {});
  await recordEvent({ folderId: rows[0].id, type: 'folder_removed', message: rows[0].local_path, deviceName: rows[0].device_name });
  res.json({ ok: true });
});

module.exports = router;
