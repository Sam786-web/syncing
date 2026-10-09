// Creates the tables from database/schema.sql.  Usage: npm run db:init
const fs = require('fs');
const path = require('path');
const { pool } = require('../src/db');

(async () => {
  const sql = fs.readFileSync(path.join(__dirname, '..', '..', 'database', 'schema.sql'), 'utf8');
  try {
    await pool.query(sql);
    console.log('Database tables are ready: sync_folders, files, sync_events');
  } catch (err) {
    console.error('Failed to create tables:', err.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
})();
