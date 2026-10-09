const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const config = require('./config');

const s3 = new S3Client({
  region: config.aws.region,
  credentials: {
    accessKeyId: config.aws.accessKeyId,
    secretAccessKey: config.aws.secretAccessKey,
  },
  // Without these, the SDK signs a checksum of an *empty* body into presigned PUT URLs
  // and the real upload is rejected with a checksum mismatch.
  requestChecksumCalculation: 'WHEN_REQUIRED',
  responseChecksumValidation: 'WHEN_REQUIRED',
});

const bucket = config.aws.bucket;

const encodeKey = (key) => key.split('/').map(encodeURIComponent).join('/');

/** Permanent, canonical URL of the object (stored in the database). */
const objectUrl = (key) => `https://${bucket}.s3.${config.aws.region}.amazonaws.com/${encodeKey(key)}`;

/** URL the client can PUT the file bytes to directly (no AWS keys needed on the client). */
const presignUpload = (key, contentType) =>
  getSignedUrl(s3, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), {
    expiresIn: 60 * 60,
  });

/** Temporary URL to view/download a private object. */
const presignDownload = (key, fileName, { download = false } = {}) =>
  getSignedUrl(
    s3,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
      ResponseContentDisposition: `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
    }),
    { expiresIn: config.signedUrlTtl }
  );

const headObject = (key) => s3.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
const deleteObject = (key) => s3.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));

module.exports = { s3, bucket, objectUrl, presignUpload, presignDownload, headObject, deleteObject };
