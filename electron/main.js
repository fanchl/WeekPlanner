const { app, BrowserWindow, dialog, globalShortcut, ipcMain, screen } = require('electron');
const fs = require('fs/promises');
const path = require('path');

let mainWindow = null;
let quickAddWindow = null;
const QUICK_ADD_SHORTCUT = 'CommandOrControl+Shift+Space';
const DESKTOP_LOG_FILE = path.join(app.getPath('temp'), 'weekplanner-desktop.log');
const QUICK_ADD_POSITIONS_FILE = path.join(app.getPath('userData'), 'quick-add-positions.json');
let quickAddPositions = {};
let quickAddPositionSaveTimer = null;

const logDesktopEvent = async (message, error) => {
  const lines = [`[${new Date().toISOString()}] ${message}`];
  if (error) {
    const detail =
      error instanceof Error ? `${error.name}: ${error.message}\n${error.stack ?? ''}` : String(error);
    lines.push(detail);
  }
  try {
    await fs.appendFile(DESKTOP_LOG_FILE, `${lines.join('\n')}\n`, 'utf8');
  } catch (_writeError) {
    // Logging should never take down the app.
  }
};

const createWindow = async ({ show = true } = {}) => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1100,
    minHeight: 760,
    show,
    autoHideMenuBar: true,
    backgroundColor: '#0c0c12',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadFile(path.join(__dirname, '..', 'build', 'index.html'));
};

const ensureMainWindow = async ({ show = false } = {}) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (show) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.show();
      mainWindow.focus();
    }
    return mainWindow;
  }
  await createWindow({ show });
  return mainWindow;
};

const showMainWindow = async () => {
  const window = await ensureMainWindow({ show: true });
  if (window.isMinimized()) {
    window.restore();
  }
  window.show();
  window.focus();
  return window;
};

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const getQuickAddDefaultPosition = (display, windowWidth) => {
  const { x: workX, y: workY, width: workWidth, height: workHeight } = display.workArea;
  const x = Math.round(workX + (workWidth - windowWidth) / 2);
  const topOffset = Math.round(Math.max(72, Math.min(140, workHeight * 0.14)));
  const y = Math.round(workY + topOffset);
  return { x, y };
};

const scheduleQuickAddPositionsSave = () => {
  if (quickAddPositionSaveTimer) {
    clearTimeout(quickAddPositionSaveTimer);
  }

  quickAddPositionSaveTimer = setTimeout(async () => {
    quickAddPositionSaveTimer = null;
    try {
      await fs.mkdir(path.dirname(QUICK_ADD_POSITIONS_FILE), { recursive: true });
      await fs.writeFile(QUICK_ADD_POSITIONS_FILE, JSON.stringify(quickAddPositions, null, 2), 'utf8');
    } catch (error) {
      await logDesktopEvent('Failed to save quick add positions', error);
    }
  }, 120);
};

const loadQuickAddPositions = async () => {
  try {
    const content = await fs.readFile(QUICK_ADD_POSITIONS_FILE, 'utf8');
    const parsed = JSON.parse(content);
    quickAddPositions = parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    if (error && error.code !== 'ENOENT') {
      await logDesktopEvent('Failed to load quick add positions', error);
    }
    quickAddPositions = {};
  }
};

const persistQuickAddPosition = () => {
  if (!quickAddWindow || quickAddWindow.isDestroyed()) {
    return;
  }

  const bounds = quickAddWindow.getBounds();
  const display = screen.getDisplayMatching(bounds);
  const { x: workX, y: workY, width: workWidth, height: workHeight } = display.workArea;

  quickAddPositions[String(display.id)] = {
    offsetX: clamp(bounds.x - workX, 0, Math.max(0, workWidth - bounds.width)),
    offsetY: clamp(bounds.y - workY, 0, Math.max(0, workHeight - bounds.height))
  };

  scheduleQuickAddPositionsSave();
};

const positionQuickAddWindow = () => {
  if (!quickAddWindow || quickAddWindow.isDestroyed()) {
    return;
  }

  const cursorPoint = screen.getCursorScreenPoint();
  const display = screen.getDisplayNearestPoint(cursorPoint);
  const { x: workX, y: workY, width: workWidth, height: workHeight } = display.workArea;
  const [windowWidth, windowHeight] = quickAddWindow.getSize();
  const savedPosition = quickAddPositions[String(display.id)];
  const defaultPosition = getQuickAddDefaultPosition(display, windowWidth);
  const x = savedPosition
    ? workX + clamp(savedPosition.offsetX, 0, Math.max(0, workWidth - windowWidth))
    : defaultPosition.x;
  const y = savedPosition
    ? workY + clamp(savedPosition.offsetY, 0, Math.max(0, workHeight - windowHeight))
    : defaultPosition.y;

  quickAddWindow.setPosition(x, y, false);
};

