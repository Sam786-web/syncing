const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { EventEmitter } = require('events');
const chokidar = require('chokidar');
const mime = require('mime-types');

// Files that are still being written by another program, or OS junk
const IGNORED_NAMES = new Set(['desktop.ini', 'thumbs.db', '.ds_store']);
const IGNORED_SUFFIXES = ['.tmp', '.temp', '.crdownload', '.part', '.partial', '.download', '.opdownload', '.swp'];
const isIgnoredName = (name) => {
  const n = name.toLowerCase();
  return IGNORED_NAMES.has(n) || n.startsWith('~$') || n.startsWith('.~lock') || IGNORED_SUFFIXES.some((s) => n.endsWith(s));
};

const RETRY_DELAYS = [5, 15, 30, 60, 120, 300, 300, 300]; // seconds
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    fs.createReadStream(filePath)
      .on('data', (d) => hash.update(d))
      .on('end', () => resolve(hash.digest('hex')))
      .on('error', reject);
  });
}

/**
 * Watches folders, uploads every new/changed file to S3 (through the server),
 * then deletes the local copy.
 *
 * Events: 'update' (queue snapshot), 'log' ({ level, message, time })
 */
class SyncEngine extends EventEmitter {
  constructor({ getConfig, api }) {
    super();
    this.getConfig = getConfig;
    this.api = api;
    this.watchers = new Map(); // folderId -> chokidar watcher
    this.jobs = new Map(); // absPath -> job
    this.queue = []; // absPaths waiting
    this.active = 0;
    this.stats = { uploaded: 0, skipped: 0, failed: 0, bytes: 0 };
    this.updateTimer = null;
  }

  log(level, message) {
    this.emit('log', { level, message, time: new Date().toISOString() });
  }

  // ---------------- watching ----------------

  start() {
    for (const folder of this.getConfig().folders) {
      if (!folder.paused) this.watch(folder);
    }
  }

  async stop() {
    await Promise.all([...this.watchers.keys()].map((id) => this.unwatch(id)));
  }

  watch(folder) {
    if (this.watchers.has(folder.id)) return;
    if (!fs.existsSync(folder.path)) {
      this.log('error', `Folder not found: ${folder.path}`);
      return;
    }

    const watcher = chokidar.watch(folder.path, {
      ignoreInitial: false, // files already in the folder are synced too
      persistent: true,
      // wait until a file stops growing for 2s before uploading it (copy/download finished)
      awaitWriteFinish: { stabilityThreshold: 2000, pollInterval: 250 },
      ignored: (p, stats) => p !== folder.path && isIgnoredName(path.basename(p)) && (!stats || stats.isFile()),
    });

    watcher
      .on('add', (p, stats) => this.enqueue(folder, p, stats))
      .on('change', (p, stats) => this.enqueue(folder, p, stats))
      .on('ready', () => this.log('info', `Watching ${folder.path}`))
      .on('error', (err) => this.log('error', `Watcher error (${folder.name}): ${err.message}`));

    this.watchers.set(folder.id, watcher);
  }

  async unwatch(folderId) {
    const watcher = this.watchers.get(folderId);
    if (!watcher) return;
    this.watchers.delete(folderId);
    await watcher.close();
    // drop queued (not running) jobs of that folder
    for (const [abs, job] of this.jobs) {
      if (job.folderId === folderId && (job.state === 'queued' || job.state === 'failed' || job.state === 'retrying')) {
        clearTimeout(job.retryTimer);
        this.jobs.delete(abs);
      }
    }
    this.queue = this.queue.filter((abs) => this.jobs.has(abs));
    this.scheduleUpdate();
  }

  // ---------------- queue ----------------

  enqueue(folder, absPath, stats) {
    const existing = this.jobs.get(absPath);
    if (existing && existing.state !== 'failed') {
      existing.dirty = true; // changed again while busy: re-check after this run
      return;
    }
    if (existing) clearTimeout(existing.retryTimer);

    const relativePath = path.relative(folder.path, absPath).split(path.sep).join('/');
    this.jobs.set(absPath, {
      absPath,
      folderId: folder.id,
      folderPath: folder.path,
      relativePath,
      name: path.basename(absPath),
      size: stats?.size ?? 0,
      state: 'queued',
      progress: 0,
      attempts: 0,
      error: null,
    });
    this.queue.push(absPath);
    this.scheduleUpdate();
    this.pump();
  }

  pump() {
    const limit = Math.max(1, Number(this.getConfig().concurrency) || 3);
    while (this.active < limit && this.queue.length) {
      const abs = this.queue.shift();
      const job = this.jobs.get(abs);
      if (!job || job.state !== 'queued') continue;
      this.active++;
      this.run(job).finally(() => {
        this.active--;
        this.pump();
      });
    }
  }

