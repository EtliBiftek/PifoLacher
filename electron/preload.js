const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('launcher', {
  getDir: () => ipcRenderer.invoke('minecraft:getDir'),
  listVersions: () => ipcRenderer.invoke('minecraft:listVersions'),
  listAllVersions: () => ipcRenderer.invoke('minecraft:listAllVersions'),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (data) => ipcRenderer.invoke('settings:save', data),
  play: (args) => ipcRenderer.invoke('minecraft:play', args),
  install: (args) => ipcRenderer.invoke('minecraft:install', args),
  getVersionNames: () => ipcRenderer.invoke('settings:load').then(s => s.versionNames || {}),
  onLog: (cb) => ipcRenderer.on('minecraft:log', (_, m) => cb(m)),
  onProgress: (cb) => ipcRenderer.on('minecraft:progress', (_, p) => cb(p)),
  onStatus: (cb) => ipcRenderer.on('minecraft:status', (_, s) => cb(s)),
});


