import path from 'node:path';
import process from 'node:process';
import { app, BrowserWindow, ipcMain } from 'electron';
import { getSaveSummary, loadGame, saveGame } from './persistence';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const resolveRendererEntry = (): { type: 'url' | 'file'; value: string } => {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (isDev && devServerUrl) {
    return { type: 'url', value: devServerUrl };
  }

  const indexFile = path.resolve(__dirname, '../ui/dist/index.html');
  return { type: 'file', value: indexFile };
};

const createWindow = async (): Promise<void> => {
  const { type, value } = resolveRendererEntry();
  const iconPath = path.resolve(__dirname, '../../assets/logo.png');
  const window = new BrowserWindow({
    width: 1280,
    height: 720,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: path.resolve(__dirname, 'preload.js')
    }
  });

  window.once('ready-to-show', () => window.show());

  if (type === 'url') {
    await window.loadURL(value);
    window.webContents.openDevTools({ mode: 'detach' });
  } else {
    await window.loadFile(value);
  }
};

const registerAppLifecycle = (): void => {
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
    }
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
};

const registerIpcHandlers = (): void => {
  ipcMain.handle('sjSim:saveGame', (_event, payload) => {
    saveGame(payload);
  });
  ipcMain.handle('sjSim:loadGame', () => loadGame());
  ipcMain.handle('sjSim:getSaveSummary', () => getSaveSummary());
};

app
  .whenReady()
  .then(async () => {
    registerAppLifecycle();
    registerIpcHandlers();
    await createWindow();
  })
  .catch((error) => {
    console.error('[electron] Failed to launch main window', error);
    app.quit();
  });
