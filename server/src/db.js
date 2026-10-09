const { Pool } = require('pg');
const config = require('./config');

const pool = new Pool({
  connectionString: config.databaseUrl,
  ssl: config.databaseSsl ? { rejectUnauthorized: false } : false,
  max: 10,
});

pool.on('error', (err) => console.error('[db] idle client error', err.message));

const query = (text, params) => pool.query(text, params);

async function logEvent({ fileId = null, folderId = null, type, message = null, deviceName = null }) {
  try {
    const { rows } = await query(
      `INSERT INTO sync_events (file_id, folder_id, event_type, message, device_name)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [fileId, folderId, type, message, deviceName]
    );
    return rows[0];
  } catch (err) {
    console.error('[db] could not log event', err.message);
    return null;
  }
}

module.exports = { pool, query, logEvent };
