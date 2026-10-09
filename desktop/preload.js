const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cloudsync', {
  getState: () => ipcRenderer.invoke('state:get'),
  saveConfig: (patch) => ipcRenderer.invoke('config:save', patch),
  testServer: () => ipcRenderer.invoke('server:test'),
  pickFolder: () => ipcRenderer.invoke('folder:pick'),
  addFolder: (p) => ipcRenderer.invoke('folder:add', p),
  removeFolder: (id) => ipcRenderer.invoke('folder:remove', id),
  toggleFolder: (id) => ipcRenderer.invoke('folder:toggle', id),
  openFolder: (p) => ipcRenderer.invoke('folder:open', p),
  retryFailed: () => ipcRenderer.invoke('sync:retryFailed'),
  on: (channel, cb) => {
    const allowed = ['engine:update', 'log', 'connection'];
    if (allowed.includes(channel)) ipcRenderer.on(channel, (_e, data) => cb(data));
  },
});
