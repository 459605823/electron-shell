const { app, BrowserWindow, ipcMain, shell, powerSaveBlocker, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');

let win;
let keepAwakeId = null;
let allowClose = false;
let retryTimer = null;

// 提前设置 AppUserModelID（Windows：用于任务栏、通知、快捷方式等）
try {
  app.setAppUserModelId('com.example.bigscreen');
} catch {}

// 读取配置（按层合并）：
// 1) defaults -> 2) config.json -> 3) config.{env}.json -> 4) config.local.json
// env 获取优先级：--env 参数 > APP_ENV > NODE_ENV > app.isPackaged 推断
function loadConfig() {
  const defaults = {
    url: process.env.BIGSCREEN_URL || "https://example.com/your-bigscreen",
    autoLaunch: true,
    kiosk: true,
    fullscreen: true,
    alwaysOnTop: true,
    keepAwake: true,
    reloadOnFailSeconds: 10,
    exitHotkey: "Ctrl+Shift+Q",
    displayIndex: 0,
    zoomFactor: 1.0,
    userAgentAppend: " BigScreenContainer/1.0",
    openDevTools: false
  };

  const argv = process.argv.slice(1);
  const envFromArg = (() => {
    const i = argv.findIndex(a => a === '--env' || a.startsWith('--env='));
    if (i === -1) return null;
    if (argv[i].startsWith('--env=')) return argv[i].split('=')[1];
    return argv[i + 1] || null;
  })();
  const runtimeEnv = String(
    envFromArg || process.env.APP_ENV || process.env.NODE_ENV || (app.isPackaged ? 'production' : 'development')
  ).toLowerCase();

  function readJsonSafe(p) {
    try {
      if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf-8'));
    } catch (e) {
      console.error('读取配置失败：', p, e);
    }
    return null;
  }

  const base = readJsonSafe(path.join(__dirname, 'config.json')) || {};
  const envCfg = readJsonSafe(path.join(__dirname, `config.${runtimeEnv}.json`)) || {};
  const local = readJsonSafe(path.join(__dirname, 'config.local.json')) || {};

  return { ...defaults, ...base, ...envCfg, ...local };
}

const cfg = loadConfig();

// 调试开关：
// - 配置项 cfg.openDevTools: 启动时自动打开 DevTools
// - 命令行参数 --devtools 或环境变量 OPEN_DEVTOOLS=1: 允许使用 DevTools（并提供快捷键 F12 / Ctrl+Shift+I 切换）
const argv = process.argv.slice(1);
const debugEnabled = !!(
  cfg.openDevTools ||
  process.env.NODE_ENV === 'development' ||
  argv.includes('--devtools') ||
  process.env.OPEN_DEVTOOLS === '1'
);

// 单实例锁，避免多开
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });
}

// 开机自启（Windows/macOS）
function setupAutoLaunch() {
  if (!cfg.autoLaunch) return;
  try {
    app.setLoginItemSettings({
      openAtLogin: true,
      openAsHidden: true,
      args: []
    });
  } catch (e) {
    console.error('设置开机自启失败：', e);
  }
}

// 注册退出热键（默认 Ctrl+Shift+Q）
function setupExitHotkey() {
  if (!cfg.exitHotkey) return;
  try {
    globalShortcut.register(cfg.exitHotkey, () => {
      allowClose = true;
      app.quit();
    });
  } catch (e) {
    console.error(`注册退出热键失败 (${cfg.exitHotkey})：`, e);
  }
}

// 保持唤醒（阻止息屏）
function setupKeepAwake() {
  if (!cfg.keepAwake) return;
  try {
    keepAwakeId = powerSaveBlocker.start('prevent-display-sleep');
  } catch (e) {
    console.error('设置防休眠失败：', e);
  }
}

function clearRetryTimer() {
  if (retryTimer) {
    clearTimeout(retryTimer);
    retryTimer = null;
  }
}

function scheduleReload() {
  clearRetryTimer();
  if (cfg.reloadOnFailSeconds > 0) {
    retryTimer = setTimeout(() => {
      loadTargetURL();
    }, cfg.reloadOnFailSeconds * 1000);
  }
}

function getDisplayBoundsForIndex(index) {
  const displays = screen.getAllDisplays();
  const safeIndex = Math.max(0, Math.min(index, displays.length - 1));
  return displays[safeIndex].bounds;
}

