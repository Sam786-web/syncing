// Launches Electron. Clears ELECTRON_RUN_AS_NODE (set by some editors/tools),
// which would otherwise make Electron run as plain Node and crash on startup.
const { spawn } = require('child_process');
const path = require('path');
const electron = require('electron');

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, [path.join(__dirname, '..')], { stdio: 'inherit', env });
child.on('close', (code) => process.exit(code ?? 0));
