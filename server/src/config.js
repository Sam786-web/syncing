require('dotenv').config({ quiet: true });

const required = ['DATABASE_URL', 'API_KEY', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'S3_BUCKET'];
const missing = required.filter((k) => !process.env[k]);
if (missing.length) {
  console.error(`\n[config] Missing environment variables: ${missing.join(', ')}`);
  console.error('[config] Copy .env.example to .env and fill in the values.\n');
  process.exit(1);
}

module.exports = {
  port: Number(process.env.PORT) || 4000,
  apiKey: process.env.API_KEY,
  databaseUrl: process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  aws: {
    region: process.env.AWS_REGION,
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    bucket: process.env.S3_BUCKET,
    prefix: (process.env.S3_PREFIX || 'cloudsync').replace(/^\/+|\/+$/g, ''),
  },
  // How long the viewing/download links handed to the apps stay valid (seconds)
  signedUrlTtl: Number(process.env.SIGNED_URL_TTL) || 3600,
};