const ensureQuickAddWindow = async () => {
  if (quickAddWindow && !quickAddWindow.isDestroyed()) {
    return quickAddWindow;
  }

  quickAddWindow = new BrowserWindow({
    width: 640,
    height: 64,
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    movable: true,
    focusable: true,
    show: false,
    paintWhenInitiallyHidden: true,
    frame: false,
    transparent: false,
    type: process.platform === 'darwin' ? 'panel' : undefined,
    hasShadow: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hiddenInMissionControl: true,
    backgroundColor: '#2c2c31',
    webPreferences: {
      preload: path.join(__dirname, 'quick-add-preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Keep the quick-add bar above normal windows, but avoid workspace-level
  // forcing. That behavior is unstable on newer macOS/Electron builds and
  // can leave the app running without any visible window.
  quickAddWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  quickAddWindow.setVisibleOnAllWorkspaces(true, {
    visibleOnFullScreen: true
  });
  quickAddWindow.setHiddenInMissionControl(false);
  quickAddWindow.on('moved', () => {
    persistQuickAddPosition();
  });

  quickAddWindow.on('blur', () => {
    if (quickAddWindow && !quickAddWindow.isDestroyed()) {
      quickAddWindow.hide();
    }
  });

  quickAddWindow.on('closed', () => {
    quickAddWindow = null;
  });

  quickAddWindow.webContents.on('render-process-gone', async (_event, details) => {
    await logDesktopEvent(`Quick add renderer gone: ${details.reason}`);
  });

  await quickAddWindow.loadFile(path.join(__dirname, 'quick-add.html'));
  return quickAddWindow;
};

const showQuickAddWindow = async () => {
  try {
    await ensureMainWindow({ show: false });
    await ensureQuickAddWindow();

    positionQuickAddWindow();
    quickAddWindow.webContents.send('quick-add:reset');
    quickAddWindow.show();
    quickAddWindow.moveTop();
    quickAddWindow.focus();
    quickAddWindow.webContents.focus();
    quickAddWindow.webContents.send('quick-add:focus-input');

    setTimeout(() => {
      if (!quickAddWindow || quickAddWindow.isDestroyed() || !quickAddWindow.isVisible()) {
        return;
      }

      if (quickAddWindow.isFocused()) {
        return;
      }

      if (process.platform === 'darwin') {
        app.focus({ steal: true });
      }
      if (mainWindow && !mainWindow.isDestroyed() && mainWindow.isFocused()) {
        mainWindow.blur();
      }
      quickAddWindow.moveTop();
      quickAddWindow.focus();
      quickAddWindow.webContents.focus();
      quickAddWindow.webContents.send('quick-add:focus-input');
    }, 80);
  } catch (error) {
    await logDesktopEvent('Failed to show quick add window', error);
    if (quickAddWindow && !quickAddWindow.isDestroyed()) {
      quickAddWindow.destroy();
    }
    quickAddWindow = null;
  }
};

const registerShortcuts = () => {
  globalShortcut.unregisterAll();
  globalShortcut.register(QUICK_ADD_SHORTCUT, () => {
    void showQuickAddWindow();
  });
};

ipcMain.handle('dialog:open-markdown', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  });

  if (result.canceled || !result.filePaths[0]) return null;

  const filePath = result.filePaths[0];
  const content = await fs.readFile(filePath, 'utf8');
  return {
    filePath,
    name: path.basename(filePath),
    content
  };
});

ipcMain.handle('fs:write-markdown', async (_event, payload) => {
  if (!payload?.filePath) {
    throw new Error('Missing filePath');
  }

  await fs.mkdir(path.dirname(payload.filePath), { recursive: true });
  await fs.writeFile(payload.filePath, payload.content ?? '', 'utf8');
  return { ok: true };
});

ipcMain.handle('dialog:save-markdown', async (_event, payload) => {
  const result = await dialog.showSaveDialog(mainWindow, {
    defaultPath: payload?.defaultName || 'weekplanner.md',
    filters: [{ name: 'Markdown', extensions: ['md'] }]
  });

  if (result.canceled || !result.filePath) return null;

  await fs.mkdir(path.dirname(result.filePath), { recursive: true });
  await fs.writeFile(result.filePath, payload?.content ?? '', 'utf8');
  return {
    filePath: result.filePath,
    name: path.basename(result.filePath)
  };
});

ipcMain.handle('quick-add:submit', async (_event, payload) => {
  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!text) return { ok: false };

  const window = await ensureMainWindow({ show: false });
  window.webContents.send('quick-add:create', { text });

  if (quickAddWindow && !quickAddWindow.isDestroyed()) {
    quickAddWindow.hide();
  }

  return { ok: true };
});

ipcMain.on('quick-add:close', () => {
  if (quickAddWindow && !quickAddWindow.isDestroyed()) {
    quickAddWindow.hide();
  }
});

app.whenReady().then(async () => {
  await loadQuickAddPositions();
  await createWindow();
  await ensureQuickAddWindow();
  registerShortcuts();

  app.on('activate', async () => {
    await showMainWindow();
  });
});

process.on('uncaughtException', async (error) => {
  await logDesktopEvent('Main process uncaught exception', error);
});

process.on('unhandledRejection', async (reason) => {
  await logDesktopEvent('Main process unhandled rejection', reason);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});
