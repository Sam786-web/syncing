const config = require('./config');

module.exports = function requireApiKey(req, res, next) {
  if (req.get('x-api-key') !== config.apiKey) {
    return res.status(401).json({ error: 'Invalid or missing API key' });
  }
  next();
};
