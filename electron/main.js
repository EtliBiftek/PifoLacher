const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

function getMinecraftDir() {
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA || process.env.HOME;
  return path.join(appData, '.minecraft');
}

function listInstalledVersions() {
  const versionsDir = path.join(getMinecraftDir(), 'versions');
  try {
    const entries = fs.readdirSync(versionsDir, { withFileTypes: true });
    const versions = entries
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }));
    return versions;
  } catch (e) {
    return [];
  }
}

function fetchAllMojangVersions() {
  const url = 'https://launchermeta.mojang.com/mc/game/version_manifest.json';
  return new Promise((resolve) => {
    https
      .get(url, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          try {
            const json = JSON.parse(data);
            const versions = Array.isArray(json.versions) ? json.versions : [];
            resolve(
              versions.map((v) => ({ id: v.id, type: v.type, releaseTime: v.releaseTime }))
            );
          } catch (e) {
            resolve([]);
          }
        });
      })
      .on('error', () => resolve([]));
  });
}

// Settings file (.pifo) helpers
function getSettingsFilePath() {
  const appData = process.env.APPDATA || process.env.LOCALAPPDATA || process.env.HOME;
  const dir = path.join(appData, 'PifoLacher');
  try { fs.mkdirSync(dir, { recursive: true }); } catch {}
  return path.join(dir, 'settings.pifo');
}

function loadSettingsFromDisk() {
  const file = getSettingsFilePath();
  try {
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, JSON.stringify({}, null, 2));
      return {};
    }
    const raw = fs.readFileSync(file, 'utf8');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveSettingsToDisk(settings) {
  const file = getSettingsFilePath();
  try {
    fs.writeFileSync(file, JSON.stringify(settings || {}, null, 2));
    return true;
  } catch {
    return false;
  }
}

function setVersionDisplayName(versionId, displayName) {
  const cur = loadSettingsFromDisk();
  const names = Object.assign({}, cur.versionNames || {});
  if (displayName && String(displayName).trim().length > 0) {
    names[versionId] = String(displayName).trim();
  } else {
    delete names[versionId];
  }
  const next = { ...cur, versionNames: names };
  saveSettingsToDisk(next);
  return next;
}

function sanitizeUsername(name) {
  let v = String(name || '').trim();
  v = v.replace(/[^A-Za-z0-9_]/g, '_');
  if (v.length < 3) v = (v + '___').slice(0, 3);
  if (v.length > 16) v = v.slice(0, 16);
  return v;
}

function offlineUuidFromName(name) {
  const input = `OfflinePlayer:${name}`;
  const md5 = crypto.createHash('md5').update(input, 'utf8').digest();
  md5[6] = (md5[6] & 0x0f) | 0x30;
  md5[8] = (md5[8] & 0x3f) | 0x80;
  const hex = md5.toString('hex');
  return `${hex.substring(0, 8)}-${hex.substring(8, 12)}-${hex.substring(12, 16)}-${hex.substring(16, 20)}-${hex.substring(20)}`;
}

