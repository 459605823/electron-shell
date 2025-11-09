const { app, BrowserWindow, ipcMain, shell, powerSaveBlocker, globalShortcut, screen } = require('electron');
const path = require('path');
const fs = require('fs');
const http = require('http');
const https = require('https');

let win;
let keepAwakeId = null;
let allowClose = false;
let retryTimer = null;

// 提前设置 AppUserModelID（Windows：用于任务栏、通知、快捷方式等）
try {
  app.setAppUserModelId('com.example.bigscreen');
} catch {}

// 读取配置（按层合并，打包后可在安装目录外部修改）：
// 1) defaults -> 2) config.json -> 3) config.{env}.json -> 4) config.local.json
// env 获取优先级：--env 参数 > APP_ENV > NODE_ENV > app.isPackaged 推断
//
// 配置文件查找策略：
// - 开发模式：从项目根目录读取
// - 打包后：优先从 exe 同目录读取外部配置，若不存在则回退到 asar 内部（只读）
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
    openDevTools: false,
    // 启动前等待服务就绪配置
    waitForServiceReady: true,
    waitForServiceMaxSeconds: 120,
    waitForServiceCheckInterval: 3
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

  // 获取配置文件所在目录：
  // - 打包后：exe 同级目录（允许用户修改）
  // - 开发中：项目根目录
  function getConfigDir() {
    if (app.isPackaged) {
      // 打包后：优先从 exe 所在目录读取外部配置
      // path.dirname(app.getPath('exe')) 是 exe 文件所在目录
      return path.dirname(app.getPath('exe'));
    } else {
      // 开发模式：从项目根目录
      return __dirname;
    }
  }

  function readJsonSafe(filename) {
    const externalPath = path.join(getConfigDir(), filename);
    const internalPath = path.join(__dirname, filename);

    // 优先读取外部配置（打包后可修改）
    try {
      if (fs.existsSync(externalPath)) {
        const content = JSON.parse(fs.readFileSync(externalPath, 'utf-8'));
        console.log(`已加载配置: ${externalPath}`);
        return content;
      }
    } catch (e) {
      console.error('读取外部配置失败：', externalPath, e);
    }

    // 回退到内部配置（asar 内或开发目录）
    try {
      if (fs.existsSync(internalPath)) {
        const content = JSON.parse(fs.readFileSync(internalPath, 'utf-8'));
        if (app.isPackaged) {
          console.log(`使用内置配置: ${filename} (提示: 可在 exe 同目录创建该文件以覆盖)`);
        }
        return content;
      }
    } catch (e) {
      console.error('读取内部配置失败：', internalPath, e);
    }

    return null;
  }

  const base = readJsonSafe('config.json') || {};
  const envCfg = readJsonSafe(`config.${runtimeEnv}.json`) || {};
  const local = readJsonSafe('config.local.json') || {};

  const merged = { ...defaults, ...base, ...envCfg, ...local };

  // 打印最终加载的 URL 便于调试
  if (merged.url) {
    console.log(`大屏 URL: ${merged.url}`);
  }

  return merged;
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

// ============ 启动前服务检查功能 ============

/**
 * 检查 URL 是否可访问
 * @param {string} url 要检查的 URL
 * @param {number} timeoutMs 单次请求超时时间（毫秒）
 * @returns {Promise<boolean>}
 */
function checkUrlAvailable(url, timeoutMs = 3000) {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const client = urlObj.protocol === 'https:' ? https : http;

      const req = client.get(url, { timeout: timeoutMs }, (res) => {
        // 任何 HTTP 响应都认为服务可用（包括 404、500 等）
        // 这样可以确保即使返回错误页面，也说明服务器在运行
        const isAvailable = res.statusCode >= 200 && res.statusCode < 600;
        resolve(isAvailable);
        req.destroy();
      });

      req.on('error', (err) => {
        console.log(`  [检查] 连接失败: ${err.code || err.message}`);
        resolve(false);
      });

      req.on('timeout', () => {
        console.log(`  [检查] 请求超时`);
        req.destroy();
        resolve(false);
      });
    } catch (e) {
      console.log(`  [检查] URL 解析错误: ${e.message}`);
      resolve(false);
    }
  });
}

/**
 * 等待大屏服务就绪
 * @param {string} url 大屏服务 URL
 * @param {number} maxWaitSeconds 最长等待时间（秒）
 * @param {number} checkIntervalSeconds 检查间隔（秒）
 * @returns {Promise<boolean>} 服务是否就绪
 */
async function waitForServiceReady(url, maxWaitSeconds = 120, checkIntervalSeconds = 3) {
  console.log('\n========================================');
  console.log('启动前服务检查');
  console.log('========================================');
  console.log(`目标服务: ${url}`);
  console.log(`最长等待: ${maxWaitSeconds} 秒`);
  console.log(`检查间隔: ${checkIntervalSeconds} 秒`);
  console.log('----------------------------------------\n');

  const startTime = Date.now();
  let attemptCount = 0;

  while (true) {
    attemptCount++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    console.log(`[尝试 ${attemptCount}] 检查服务状态... (已等待 ${elapsed} 秒)`);

    const isReady = await checkUrlAvailable(url);

    if (isReady) {
      console.log(`\n✓ 大屏服务已就绪！`);
      console.log(`  - 尝试次数: ${attemptCount}`);
      console.log(`  - 等待时间: ${elapsed} 秒`);
      console.log('========================================\n');
      return true;
    }

    // 检查是否超时
    if (elapsed >= maxWaitSeconds) {
      console.log(`\n✗ 等待超时 (${maxWaitSeconds} 秒)`);
      console.log(`  应用将继续启动，但可能显示离线页面`);
      console.log(`  应用内置了自动重试机制，稍后会自动加载内容`);
      console.log('========================================\n');
      return false;
    }

    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, checkIntervalSeconds * 1000));
  }
}

app.whenReady().then(async () => {
  setupAutoLaunch();
  setupExitHotkey();
  setupKeepAwake();

  // 启动前等待大屏服务就绪
  if (cfg.waitForServiceReady !== false) {
    console.log('启用了服务就绪检查，开始等待...\n');
    const maxWait = cfg.waitForServiceMaxSeconds || 120;
    const checkInterval = cfg.waitForServiceCheckInterval || 3;
    await waitForServiceReady(cfg.url, maxWait, checkInterval);
  } else {
    console.log('服务就绪检查已禁用，直接启动窗口\n');
  }

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