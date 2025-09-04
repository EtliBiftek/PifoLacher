const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const appRoot = path.resolve(__dirname, '..');
const nodeExe = process.execPath; // current Node executable
const electronCli = path.resolve(appRoot, 'node_modules', 'electron', 'cli.js');

if (!fs.existsSync(electronCli)) {
  console.error('Electron CLI not found. Did you run npm i?');
  process.exit(1);
}

const child = spawn(nodeExe, [electronCli, '.'], {
  cwd: appRoot,
  detached: true,
  stdio: 'ignore',
  windowsHide: true,
});

child.unref();