/** @type {BrowserWindow | null} */
let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    backgroundColor: '#1b1b1b',
    icon: path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
    title: 'Minecraft Launcher',
  });

  mainWindow.once('ready-to-show', () => mainWindow && mainWindow.show());
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(() => {
  createWindow();
  initRPC();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('minecraft:getDir', async () => getMinecraftDir());
ipcMain.handle('minecraft:listVersions', async () => listInstalledVersions());
ipcMain.handle('minecraft:listAllVersions', async () => fetchAllMojangVersions());
ipcMain.handle('settings:load', async () => loadSettingsFromDisk());
ipcMain.handle('settings:save', async (event, data) => {
  const cur = loadSettingsFromDisk();
  const next = { ...cur, ...(data || {}) };
  const ok = saveSettingsToDisk(next);
  return { ok };
});

const { Client, Authenticator } = require('minecraft-launcher-core');
const launcher = new Client();
const Handler = require('minecraft-launcher-core/components/handler');
const crypto = require('crypto');

// Discord RPC
let rpc = null;
const RPC = require('discord-rpc');
const discordClientId = '1412969394291740784'; // placeholder, replace with your application id
RPC.register(discordClientId);
const RPC_BUTTONS = [
  { label: 'Download PifoLacher', url: 'https://github.com/EtliBiftek/PifoLacher' },
  { label: 'Pifo′s About', url: 'https://etlibiftek.github.io/About/' },
];
async function initRPC() {
  try {
    rpc = new RPC.Client({ transport: 'ipc' });
    rpc.on('ready', () => {
      setRPCIdle();
    });
    await rpc.login({ clientId: discordClientId });
  } catch (e) {
    console.warn('Discord RPC failed to init:', e);
  }
}
function setRPCIdle() {
  if (!rpc) return;
  rpc.setActivity({
    details: 'Oyun Başlatılmayı Bekliyor',
    state: 'PifoLacher - Version 0.1.1 (Beta)',
    largeImageKey: 'minecraft',
    largeImageText: 'Minecraft Launcher',
    startTimestamp: Date.now(),
    buttons: RPC_BUTTONS,
    instance: false,
  }).catch(() => {});
}
function setRPCMainMenu(version) {
  if (!rpc) return;
  rpc.setActivity({
    details: 'Ana Menüde',
    state: `Sürüm: ${version} | PifoLacher - Version 0.1.1 (Beta)`,
    largeImageKey: 'minecraft',
    largeImageText: version,
    startTimestamp: Date.now(),
    buttons: RPC_BUTTONS,
    instance: false,
  }).catch(() => {});
}
function setRPCSingleplayer(worldName, dimension, version) {
  if (!rpc) return;
  rpc.setActivity({
    details: 'Tek Oyunculuda Oynuyor',
    state: `Sürüm: ${version} | PifoLacher - Version 0.1.1 (Beta)`,
    largeImageKey: 'minecraft',
    largeImageText: 'Singleplayer',
    startTimestamp: Date.now(),
    buttons: RPC_BUTTONS,
    instance: false,
  }).catch(() => {});
}

function setRPCMultiplayer(version) {
  if (!rpc) return;
  rpc.setActivity({
    details: 'Çok Oyunculuda Oynuyor',
    state: `Sürüm: ${version} | PifoLacher - Version 0.1.1 (Beta)`,
    largeImageKey: 'minecraft',
    largeImageText: 'Multiplayer',
    startTimestamp: Date.now(),
    buttons: RPC_BUTTONS,
    instance: false,
  }).catch(() => {});
}

let handlerPatchedForThrottle = false;
function patchHandlerForThrottle() {
  if (handlerPatchedForThrottle) return;
  const original = Handler.prototype.downloadAsync;
  Handler.prototype.downloadAsync = function (url, directory, name, retry, type) {
    const throttleKbps = Number(this.client?.options?.throttleKbps || 0);
    const limitBps = throttleKbps > 0 ? throttleKbps * 1024 : 0;
    let lastChunkTime = Date.now();
    return new Promise((resolve) => {
      const fs = require('fs');
      const path = require('path');
      fs.mkdirSync(directory, { recursive: true });

      const _request = this.baseRequest(url);

      let receivedBytes = 0;
      let totalBytes = 0;

      _request.on('response', (data) => {
        if (data.statusCode === 404) {
          this.client.emit('debug', `[MCLC]: Failed to download ${url} due to: File not found...`);
          return resolve(false);
        }
        totalBytes = parseInt(data.headers['content-length']);
      });

      _request.on('error', async (error) => {
        this.client.emit('debug', `[MCLC]: Failed to download asset to ${path.join(directory, name)} due to\n${error}. Retrying... ${retry}`);
        if (retry) await Handler.prototype.downloadAsync.call(this, url, directory, name, false, type);
        resolve();
      });

      _request.on('data', (data) => {
        receivedBytes += data.length;
        this.client.emit('download-status', {
          name: name,
          type: type,
          current: receivedBytes,
          total: totalBytes,
        });

        if (limitBps > 0) {
          const now = Date.now();
          const elapsed = Math.max(1, now - lastChunkTime);
          const expectedMs = Math.ceil((data.length / limitBps) * 1000);
          const delay = Math.max(0, expectedMs - elapsed);
          lastChunkTime = now + delay;
          if (delay > 0) {
            _request.pause();
            setTimeout(() => _request.resume(), delay);
          }
        }
      });

      const file = require('fs').createWriteStream(path.join(directory, name));
      _request.pipe(file);

      file.once('finish', () => {
        this.client.emit('download', name);
        resolve({ failed: false, asset: null });
      });

      file.on('error', async (e) => {
        this.client.emit('debug', `[MCLC]: Failed to download asset to ${path.join(directory, name)} due to\n${e}. Retrying... ${retry}`);
        if (fs.existsSync(path.join(directory, name))) fs.unlinkSync(path.join(directory, name));
        if (retry) await Handler.prototype.downloadAsync.call(this, url, directory, name, false, type);
        resolve();
      });
    });
  };
  handlerPatchedForThrottle = true;
}

async function installMinecraftVersion(versionNumber) {
  const root = getMinecraftDir();
  const directory = path.join(root, 'versions', versionNumber);
  const cacheDir = path.join(root, 'cache');
  fs.mkdirSync(directory, { recursive: true });

  const options = {
    root,
    version: { number: versionNumber, type: 'release' },
    overrides: {
      url: {
        meta: 'https://launchermeta.mojang.com',
        resource: 'https://resources.download.minecraft.net',
        mavenForge: 'https://files.minecraftforge.net/maven/',
        defaultRepoForge: 'https://libraries.minecraft.net/',
        fallbackMaven: 'https://search.maven.org/remotecontent?filepath=',
      },
      libraryRoot: path.join(root, 'libraries'),
      assetRoot: path.join(root, 'assets'),
      natives: path.join(root, 'natives', versionNumber),
    },
    cache: cacheDir,
  };
  options.directory = directory;

  const fakeClient = {
    options,
    emit: (type, payload) => {
      if (!mainWindow) return;
      if (type === 'progress') mainWindow.webContents.send('minecraft:progress', payload);
      if (type === 'debug') mainWindow.webContents.send('minecraft:log', String(payload));
      if (type === 'download-status') mainWindow.webContents.send('minecraft:status', { status: 'download', payload });
      if (type === 'download') mainWindow.webContents.send('minecraft:log', `[MCLC]: Downloaded ${payload}`);
    },
  };

  patchHandlerForThrottle();
  const handler = new Handler(fakeClient);
  mainWindow && mainWindow.webContents.send('minecraft:status', { status: 'installing', version: versionNumber, step: 'version' });
  await handler.getVersion();
  mainWindow && mainWindow.webContents.send('minecraft:status', { status: 'installing', version: versionNumber, step: 'jar' });
  const jarPath = path.join(directory, `${versionNumber}.jar`);
  if (!fs.existsSync(jarPath)) await handler.getJar();
  mainWindow && mainWindow.webContents.send('minecraft:status', { status: 'installing', version: versionNumber, step: 'natives' });
  await handler.getNatives();
  mainWindow && mainWindow.webContents.send('minecraft:status', { status: 'installing', version: versionNumber, step: 'assets' });
  await handler.getAssets();
  mainWindow && mainWindow.webContents.send('minecraft:status', { status: 'installing', version: versionNumber, step: 'libraries' });
  await handler.getClasses(null);

  return { ok: true };
}

function parseMinecraftVersion(versionStr) {
  // returns {major, minor, patch}
  const m = String(versionStr).match(/^(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return { major: 0, minor: 0, patch: 0 };
  return { major: Number(m[1]), minor: Number(m[2] || 0), patch: Number(m[3] || 0) };
}

function requiredJavaMajorFor(versionStr) {
  const v = parseMinecraftVersion(versionStr);
  // MC 1.20.5+ -> Java 21, MC 1.18+ -> Java 17, older -> Java 8
  if (v.major > 1 || (v.major === 1 && (v.minor > 20 || (v.minor === 20 && v.patch >= 5)))) return 21;
  if (v.major > 1 || (v.major === 1 && v.minor >= 18)) return 17;
  return 8;
}

function getJavaMajor(execPath) {
  try {
    const cp = require('child_process').spawnSync(execPath, ['-version'], { encoding: 'utf8' });
    const out = (cp.stderr || '') + (cp.stdout || '');
    const m = out.match(/version\s+"(\d+)(?:\.(\d+))?/);
    if (m) return Number(m[1]);
  } catch {}
  return 0;
}

function findJavaExecutable(rootDir, mcVersion) {
  const runtimeDir = path.join(rootDir, 'runtime');
  if (!fs.existsSync(runtimeDir)) return undefined;
  /** @type {string | undefined} */
  let javaExeCandidate;
  /** @type {string[]} */
  const stack = [runtimeDir];
  const allCandidates = [];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) break;
    try {
      const items = fs.readdirSync(current, { withFileTypes: true });
      for (const it of items) {
        const p = path.join(current, it.name);
        if (it.isDirectory()) {
          stack.push(p);
        } else if (/^javaw\.exe$/i.test(it.name)) {
          if (p.toLowerCase().includes(path.sep + 'bin' + path.sep)) allCandidates.push(p);
        } else if (/^java\.exe$/i.test(it.name)) {
          if (p.toLowerCase().includes(path.sep + 'bin' + path.sep)) javaExeCandidate = p;
        }
      }
    } catch {
      // ignore permissions
    }
  }
  // Prefer PATH javaw: allow >= for 17, exact for 21, exact for 8
  const required = requiredJavaMajorFor(mcVersion || '');
  const pathJavawMajor = getJavaMajor('javaw');
  if ((required === 17 && pathJavawMajor >= 17) || (required !== 17 && pathJavawMajor === required)) return 'javaw';

  // choose by actual major of candidates
  const majors = allCandidates.map((c) => ({ c, m: getJavaMajor(c) }));
  const pick = () => {
    if (required === 21) return majors.find((x) => x.m === 21)?.c;
    if (required === 17) return (majors.find((x) => x.m === 17)?.c) || (majors.find((x) => x.m === 21)?.c);
    // required === 8
    return majors.find((x) => x.m === 8)?.c;
  };
  const chosen = pick();
  if (chosen) return chosen;
  // last resort
  return javaExeCandidate;
}

ipcMain.handle('minecraft:play', async (event, args) => {
  const { username, version, memoryMb } = args || {};
  const gameDir = getMinecraftDir();
  if (!fs.existsSync(gameDir)) {
    dialog.showErrorBox('Minecraft', `.minecraft bulunamadı: ${gameDir}`);
    return { ok: false, error: '.minecraft bulunamadı' };
  }

  const selectedVersion = version || (listInstalledVersions()[0] || 'latest');
  const saved = loadSettingsFromDisk();
  const initialName = (username && String(username).trim()) || (saved.username && String(saved.username).trim()) || 'OfflineUser';
  const effectiveUsername = sanitizeUsername(initialName);
  const javaMemory = Math.max(1024, Number(memoryMb || 2048));
  // Detect if selectedVersion is a custom (fabric/forge) version and resolve base version
  let baseVersion = selectedVersion;
  const customJsonPath = path.join(gameDir, 'versions', selectedVersion, `${selectedVersion}.json`);
  let isCustom = false;
  if (fs.existsSync(customJsonPath)) {
    try {
      const j = JSON.parse(fs.readFileSync(customJsonPath, 'utf8'));
      if (j && (j.inheritsFrom || j.id !== selectedVersion)) {
        baseVersion = j.inheritsFrom || j.id || selectedVersion;
        isCustom = true;
      }
    } catch {}
  }
  const javaPath = findJavaExecutable(gameDir, baseVersion);
  // Force fresh natives extraction per launch to avoid stale/corrupted DLLs
  const nativesDir = path.join(gameDir, 'natives', `${selectedVersion}-run`);
  try { if (fs.existsSync(nativesDir)) fs.rmSync(nativesDir, { recursive: true, force: true }); } catch {}

  return new Promise((resolve) => {
    const options = {
      authorization: {
        access_token: '0',
        client_token: '0',
        uuid: offlineUuidFromName(effectiveUsername),
        name: effectiveUsername,
        user_properties: {},
        meta: { type: 'mojang' },
      },
      root: gameDir,
      version: { number: baseVersion, type: 'release', custom: isCustom ? selectedVersion : undefined },
      memory: {
        max: `${javaMemory}M`,
        min: '512M',
      },
      overrides: {
        assetIndex: baseVersion,
        natives: nativesDir,
        cwd: gameDir,
      },
    };
    if (javaPath) options.javaPath = javaPath;
    else if (process.platform === 'win32') options.javaPath = 'javaw';

    launcher.launch(options);
    let recentLines = [];
    if (mainWindow) {
      try { mainWindow.hide(); } catch {}
    }
    let inSingleplayer = false;
    let currentWorldName = 'Dünya';
    let currentDim = 'overworld';
    const dimFromNum = (n) => (n === -1 ? 'nether' : n === 1 ? 'end' : 'overworld');
    const dimFromId = (id) => {
      const t = String(id).toLowerCase();
      if (t.includes('the_nether') || t.includes('nether')) return 'nether';
      if (t.includes('the_end') || t.includes('end')) return 'end';
      return 'overworld';
    };
    let lastStrongDimUpdate = 0;
    function updateDim(nextDim, strong) {
      if (nextDim && nextDim !== currentDim) {
        currentDim = nextDim;
        if (inSingleplayer) setRPCSingleplayer(currentWorldName, currentDim, selectedVersion);
      }
      if (strong) lastStrongDimUpdate = Date.now();
    }

    launcher.on('debug', (e) => {
      const line = String(e);
      recentLines.push(line);
      if (recentLines.length > 200) recentLines.shift();
      mainWindow && mainWindow.webContents.send('minecraft:log', line);
    });
    launcher.on('data', (e) => {
      const line = String(e);
      recentLines.push(line);
      if (recentLines.length > 200) recentLines.shift();
      mainWindow && mainWindow.webContents.send('minecraft:log', line);
      // Heuristic: when client reaches menu
      if (/Setting user:|LWJGL|Backend library: LWJGL/.test(line)) {
        setRPCMainMenu(selectedVersion);
      }
      // Singleplayer start: capture world name if present
      const mPrepLevel = line.match(/Preparing level \"(.+?)\"/);
      if (mPrepLevel) {
        currentWorldName = mPrepLevel[1];
        inSingleplayer = true;
        setRPCSingleplayer(currentWorldName, currentDim, selectedVersion);
      }
      if (/Starting integrated minecraft server|Integrated server|Preparing spawn area|Preparing start region|Joining world|Loaded world/.test(line)) {
        if (!inSingleplayer) {
          inSingleplayer = true;
          setRPCSingleplayer(currentWorldName, currentDim, selectedVersion);
        }
      }
      // Multiplayer join/leave
      if (/Connecting to .*,|Channel connected/.test(line)) {
        setRPCMultiplayer(selectedVersion);
      }
      if (/Disconnected from server|Stopping connecting|Lost connection/.test(line)) {
        setRPCMainMenu(selectedVersion);
      }
      // Leaving singleplayer back to menu
      if (/Stopping integrated server|Stopping server/.test(line)) {
        inSingleplayer = false;
        setRPCMainMenu(selectedVersion);
      }
      // Dimension/world detection (various versions) — only while in singleplayer
      if (inSingleplayer) {
        const mSwitch = line.match(/Switching dimension to (-?\d+)/);
        if (mSwitch) {
          updateDim(dimFromNum(Number(mSwitch[1])), true);
        }
        const mChange = line.match(/Changing dimension for .* from (-?\d+) to (-?\d+)/);
        if (mChange) {
          updateDim(dimFromNum(Number(mChange[2])), true);
        }
        const mNew = line.match(/dimension (?:to|set to) minecraft:(the_nether|overworld|the_end)/i);
        if (mNew) {
          updateDim(dimFromId(mNew[1]), true);
        }
        // Weak signals: servers often pre-initialize Nether/End at world start; accept only overworld here
        const mPrepStart = line.match(/Preparing start region for level (-?\d+)/);
        if (mPrepStart) {
          const n = Number(mPrepStart[1]);
          if (n === 0) updateDim('overworld', false);
        }
        const mLoadDim = line.match(/Loading dimension (-?\d+)/);
        if (mLoadDim) {
          const n = Number(mLoadDim[1]);
          // Only consider if overworld and no strong update in the last 3s
          if (n === 0 && Date.now() - lastStrongDimUpdate > 3000) updateDim('overworld', false);
        }
      }
    });
    launcher.on('progress', (e) => mainWindow && mainWindow.webContents.send('minecraft:progress', e));
    launcher.on('close', (code) => {
      mainWindow && mainWindow.webContents.send('minecraft:status', { status: 'closed', code });
      setRPCIdle();
      if (code && Number(code) !== 0) {
        try {
          const tail = recentLines.slice(-30).join('\n');
          dialog.showErrorBox('Minecraft', `Oyun beklenmedik şekilde kapandı. Çıkış kodu: ${code}\n\nSon çıktılar:\n${tail}`);
        } catch {}
      }
      if (mainWindow) {
        try { mainWindow.show(); mainWindow.focus(); } catch {}
      }
      resolve({ ok: true, code });
    });
    launcher.on('error', (err) => {
      mainWindow && mainWindow.webContents.send('minecraft:status', { status: 'error', message: String(err) });
      if (mainWindow) {
        try { mainWindow.show(); mainWindow.focus(); } catch {}
      }
    });
  });
});

ipcMain.handle('minecraft:install', async (event, args) => {
  try {
    const version = args?.version;
    const throttleKbps = Number(args?.throttleKbps || 0);
    const customName = (args?.name || '').trim();
    if (!version) return { ok: false, error: 'Sürüm belirtilmedi' };
    // Pass throttle to handler through client options
    const prev = launcher.options;
    (launcher.options || (launcher.options = {})).throttleKbps = throttleKbps;
    const result = await installMinecraftVersion(version);
    if (prev) launcher.options.throttleKbps = prev.throttleKbps;
    if (result.ok) {
      if (customName) setVersionDisplayName(version, customName);
      mainWindow && mainWindow.webContents.send('minecraft:status', { status: 'installed', version });
      return { ok: true };
    }
    return result;
  } catch (e) {
    return { ok: false, error: String(e) };
  }
});