  async run(job) {
    try {
      await this.process(job);
    } catch (err) {
      if (err.code === 'ENOENT') {
        // file was moved/deleted before we got to it - nothing to do
        this.jobs.delete(job.absPath);
        this.scheduleUpdate();
        return;
      }
      job.attempts++;
      job.error = err.message;
      if (job.attempts <= RETRY_DELAYS.length) {
        const wait = RETRY_DELAYS[job.attempts - 1];
        job.state = 'retrying';
        this.log('warn', `${job.relativePath}: ${err.message} - retry in ${wait}s`);
        job.retryTimer = setTimeout(() => {
          if (this.jobs.get(job.absPath) !== job) return;
          job.state = 'queued';
          this.queue.push(job.absPath);
          this.pump();
          this.scheduleUpdate();
        }, wait * 1000);
      } else {
        job.state = 'failed';
        this.stats.failed++;
        this.log('error', `${job.relativePath}: gave up after ${job.attempts} attempts (${err.message})`);
      }
      this.scheduleUpdate();
    }
  }

  async process(job) {
    const cfg = this.getConfig();
    job.dirty = false;
    job.error = null;

    job.state = 'hashing';
    this.scheduleUpdate();
    const before = await fs.promises.stat(job.absPath);
    job.size = before.size;
    const sha256 = await hashFile(job.absPath);

    const init = await this.api.initUpload({
      folderId: job.folderId,
      relativePath: job.relativePath,
      size: before.size,
      sha256,
      mimeType: mime.lookup(job.name) || 'application/octet-stream',
      deviceName: cfg.deviceName,
      source: 'desktop',
      localModifiedAt: before.mtime.toISOString(),
    });

    if (init.duplicate) {
      this.stats.skipped++;
      this.log('info', `${job.relativePath}: already in S3, skipped upload`);
    } else {
      job.state = 'uploading';
      this.scheduleUpdate();
      try {
        await this.api.putFile(init.uploadUrl, job.absPath, init.contentType, before.size, (p) => {
          job.progress = p;
          this.scheduleUpdate();
        });
        await this.api.completeUpload(init.fileId);
      } catch (err) {
        this.api.failUpload(init.fileId, err.message).catch(() => {});
        throw err;
      }
      this.stats.uploaded++;
      this.stats.bytes += before.size;
      this.log('success', `${job.relativePath}: uploaded (${(before.size / 1024).toFixed(1)} KB)`);
    }

    // Was the file modified while we were uploading? Then upload the new version instead of deleting.
    const after = await fs.promises.stat(job.absPath).catch(() => null);
    const changed = after && (after.size !== before.size || after.mtimeMs !== before.mtimeMs);

    if (changed || job.dirty) {
      this.jobs.delete(job.absPath);
      const folder = cfg.folders.find((f) => f.id === job.folderId);
      if (folder && after) this.enqueue(folder, job.absPath, after);
      return;
    }

    if (cfg.deleteAfterUpload && after) await this.deleteLocal(job);
    this.jobs.delete(job.absPath);
    this.scheduleUpdate();
  }

  async deleteLocal(job) {
    // Windows sometimes keeps a short lock on a file (antivirus, indexer) - retry a few times
    for (let i = 0; i < 5; i++) {
      try {
        await fs.promises.unlink(job.absPath);
        break;
      } catch (err) {
        if (err.code === 'ENOENT') break;
        if (i === 4) {
          this.log('warn', `${job.relativePath}: uploaded but could not delete local file (${err.code})`);
          return;
        }
        await sleep(1000 * (i + 1));
      }
    }
    // remove now-empty sub folders, never the synced root folder itself
    let dir = path.dirname(job.absPath);
    while (dir.length > job.folderPath.length && dir.startsWith(job.folderPath)) {
      try {
        await fs.promises.rmdir(dir); // only succeeds if empty
      } catch {
        break;
      }
      dir = path.dirname(dir);
    }
  }

  retryFailed() {
    let n = 0;
    for (const job of this.jobs.values()) {
      if (job.state === 'failed') {
        job.state = 'queued';
        job.attempts = 0;
        this.queue.push(job.absPath);
        n++;
      }
    }
    this.stats.failed = 0;
    this.log('info', `Retrying ${n} failed file(s)`);
    this.pump();
    this.scheduleUpdate();
  }

  // ---------------- status ----------------

  snapshot() {
    const jobs = [...this.jobs.values()].map(({ retryTimer, ...j }) => j);
    return {
      jobs,
      queued: jobs.filter((j) => j.state === 'queued' || j.state === 'retrying').length,
      uploading: jobs.filter((j) => j.state === 'uploading' || j.state === 'hashing').length,
      failed: jobs.filter((j) => j.state === 'failed').length,
      stats: { ...this.stats },
      watching: [...this.watchers.keys()],
    };
  }

  scheduleUpdate() {
    if (this.updateTimer) return;
    this.updateTimer = setTimeout(() => {
      this.updateTimer = null;
      this.emit('update', this.snapshot());
    }, 300);
  }
}

module.exports = { SyncEngine };
