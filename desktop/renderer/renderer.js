const api = window.cloudsync;
const $ = (id) => document.getElementById(id);

let state = { config: null, snapshot: null };

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmtSize = (b) => {
  if (!b) return '0 B';
  const u = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(b) / Math.log(1024)), u.length - 1);
  return `${(b / 1024 ** i).toFixed(i ? 1 : 0)} ${u[i]}`;
};
const STATE_LABEL = { queued: 'Waiting', hashing: 'Checking', uploading: 'Uploading', retrying: 'Retrying', failed: 'Failed' };

// ---------- rendering ----------

function renderConnection(c) {
  const el = $('conn');
  el.className = `pill ${c.online ? 'online' : 'offline'}`;
  el.textContent = c.online ? 'Connected' : c.error || 'Offline';
}

function renderSettings(cfg) {
  const f = $('settings');
  f.serverUrl.value = cfg.serverUrl;
  f.apiKey.value = cfg.apiKey;
  f.deviceName.value = cfg.deviceName;
  f.concurrency.value = cfg.concurrency;
  f.deleteAfterUpload.checked = cfg.deleteAfterUpload;
  f.startOnLogin.checked = cfg.startOnLogin;
}

function renderFolders() {
  const { folders } = state.config;
  const watching = new Set(state.snapshot?.watching || []);
  $('no-folders').hidden = folders.length > 0;
  $('folders').innerHTML = folders
    .map(
      (f) => `
      <li class="folder">
        <div class="info">
          <div>${esc(f.name)} <span class="badge ${watching.has(f.id) ? 'live' : ''}">${f.paused ? 'Paused' : watching.has(f.id) ? 'Live' : 'Not found'}</span></div>
          <div class="path" title="${esc(f.path)}">${esc(f.path)}</div>
        </div>
        <button class="link" data-act="open" data-id="${f.id}">Open</button>
        <button class="link" data-act="toggle" data-id="${f.id}">${f.paused ? 'Resume' : 'Pause'}</button>
        <button class="link danger" data-act="remove" data-id="${f.id}">Remove</button>
      </li>`
    )
    .join('');
}

function renderSnapshot() {
  const s = state.snapshot;
  if (!s) return;
  $('s-uploaded').textContent = s.stats.uploaded;
  $('s-active').textContent = s.uploading;
  $('s-queued').textContent = s.queued;
  $('s-skipped').textContent = s.stats.skipped;
  $('s-failed').textContent = s.failed;
  $('retry').hidden = s.failed === 0;

  const order = { uploading: 0, hashing: 1, retrying: 2, queued: 3, failed: 4 };
  const jobs = [...s.jobs].sort((a, b) => order[a.state] - order[b.state]).slice(0, 100);
  $('no-jobs').hidden = jobs.length > 0;
  $('jobs').innerHTML = jobs
    .map(
      (j) => `
      <li class="job">
        <div class="top">
          <span class="name" title="${esc(j.relativePath)}">${esc(j.relativePath)}</span>
          <span><span class="muted">${fmtSize(j.size)}</span> <span class="badge ${j.state}">${STATE_LABEL[j.state] || j.state}</span></span>
        </div>
        ${j.state === 'uploading' ? `<div class="bar"><div style="width:${Math.round(j.progress * 100)}%"></div></div>` : ''}
        ${j.error ? `<div class="err">${esc(j.error)}</div>` : ''}
      </li>`
    )
    .join('');
  renderFolders();
}

function addLog(entry, prepend = true) {
  const li = document.createElement('li');
  li.innerHTML = `<time>${new Date(entry.time).toLocaleTimeString()}</time><span class="${entry.level}">${esc(entry.message)}</span>`;
  const ul = $('logs');
  prepend ? ul.prepend(li) : ul.append(li);
  while (ul.children.length > 300) ul.lastChild.remove();
}

// ---------- actions ----------

function showFolderError(msg) {
  $('folder-error').hidden = !msg;
  $('folder-error').textContent = msg || '';
}

async function addFolder(p) {
  showFolderError('');
  if (!p) return;
  try {
    state.config = await api.addFolder(p);
    $('folder-path').value = '';
    renderFolders();
  } catch (err) {
    showFolderError(err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  }
}

$('add-form').addEventListener('submit', (e) => {
  e.preventDefault();
  addFolder($('folder-path').value);
});

$('browse').addEventListener('click', async () => {
  const p = await api.pickFolder();
  if (p) addFolder(p);
});

$('folders').addEventListener('click', async (e) => {
  const btn = e.target.closest('button[data-act]');
  if (!btn) return;
  const folder = state.config.folders.find((f) => f.id === btn.dataset.id);
  if (btn.dataset.act === 'open') return api.openFolder(folder.path);
  if (btn.dataset.act === 'toggle') state.config = await api.toggleFolder(folder.id);
  if (btn.dataset.act === 'remove') {
    if (btn.dataset.confirm !== '1') {
      btn.dataset.confirm = '1';
      btn.textContent = 'Click again to remove';
      setTimeout(() => { btn.dataset.confirm = ''; btn.textContent = 'Remove'; }, 3000);
      return;
    }
    state.config = await api.removeFolder(folder.id);
  }
  renderFolders();
});

$('settings').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  state.config = await api.saveConfig({
    serverUrl: f.serverUrl.value,
    apiKey: f.apiKey.value,
    deviceName: f.deviceName.value.trim() || state.config.deviceName,
    concurrency: Math.min(Math.max(Number(f.concurrency.value) || 3, 1), 8),
    deleteAfterUpload: f.deleteAfterUpload.checked,
    startOnLogin: f.startOnLogin.checked,
  });
  $('settings-msg').textContent = 'Saved.';
});

$('test').addEventListener('click', async () => {
  $('settings-msg').textContent = 'Testing…';
  const res = await api.testServer();
  $('settings-msg').textContent = res.ok ? `✔ ${res.message}` : `✖ ${res.message}`;
});

$('retry').addEventListener('click', () => api.retryFailed());

// ---------- boot ----------

api.on('connection', renderConnection);
api.on('log', (entry) => addLog(entry));
api.on('engine:update', (snap) => {
  state.snapshot = snap;
  renderSnapshot();
});

(async () => {
  const s = await api.getState();
  state = { config: s.config, snapshot: s.snapshot };
  renderConnection(s.connection);
  renderSettings(s.config);
  renderFolders();
  renderSnapshot();
  s.logs.forEach((l) => addLog(l, false));
})();
