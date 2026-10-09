const DEVICE_NAME = 'Android phone';

export function createApi({ serverUrl, apiKey }) {
  const base = `${serverUrl.trim().replace(/\/+$/, '')}/api`;

  async function request(path, { method = 'GET', body, timeout = 15000 } = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(base + path, {
        method,
        signal: controller.signal,
        headers: { 'x-api-key': apiKey, 'x-device-name': DEVICE_NAME, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Server error (${res.status})`);
      return data;
    } catch (err) {
      if (err.name === 'AbortError') throw new Error('Server did not respond. Check the URL and that the phone can reach it.');
      if (err.message === 'Network request failed') throw new Error('Cannot reach server. Is it running and on the same network?');
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }

  const qs = (params) =>
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== '')
      .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
      .join('&');

  return {
    health: () => request('/health'),
    stats: () => request('/stats'),
    events: (limit = 100) => request(`/events?limit=${limit}`),
    listFiles: (params) => request(`/files?${qs(params)}`),
    fileUrl: (id, download = false) => request(`/files/${id}/url${download ? '?download=1' : ''}`),
    deleteFile: (id) => request(`/files/${id}`, { method: 'DELETE' }),

    /** Upload a file picked on the phone: ask server for a presigned URL, PUT to S3, confirm. */
    async uploadFromPhone(asset, onProgress) {
      const blob = await (await fetch(asset.uri)).blob();
      const size = asset.size ?? blob.size;
      const init = await request('/uploads/init', {
        method: 'POST',
        body: { relativePath: asset.name, size, mimeType: asset.mimeType, source: 'mobile', deviceName: DEVICE_NAME },
      });

      try {
        await new Promise((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', init.uploadUrl);
          xhr.setRequestHeader('Content-Type', init.contentType);
          xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
          xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`S3 upload failed (${xhr.status})`)));
          xhr.onerror = () => reject(new Error('Upload failed, check your connection'));
          xhr.send(blob);
        });
      } catch (err) {
        request(`/uploads/${init.fileId}/fail`, { method: 'POST', body: { reason: err.message } }).catch(() => {});
        throw err;
      }

      return request(`/uploads/${init.fileId}/complete`, { method: 'POST' });
    },
  };
}
