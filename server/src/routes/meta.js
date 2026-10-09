const express = require('express');
const { query } = require('../db');
const { agentList } = require('../realtime');

const router = express.Router();

router.get('/stats', async (req, res) => {
  const [totals, byCategory] = await Promise.all([
    query(`SELECT COUNT(*)::int AS files, COALESCE(SUM(size_bytes), 0)::bigint AS bytes FROM files WHERE status = 'uploaded'`),
    query(`SELECT category, COUNT(*)::int AS files, COALESCE(SUM(size_bytes), 0)::bigint AS bytes
           FROM files WHERE status = 'uploaded' GROUP BY category`),
  ]);
  res.json({
    totalFiles: totals.rows[0].files,
    totalBytes: Number(totals.rows[0].bytes),
    byCategory: byCategory.rows.map((r) => ({ ...r, bytes: Number(r.bytes) })),
    agents: agentList(),
  });
});

router.get('/events', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 50, 200);
  const { rows } = await query(`SELECT * FROM sync_events ORDER BY created_at DESC LIMIT ${limit}`);
  res.json({ events: rows });
});

module.exports = router;
