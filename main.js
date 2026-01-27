/**
 * 大屏容器应用 - 主入口文件
 * 重构版本：模块化架构，支持多项目复用
 */

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');

// 导入模块
const { loadConfig } = require('./src/config/loader');
const { validateConfig } = require('./src/config/validator');
const { logger, LogLevel } = require('./src/utils/logger');
const WindowManager = require('./src/window/manager');
const SystemIntegration = require('./src/system/integration');
const { waitForServiceReady } = require('./src/network/checker');

// 全局实例
let windowManager = null;
let systemIntegration = null;
let config = null;

// 提前设置 AppUserModelID（Windows：用于任务栏、通知、快捷方式等）
try {
  app.setAppUserModelId('com.electron.shell');
} catch (e) {
  // 忽略错误
}

// 加载配置
config = loadConfig();

// 验证配置
const validation = validateConfig(config);
if (!validation.valid) {
  logger.error('配置验证失败，应用可能无法正常运行');
  // 可选：在生产环境下，显示错误对话框
  // dialog.showErrorBox('配置错误', validation.errors.join('\n'));
}

// 设置日志级别
if (process.env.NODE_ENV === 'production' && !config.openDevTools) {
  logger.setLevel(LogLevel.INFO);
}

// 调试开关
const argv = process.argv.slice(1);
const debugEnabled = !!(
  config.openDevTools ||
  process.env.NODE_ENV === 'development' ||
  argv.includes('--devtools') ||
  process.env.OPEN_DEVTOOLS === '1'
);

logger.info(`调试模式: ${debugEnabled ? '启用' : '禁用'}`);

// 单实例锁
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  logger.warn('已有实例在运行，退出当前实例');
  app.quit();
} else {
  app.on('second-instance', () => {
    if (windowManager && windowManager.getWindow()) {
      const win = windowManager.getWindow();
      if (win.isMinimized()) win.restore();
      win.focus();
      logger.info('聚焦已存在的窗口');
    }
  });
}

/**
 * 创建窗口
 */
function createWindow() {
  windowManager = new WindowManager(config, {
    debugEnabled,
    onLoadFail: () => {
      handleLoadFailure();
    }
  });

  windowManager.createWindow();
}

/**
 * 加载目标 URL
 */
function loadTargetURL() {
  if (!windowManager) return;
  windowManager.loadURL(config.url);
}

/**
 * 加载离线页面
 */
function loadOfflinePage() {
  if (!windowManager) return;
  const offlinePath = path.join(__dirname, 'offline.html');
  windowManager.loadOfflinePage(offlinePath);
}

/**
 * 处理加载失败
 */
function handleLoadFailure() {
  loadOfflinePage();

  if (config.reloadOnFailSeconds > 0) {
    windowManager.scheduleReload(() => {
      loadTargetURL();
    }, config.reloadOnFailSeconds);
  }
}

/**
 * 设置系统集成功能
 */
function setupSystemIntegration() {
  systemIntegration = new SystemIntegration();

  // 开机自启
  systemIntegration.setupAutoLaunch(config.autoLaunch);

  // 退出热键
  systemIntegration.setupExitHotkey(config.exitHotkey, () => {
    windowManager.setAllowClose(true);
    app.quit();
  });

  // 防休眠
  systemIntegration.setupKeepAwake(config.keepAwake);

  // 调试热键
  if (debugEnabled) {
    systemIntegration.setupDebugHotkeys(() => {
      if (windowManager) {
        windowManager.toggleDevTools();
      }
    });
  }
}

/**
 * 应用启动初始化
 */
async function initializeApp() {
  setupSystemIntegration();

  // 如果启用了服务检查，等待服务就绪
  if (config.waitForServiceReady) {
    await waitForServiceReady(
      config.url,
      config.waitForServiceMaxSeconds,
      config.waitForServiceCheckInterval
    );
  }

  // 创建窗口并加载内容
  createWindow();
  loadTargetURL();
}

// IPC 处理：供离线页触发重试
ipcMain.handle('reload-remote', () => {
  logger.info('收到手动重载请求');
  loadTargetURL();
  return true;
});

// 应用生命周期管理
app.whenReady().then(() => {
  initializeApp();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
      loadTargetURL();
    }
  });
});

app.on('window-all-closed', () => {
  // 展厅场景通常不退出，保持应用运行
  logger.info('所有窗口已关闭，但应用继续运行');
});

app.on('before-quit', () => {
  logger.info('应用准备退出，清理资源');

  if (windowManager) {
    windowManager.setAllowClose(true);
    windowManager.destroy();
  }

  if (systemIntegration) {
    systemIntegration.cleanup();
  }
});