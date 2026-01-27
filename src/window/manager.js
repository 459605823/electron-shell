/**
 * 窗口管理模块
 * 负责创建和管理主窗口
 */

const { BrowserWindow, shell, screen } = require('electron');
const path = require('path');
const { logger } = require('../utils/logger');

class WindowManager {
  constructor(config, options = {}) {
    this.config = config;
    this.window = null;
    this.retryTimer = null;
    this.allowClose = false;
    this.debugEnabled = options.debugEnabled || false;
    this.onLoadFail = options.onLoadFail || (() => {});
  }

  /**
   * 获取指定索引的显示器边界
   */
  getDisplayBounds(index) {
    const displays = screen.getAllDisplays();
    const safeIndex = Math.max(0, Math.min(index, displays.length - 1));
    const display = displays[safeIndex];

    logger.debug(`使用显示器 ${safeIndex}: ${display.bounds.width}x${display.bounds.height}`);
    return display.bounds;
  }

  /**
   * 创建主窗口
   */
  createWindow() {
    const bounds = this.getDisplayBounds(this.config.displayIndex);

    this.window = new BrowserWindow({
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      backgroundColor: '#000000',
      show: false,
      fullscreen: !!this.config.fullscreen,
      kiosk: !!this.config.kiosk,
      alwaysOnTop: !!this.config.alwaysOnTop,
      autoHideMenuBar: true,
      fullscreenable: true,
      webPreferences: {
        preload: path.join(__dirname, '..', '..', 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        devTools: this.debugEnabled,
        spellcheck: false,
        backgroundThrottling: false
      }
    });

    this._setupWindowBehavior();
    this._setupNavigationControl();
    this._setupErrorHandlers();
    this._setupInputInterception();

    this.window.once('ready-to-show', () => {
      this.window.show();

      // 启动即打开 DevTools
      if (this.config.openDevTools || process.argv.includes('--open-devtools')) {
        try {
          this.window.webContents.openDevTools({ mode: 'detach' });
        } catch (e) {
          logger.error('打开 DevTools 失败：', e.message);
        }
      }
    });

    logger.info('窗口创建成功');
    return this.window;
  }

  /**
   * 设置窗口行为
   */
  _setupWindowBehavior() {
    // 禁止页面缩放
    this.window.webContents.setVisualZoomLevelLimits(1, 1).catch(() => {});

    if (typeof this.config.zoomFactor === 'number' && this.config.zoomFactor > 0) {
      this.window.webContents.setZoomFactor(this.config.zoomFactor);
    }

    // 追加 UA 标识
    if (this.config.userAgentAppend) {
      const ua = this.window.webContents.getUserAgent() + this.config.userAgentAppend;
      this.window.webContents.setUserAgent(ua);
    }

    // 拦截关闭事件
    this.window.on('close', (e) => {
      // 开发模式下允许直接关闭，生产模式下必须使用快捷键
      if (!this.allowClose && !this.debugEnabled) {
        e.preventDefault();
        logger.debug('拦截了窗口关闭事件，请使用退出快捷键');
      } else {
        logger.info('允许窗口关闭');
        // 确保应用完全退出
        const { app } = require('electron');
        app.quit();
      }
    });
  }

  /**
   * 设置导航控制
   * 限制导航：仅允许在目标站点内导航，其它使用系统浏览器打开
   */
  _setupNavigationControl() {
    const targetOrigin = (() => {
      try {
        return new URL(this.config.url).origin;
      } catch {
        logger.warn('无法解析目标 URL 的 origin');
        return '';
      }
    })();

    this.window.webContents.on('will-navigate', (event, url) => {
      if (!targetOrigin) return;
      if (!url.startsWith(targetOrigin)) {
        event.preventDefault();
        shell.openExternal(url);
        logger.info(`外部链接使用系统浏览器打开: ${url}`);
      }
    });

    this.window.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url);
      logger.info(`新窗口链接使用系统浏览器打开: ${url}`);
      return { action: 'deny' };
    });
  }

  /**
   * 设置错误处理
   */
  _setupErrorHandlers() {
    this.window.webContents.on('did-fail-load', (_e, code, desc, _url, isMainFrame) => {
      if (!isMainFrame) return;
      logger.error(`加载失败: ${code} - ${desc}`);
      this.onLoadFail();
    });

    this.window.on('unresponsive', () => {
      logger.error('渲染线程无响应');
      this.onLoadFail();
    });

    this.window.webContents.on('render-process-gone', (_e, details) => {
      logger.error('渲染进程退出:', details);
      this.onLoadFail();
    });
  }

  /**
   * 设置输入拦截
   * 拦截常见退出按键（Alt+F4/Ctrl+W等）
   */
  _setupInputInterception() {
    this.window.webContents.on('before-input-event', (event, input) => {
      const altF4 = input.type === 'keyDown' && input.key === 'F4' && input.alt;
      const ctrlW = input.type === 'keyDown' && (input.code === 'KeyW' || input.key === 'w') && (input.control || input.meta);

      if (altF4 || ctrlW) {
        event.preventDefault();
        logger.debug('拦截了退出快捷键');
      }
    });
  }

  /**
   * 加载目标 URL
   */
  loadURL(url) {
    if (!this.window || this.window.isDestroyed()) {
      logger.error('窗口未创建或已销毁');
      return;
    }

    this.clearRetryTimer();

    try {
      logger.info(`加载 URL: ${url}`);
      this.window.loadURL(url, {
        userAgent: this.window.webContents.getUserAgent()
      });
    } catch (e) {
      logger.error('loadURL 出错：', e.message);
      this.onLoadFail();
    }
  }

  /**
   * 加载离线页面
   */
  loadOfflinePage(offlineHtmlPath) {
    if (!this.window || this.window.isDestroyed()) {
      logger.error('窗口未创建或已销毁');
      return;
    }

    const fs = require('fs');

    if (fs.existsSync(offlineHtmlPath)) {
      logger.info('加载离线页面');
      this.window.loadFile(offlineHtmlPath);
    } else {
      logger.warn('离线页面不存在，使用内置 loading 页面');
      this._loadBuiltinLoadingPage();
    }
  }

  /**
   * 加载内置 loading 页面
   */
  _loadBuiltinLoadingPage() {
    const html = `
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <title>加载中</title>
  <style>
    html, body {
      background: #000;
      color: #fff;
      height: 100%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0;
      font: 16px/1.6 system-ui, "Segoe UI", Arial;
    }
    .loading-container {
      text-align: center;
    }
    .spinner {
      width: 50px;
      height: 50px;
      margin: 0 auto 20px;
      border: 4px solid rgba(255, 255, 255, 0.1);
      border-top-color: #fff;
      border-radius: 50%;
      animation: spin 1s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    .loading-text {
      font-size: 18px;
      margin-bottom: 10px;
    }
    .loading-tip {
      font-size: 14px;
      opacity: 0.6;
    }
  </style>
</head>
<body>
  <div class="loading-container">
    <div class="spinner"></div>
    <div class="loading-text">正在连接大屏服务...</div>
    <div class="loading-tip">请稍候</div>
  </div>
</body>
</html>
    `;

    this.window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
  }

  /**
   * 计划重载
   */
  scheduleReload(callback, seconds) {
    this.clearRetryTimer();

    if (seconds > 0) {
      logger.info(`${seconds} 秒后自动重试`);
      this.retryTimer = setTimeout(() => {
        callback();
      }, seconds * 1000);
    }
  }

  /**
   * 清除重载定时器
   */
  clearRetryTimer() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /**
   * 允许关闭窗口
   */
  setAllowClose(allow) {
    this.allowClose = allow;
  }

  /**
   * 获取窗口实例
   */
  getWindow() {
    return this.window;
  }

  /**
   * 切换开发者工具
   */
  toggleDevTools() {
    if (this.window && !this.window.isDestroyed()) {
      this.window.webContents.toggleDevTools();
    }
  }

  /**
   * 销毁窗口
   */
  destroy() {
    this.clearRetryTimer();

    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }

    this.window = null;
  }
}

module.exports = WindowManager;