function createWindow() {
  const bounds = getDisplayBoundsForIndex(cfg.displayIndex);

  win = new BrowserWindow({
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    backgroundColor: '#000000',
    show: false,
    fullscreen: !!cfg.fullscreen,
    kiosk: !!cfg.kiosk,
    alwaysOnTop: !!cfg.alwaysOnTop,
    autoHideMenuBar: true,
    fullscreenable: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // 仅在启用调试时允许 DevTools
      devTools: debugEnabled,
      spellcheck: false,
      backgroundThrottling: false
    }
  });

  // 禁止页面缩放（Ctrl+/Pinch）
  win.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});
  if (typeof cfg.zoomFactor === 'number' && cfg.zoomFactor > 0) {
    win.webContents.setZoomFactor(cfg.zoomFactor);
  }

  // 追加 UA 标识
  if (cfg.userAgentAppend) {
    const ua = win.webContents.getUserAgent() + cfg.userAgentAppend;
    win.webContents.setUserAgent(ua);
  }

  // 限制导航：仅允许在目标站点内导航，其它使用系统浏览器打开
  const targetOrigin = (() => {
    try {
      return new URL(cfg.url).origin;
    } catch {
      return '';
    }
  })();

  win.webContents.on('will-navigate', (event, url) => {
    if (!targetOrigin) return;
    if (!url.startsWith(targetOrigin)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  win.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
    if (!isMainFrame) return;
    console.error('加载失败：', code, desc);
    loadOffline();
    scheduleReload();
  });

  win.on('unresponsive', () => {
    console.error('渲染线程无响应，计划重载');
    scheduleReload();
  });

  win.webContents.on('render-process-gone', (_e, details) => {
    console.error('渲染进程退出：', details);
    scheduleReload();
  });

  // 拦截常见退出按键（Alt+F4/Ctrl+W等），仅允许配置的退出热键
  win.webContents.on('before-input-event', (event, input) => {
    const altF4 = input.type === 'keyDown' && input.key === 'F4' && input.alt;
    const ctrlW = input.type === 'keyDown' && (input.code === 'KeyW' || input.key === 'w') && (input.control || input.meta);
    if (altF4 || ctrlW) {
      event.preventDefault();
    }
  });

  win.on('close', (e) => {
    if (!allowClose) {
      e.preventDefault();
    }
  });

  win.once('ready-to-show', () => {
    win.show();
    // 启动即打开 DevTools：仅当配置 openDevTools 为 true，或显式传入 --open-devtools 时
    if (cfg.openDevTools || argv.includes('--open-devtools')) {
      try { win.webContents.openDevTools({ mode: 'detach' }); } catch {}
    }
  });

  loadTargetURL();
}

// 注册调试快捷键（仅在 debugEnabled 时启用）
function setupDebugHotkeys() {
  if (!debugEnabled) return;
  try {
    globalShortcut.register('F12', () => {
      if (win && !win.isDestroyed()) win.webContents.toggleDevTools();
    });
  } catch (e) {
    console.error('注册 F12 调试热键失败：', e);
  }
  try {
    globalShortcut.register('Control+Shift+I', () => {
      if (win && !win.isDestroyed()) win.webContents.toggleDevTools();
    });
  } catch (e) {
    console.error('注册 Ctrl+Shift+I 调试热键失败：', e);
  }
}

function loadTargetURL() {
  clearRetryTimer();
  if (!win) return;
  try {
    win.loadURL(cfg.url, {
      userAgent: win.webContents.getUserAgent()
    });
  } catch (e) {
    console.error('loadURL 出错：', e);
    loadOffline();
    scheduleReload();
  }
}

function loadOffline() {
  if (!win) return;
  const offlinePath = path.join(__dirname, 'offline.html');
  if (fs.existsSync(offlinePath)) {
    win.loadFile('offline.html');
  } else {
    win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent('<!doctype html><title>Offline</title><style>html,body{background:#000;color:#fff;height:100%;display:flex;align-items:center;justify-content:center;margin:0;font:16px/1.6 system-ui,Segoe UI,Arial}</style><div>正在尝试连接大屏…</div>'));
  }
}

// 供离线页触发重试
ipcMain.handle('reload-remote', () => {
  loadTargetURL();
  return true;
});

app.whenReady().then(() => {
  setupAutoLaunch();
  setupExitHotkey();
  setupKeepAwake();
  createWindow();
  setupDebugHotkeys();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  // 展厅场景通常不退出
});

app.on('before-quit', () => {
  allowClose = true;
  if (keepAwakeId !== null && powerSaveBlocker.isStarted(keepAwakeId)) {
    powerSaveBlocker.stop(keepAwakeId);
  }
  globalShortcut.unregisterAll();
});