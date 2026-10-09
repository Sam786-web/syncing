const http = require('http');
const express = require('express');
const cors = require('cors');
const config = require('./config');
const { query } = require('./db');
const { initRealtime } = require('./realtime');
const requireApiKey = require('./auth');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Public health check (used by the apps' "Test connection" button and by hosting providers)
app.get('/api/health', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ ok: true, database: 'up', time: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ ok: false, database: 'down', error: err.message });
  }
});

app.use('/api', requireApiKey);
app.use('/api/uploads', require('./routes/uploads'));
app.use('/api/files', require('./routes/files'));
app.use('/api/folders', require('./routes/folders'));
app.use('/api', require('./routes/meta'));

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
// Express 5 forwards errors thrown in async handlers here
app.use((err, req, res, next) => {
  console.error('[error]', req.method, req.originalUrl, err);
  res.status(500).json({ error: err.message || 'Server error' });
});

// Uploads that started but never completed (laptop closed mid-upload, etc.) are marked failed.
setInterval(() => {
  query(`UPDATE files SET status = 'failed' WHERE status = 'uploading' AND created_at < NOW() - INTERVAL '6 hours'`).catch(
    (err) => console.error('[cleanup]', err.message)
  );
}, 30 * 60 * 1000);

const server = http.createServer(app);
initRealtime(server);

server.listen(config.port, '0.0.0.0', () => {
  console.log(`CloudSync server running on http://localhost:${config.port}`);
  console.log(`S3 bucket: ${config.aws.bucket} (${config.aws.region})`);
});
