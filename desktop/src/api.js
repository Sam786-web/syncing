const fs = require('fs');
const axios = require('axios');

function errorMessage(err) {
  return err.response?.data?.error || (err.code === 'ECONNREFUSED' ? 'Server is not reachable' : err.message);
}

function createApi(getConfig) {
  const client = () => {
    const cfg = getConfig();
    return axios.create({
      baseURL: `${cfg.serverUrl.replace(/\/+$/, '')}/api`,
      headers: { 'x-api-key': cfg.apiKey, 'x-device-name': cfg.deviceName },
      timeout: 30000,
    });
  };

  const call = async (fn) => {
    try {
      return (await fn(client())).data;
    } catch (err) {
      throw new Error(errorMessage(err));
    }
  };

  return {
    health: () => call((c) => c.get('/health')),
    registerFolder: (body) => call((c) => c.post('/folders', body)),
    removeFolder: (id) => call((c) => c.delete(`/folders/${id}`)),
    initUpload: (body) => call((c) => c.post('/uploads/init', body)),
    completeUpload: (id) => call((c) => c.post(`/uploads/${id}/complete`)),
    failUpload: (id, reason) => call((c) => c.post(`/uploads/${id}/fail`, { reason })),

    /** Streams the file straight to S3 using the presigned URL. */
    async putFile(url, filePath, contentType, size, onProgress) {
      try {
        await axios.put(url, size === 0 ? Buffer.alloc(0) : fs.createReadStream(filePath), {
          headers: { 'Content-Type': contentType, 'Content-Length': size },
          maxBodyLength: Infinity,
          maxContentLength: Infinity,
          timeout: 0,
          onUploadProgress: (e) => size && onProgress(Math.min(e.loaded / size, 1)),
        });
      } catch (err) {
        // S3 answers with XML; keep the useful part short
        const xml = typeof err.response?.data === 'string' ? err.response.data : '';
        const code = xml.match(/<Code>(.*?)<\/Code>/)?.[1];
        throw new Error(code ? `S3 rejected upload: ${code}` : errorMessage(err));
      }
    },
  };
}

module.exports = { createApi };
