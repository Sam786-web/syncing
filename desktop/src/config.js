// Settings are saved as JSON in the Electron user-data folder
// (Windows: %APPDATA%\CloudSync\config.json).
const fs = require('fs');
const os = require('os');
const path = require('path');
const { app } = require('electron');

const DEFAULTS = {
  serverUrl: 'http://localhost:4000',
  apiKey: '',
  deviceName: os.hostname(),
  deleteAfterUpload: true,
  concurrency: 3,
  startOnLogin: false,
  folders: [], // [{ id, path, name, paused }]
};

const file = () => path.join(app.getPath('userData'), 'config.json');
let current = null;

function load() {
  if (current) return current;
  try {
    current = { ...DEFAULTS, ...JSON.parse(fs.readFileSync(file(), 'utf8')) };
  } catch {
    current = { ...DEFAULTS };
  }
  return current;
}

function save(patch) {
  current = { ...load(), ...patch };
  fs.mkdirSync(path.dirname(file()), { recursive: true });
  fs.writeFileSync(file(), JSON.stringify(current, null, 2));
  return current;
}

module.exports = { load, save };
