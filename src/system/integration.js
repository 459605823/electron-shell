/**
 * 系统集成模块
 * 负责开机自启、防休眠、热键等系统级功能
 */

const { app, powerSaveBlocker, globalShortcut } = require('electron');
const { logger } = require('../utils/logger');

class SystemIntegration {
  constructor() {
    this.keepAwakeId = null;
  }

  /**
   * 设置开机自启（Windows/macOS）
   */
  setupAutoLaunch(enable) {
    if (!enable) {
      logger.debug('开机自启已禁用');
      return;
    }

    try {
      app.setLoginItemSettings({
        openAtLogin: true,
        openAsHidden: true,
        args: []
      });
      logger.info('开机自启已启用');
    } catch (e) {
      logger.error('设置开机自启失败：', e.message);
    }
  }

  /**
   * 注册退出热键
   */
  setupExitHotkey(hotkey, onExit) {
    if (!hotkey) {
      logger.debug('未配置退出热键');
      return;
    }

    try {
      const success = globalShortcut.register(hotkey, () => {
        logger.info(`退出热键 ${hotkey} 被触发`);
        if (onExit) onExit();
      });

      if (success) {
        logger.info(`退出热键已注册: ${hotkey}`);
      } else {
        logger.error(`退出热键注册失败: ${hotkey}`);
      }
    } catch (e) {
      logger.error(`注册退出热键失败 (${hotkey})：`, e.message);
    }
  }

  /**
   * 注册调试热键（F12 和 Ctrl+Shift+I）
   */
  setupDebugHotkeys(onToggleDevTools) {
    try {
      globalShortcut.register('F12', () => {
        logger.debug('F12 调试热键被触发');
        if (onToggleDevTools) onToggleDevTools();
      });
      logger.info('调试热键已注册: F12');
    } catch (e) {
      logger.error('注册 F12 调试热键失败：', e.message);
    }

    try {
      globalShortcut.register('Control+Shift+I', () => {
        logger.debug('Ctrl+Shift+I 调试热键被触发');
        if (onToggleDevTools) onToggleDevTools();
      });
      logger.info('调试热键已注册: Ctrl+Shift+I');
    } catch (e) {
      logger.error('注册 Ctrl+Shift+I 调试热键失败：', e.message);
    }
  }

  /**
   * 保持唤醒（阻止息屏）
   */
  setupKeepAwake(enable) {
    if (!enable) {
      logger.debug('防休眠已禁用');
      return;
    }

    try {
      this.keepAwakeId = powerSaveBlocker.start('prevent-display-sleep');
      logger.info('防休眠已启用');
    } catch (e) {
      logger.error('设置防休眠失败：', e.message);
    }
  }

  /**
   * 停止保持唤醒
   */
  stopKeepAwake() {
    if (this.keepAwakeId !== null && powerSaveBlocker.isStarted(this.keepAwakeId)) {
      powerSaveBlocker.stop(this.keepAwakeId);
      this.keepAwakeId = null;
      logger.info('防休眠已停止');
    }
  }

  /**
   * 注销所有全局快捷键
   */
  unregisterAllShortcuts() {
    globalShortcut.unregisterAll();
    logger.info('所有全局快捷键已注销');
  }

  /**
   * 清理资源
   */
  cleanup() {
    this.stopKeepAwake();
    this.unregisterAllShortcuts();
  }
}

module.exports = SystemIntegration;
