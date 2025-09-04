const dirEl = document.getElementById('mcDir');
const versionsEl = document.getElementById('versions');
const playBtn = document.getElementById('play');
const installBtn = document.getElementById('install');
const logEl = document.getElementById('log');
const usernameEl = document.getElementById('username');
const memoryEl = document.getElementById('memory');
const toggleLogsBtn = document.getElementById('toggleLogs');
const logPanel = document.getElementById('logPanel');
const tabPlay = document.getElementById('tabPlay');
const tabInstall = document.getElementById('tabInstall');
const viewPlay = document.getElementById('viewPlay');
const viewInstall = document.getElementById('viewInstall');
const installNameEl = document.getElementById('installName');
const installVersionEl = document.getElementById('installVersion');
const installDoBtn = document.getElementById('installDo');
const installThrottleEl = document.getElementById('installThrottle');
const installToast = document.getElementById('installToast');
const installProgressWrap = document.getElementById('installProgressWrap');
const installProgress = document.getElementById('installProgress');
const bytesStats = document.getElementById('bytesStats');
const speedStats = document.getElementById('speedStats');
const installDoneBtn = document.getElementById('installDone');

function appendLog(line) {
  logEl.textContent += `${line}\n`;
  logEl.scrollTop = logEl.scrollHeight;
}

async function init() {
  // restore saved username and memory from settings.pifo
  try {
    const s = await window.launcher.loadSettings();
    if (s && typeof s.username === 'string') usernameEl.value = s.username;
    if (s && (typeof s.memoryMb === 'number' || typeof s.memoryMb === 'string')) {
      const v = Number(s.memoryMb);
      if (!Number.isNaN(v)) memoryEl.value = String(v);
    }
  } catch {}

  const dir = await window.launcher.getDir();
  dirEl.textContent = dir;
  const versions = await window.launcher.listVersions();
  versionsEl.innerHTML = '';
  const names = await window.launcher.getVersionNames();
  for (const v of versions) {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = names[v] ? names[v] : v;
    versionsEl.appendChild(opt);
  }
  // Load all Mojang versions for Installations
  const all = await window.launcher.listAllVersions();
  installVersionEl.innerHTML = '';
  for (const item of all) {
    const opt = document.createElement('option');
    opt.value = item.id;
    opt.textContent = `${item.id} (${item.type})`;
    installVersionEl.appendChild(opt);
  }
}

window.launcher.onLog((m) => appendLog(m));
window.launcher.onProgress((p) => appendLog(`İndirme: ${p.task} ${p.total ?? ''}`));
let downloadTotals = { total: 0, current: 0 };
let lastTick = Date.now();
let lastBytes = 0;

window.launcher.onStatus(async (s) => {
  appendLog(`Durum: ${JSON.stringify(s)}`);
  if (s && s.status === 'installed') {
    const versions = await window.launcher.listVersions();
    versionsEl.innerHTML = '';
    for (const v of versions) {
      const opt = document.createElement('option');
      opt.value = v;
      opt.textContent = v;
      versionsEl.appendChild(opt);
    }
    // Show completion
    installDoneBtn.classList.remove('hidden');
    installProgressWrap.classList.remove('hidden');
    installProgress.style.setProperty('--w', '100%');
    bytesStats.textContent = 'Tamamlandı';
    speedStats.textContent = '';
  }
  if (s && s.status === 'download' && s.payload) {
    const { current, total } = s.payload;
    if (Number.isFinite(total) && total > 0) {
      downloadTotals.total = total;
      downloadTotals.current = current;
      const pct = Math.min(100, Math.max(0, (current / total) * 100));
      installProgressWrap.classList.remove('hidden');
      installProgress.style.setProperty('--w', pct + '%');
      const now = Date.now();
      const dt = Math.max(1, now - lastTick);
      const bytesDelta = Math.max(0, current - lastBytes);
      const bps = (bytesDelta * 1000) / dt;
      lastTick = now;
      lastBytes = current;
      bytesStats.textContent = `${formatBytes(current)} / ${formatBytes(total)}`;
      speedStats.textContent = `${formatBytes(bps)}/s`;
    }
  }
});

toggleLogsBtn.addEventListener('click', () => {
  const hidden = logPanel.classList.toggle('hidden');
  toggleLogsBtn.textContent = hidden ? 'Günlükleri Göster' : 'Günlükleri Gizle';
});

// persist username and memory on change to settings.pifo
async function persistSettings() {
  try {
    const username = usernameEl.value || '';
    const memoryMb = Number(memoryEl.value || '');
    await window.launcher.saveSettings({ username, memoryMb });
  } catch {}
}
usernameEl.addEventListener('input', persistSettings);
memoryEl.addEventListener('input', persistSettings);

function setActiveTab(tab) {
  if (tab === 'play') {
    tabPlay.classList.add('active');
    tabInstall.classList.remove('active');
    viewPlay.classList.remove('hidden');
    viewInstall.classList.add('hidden');
  } else {
    tabInstall.classList.add('active');
    tabPlay.classList.remove('active');
    viewInstall.classList.remove('hidden');
    viewPlay.classList.add('hidden');
  }
}

tabPlay.addEventListener('click', () => setActiveTab('play'));
tabInstall.addEventListener('click', () => setActiveTab('install'));

playBtn.addEventListener('click', async () => {
  appendLog('Başlatılıyor...');
  const result = await window.launcher.play({
    username: usernameEl.value || 'Player',
    version: versionsEl.value,
    memoryMb: Number(memoryEl.value || '2048'),
  });
  if (!result?.ok) appendLog(`Hata: ${result?.error || 'Bilinmeyen'}`);
});

installBtn.addEventListener('click', async () => {
  const version = versionsEl.value;
  appendLog(`Sürüm indiriliyor/kuruluyor: ${version}`);
  const res = await window.launcher.install({ version });
  if (!res?.ok) appendLog(`İndirme/Kurulum hatası: ${res?.error || 'Bilinmeyen'}`);
  else appendLog('İndirme/Kurulum tamamlandı.');
});

installDoBtn.addEventListener('click', async () => {
  const version = installVersionEl.value;
  const name = installNameEl.value?.trim();
  appendLog(`Kurulum başlıyor: ${name ? name + ' -> ' : ''}${version}`);
  showToast();
  const throttleKbps = Number(installThrottleEl.value || '0');
  const res = await window.launcher.install({ version, throttleKbps, name });
  if (!res?.ok) appendLog(`Kurulum hatası: ${res?.error || 'Bilinmeyen'}`);
  else appendLog('Kurulum tamamlandı.');
});

function showToast() {
  installToast.classList.remove('hidden');
  installToast.style.opacity = '1';
  setTimeout(() => {
    installToast.style.transition = 'opacity 1.5s ease';
    installToast.style.opacity = '0';
    setTimeout(() => installToast.classList.add('hidden'), 1600);
  }, 5000);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

init();


