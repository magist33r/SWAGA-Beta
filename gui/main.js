const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const CONFIG_NAME = 'vip-gui.json';
const DEFAULT_CONFIG = {
  apiBaseUrl: 'http://127.0.0.1:8787',
  apiToken: '',
  theme: 'light',
};

function getConfigPath() {
  return path.join(app.getPath('userData'), CONFIG_NAME);
}

async function loadConfig() {
  const configPath = getConfigPath();
  try {
    const raw = await fs.readFile(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      apiBaseUrl: String(parsed.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl),
      apiToken: String(parsed.apiToken || ''),
      theme: parsed.theme === 'dark' ? 'dark' : 'light',
    };
  } catch (err) {
    return { ...DEFAULT_CONFIG };
  }
}

async function saveConfig(data) {
  const configPath = getConfigPath();
  const sanitized = {
    apiBaseUrl: String(data.apiBaseUrl || DEFAULT_CONFIG.apiBaseUrl),
    apiToken: String(data.apiToken || ''),
    theme: data.theme === 'dark' ? 'dark' : 'light',
  };
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, `${JSON.stringify(sanitized, null, 2)}\n`, 'utf8');
  return sanitized;
}

function createWindow(theme = 'light') {
  const backgroundColor = theme === 'dark' ? '#0f131a' : '#f6f2e8';
  const win = new BrowserWindow({
    width: 1200,
    height: 820,
    minWidth: 980,
    minHeight: 700,
    backgroundColor,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (!app.isPackaged) {
    const devServer = process.env.VITE_DEV_SERVER_URL || 'http://localhost:5173';
    win.loadURL(devServer);
  } else {
    win.loadFile(path.join(__dirname, 'renderer', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  const config = await loadConfig();
  createWindow(config.theme);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow(config.theme);
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('config:get', async () => {
  const config = await loadConfig();
  return { config, path: getConfigPath() };
});

ipcMain.handle('config:save', async (event, data) => {
  const config = await saveConfig(data || {});
  return { config, path: getConfigPath() };
});
