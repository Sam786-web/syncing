const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const { io } = require('socket.io-client');
const config = require('./src/config');
const { createApi } = require('./src/api');
const { SyncEngine } = require('./src/syncEngine');

if (!app.requestSingleInstanceLock()) app.quit();

let win = null;
let socket = null;
let engine = null;
let connection = { online: false, error: null };
const logs = [];

const api = createApi(() => config.load());
const send = (channel, payload) => win && !win.isDestroyed() && win.webContents.send(channel, payload);

function addLog(entry) {
  logs.unshift(entry);
  logs.length = Math.min(logs.length, 300);
  send('log', entry);
}

// ---------- live connection to the server (lets the mobile app see this laptop's status) ----------

function connectSocket() {
  if (socket) socket.disconnect();
  const cfg = config.load();
  if (!cfg.serverUrl || !cfg.apiKey) {
    setConnection(false, 'Set server URL and API key in Settings');
    return;
  }
  socket = io(cfg.serverUrl, {
    auth: { apiKey: cfg.apiKey, role: 'agent', deviceName: cfg.deviceName },
    reconnectionDelayMax: 10000,
  });
  socket.on('connect', () => {
    setConnection(true, null);
    pushAgentStatus();
  });
  socket.on('disconnect', () => setConnection(false, 'Disconnected'));
  socket.on('connect_error', (err) =>
    setConnection(false, err.message === 'unauthorized' ? 'Wrong API key' : `Cannot reach server (${err.message})`)
  );
}

function setConnection(online, error) {
  if (connection.online !== online) addLog({ level: online ? 'success' : 'warn', message: online ? 'Connected to server' : `Offline: ${error}`, time: new Date().toISOString() });
  connection = { online, error };
  send('connection', connection);
}

function pushAgentStatus() {
  if (!socket?.connected || !engine) return;
  const snap = engine.snapshot();
  socket.emit('agent:status', {
    queued: snap.queued,
    uploading: snap.uploading,
    failed: snap.failed,
    uploadedThisSession: snap.stats.uploaded,
    folders: config.load().folders.filter((f) => !f.paused).length,
    current: snap.jobs
      .filter((j) => j.state === 'uploading')
      .slice(0, 5)
      .map((j) => ({ name: j.name, progress: Math.round(j.progress * 100) })),
  });
}

// ---------- window ----------

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    minWidth: 820,
    minHeight: 560,
    title: 'CloudSync',
    backgroundColor: '#0f172a',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  engine = new SyncEngine({ getConfig: () => config.load(), api });
  engine.on('log', addLog);
  engine.on('update', (snap) => {
    send('engine:update', snap);
    pushAgentStatus();
  });

  createWindow();
  connectSocket();
  engine.start();
});

app.on('window-all-closed', async () => {
  await engine?.stop();
  app.quit();
});

// ---------- IPC: what the UI can ask for ----------

ipcMain.handle('state:get', () => ({ config: config.load(), connection, snapshot: engine.snapshot(), logs }));

ipcMain.handle('config:save', async (_e, patch) => {
  const allowed = ['serverUrl', 'apiKey', 'deviceName', 'deleteAfterUpload', 'concurrency', 'startOnLogin'];
  const clean = Object.fromEntries(Object.entries(patch).filter(([k]) => allowed.includes(k)));
  if (clean.serverUrl) clean.serverUrl = clean.serverUrl.trim().replace(/\/+$/, '');
  const saved = config.save(clean);
  app.setLoginItemSettings({ openAtLogin: !!saved.startOnLogin });
  connectSocket();
  return saved;
});

ipcMain.handle('server:test', async () => {
  try {
    const res = await api.health();
    return { ok: true, message: `Server OK, database ${res.database}` };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle('folder:pick', async () => {
  const res = await dialog.showOpenDialog(win, { title: 'Choose a folder to sync', properties: ['openDirectory'] });
  return res.canceled ? null : res.filePaths[0];
});

ipcMain.handle('folder:add', async (_e, rawPath) => {
  const folderPath = path.resolve(String(rawPath || '').trim().replace(/^"|"$/g, ''));
  let stat;
  try {
    stat = fs.statSync(folderPath);
  } catch {
    throw new Error(`Folder does not exist: ${folderPath}`);
  }
  if (!stat.isDirectory()) throw new Error('That path is a file, please choose a folder');

  const cfg = config.load();
  const norm = (p) => p.toLowerCase().replace(/[\\/]+$/, '') + path.sep;
  const overlap = cfg.folders.find((f) => norm(folderPath).startsWith(norm(f.path)) || norm(f.path).startsWith(norm(folderPath)));
  if (overlap) throw new Error(`Overlaps with a folder already synced: ${overlap.path}`);

  const { folder: remote } = await api.registerFolder({
    localPath: folderPath,
    deviceName: cfg.deviceName,
    name: path.basename(folderPath) || folderPath,
  });
  const folder = { id: remote.id || crypto.randomUUID(), path: folderPath, name: remote.name, paused: false };
  config.save({ folders: [...cfg.folders, folder] });
  engine.watch(folder);
  addLog({ level: 'info', message: `Added folder ${folderPath}`, time: new Date().toISOString() });
  pushAgentStatus();
  return config.load();
});

ipcMain.handle('folder:remove', async (_e, id) => {
  await engine.unwatch(id);
  api.removeFolder(id).catch((err) => addLog({ level: 'warn', message: `Server: ${err.message}`, time: new Date().toISOString() }));
  config.save({ folders: config.load().folders.filter((f) => f.id !== id) });
  pushAgentStatus();
  return config.load();
});

ipcMain.handle('folder:toggle', async (_e, id) => {
  const folders = config.load().folders.map((f) => (f.id === id ? { ...f, paused: !f.paused } : f));
  config.save({ folders });
  const folder = folders.find((f) => f.id === id);
  if (folder.paused) await engine.unwatch(id);
  else engine.watch(folder);
  pushAgentStatus();
  return config.load();
});

ipcMain.handle('folder:open', (_e, p) => shell.openPath(p));
ipcMain.handle('sync:retryFailed', () => engine.retryFailed());
