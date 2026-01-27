/**
 * 配置验证模块
 * 验证配置项的合法性
 */

const { logger } = require('../utils/logger');

/**
 * 验证 URL 格式
 */
function isValidUrl(url) {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

/**
 * 验证配置项
 * @param {Object} config 配置对象
 * @returns {Object} { valid: boolean, errors: string[] }
 */
function validateConfig(config) {
  const errors = [];

  // 必填项检查
  if (!config.url) {
    errors.push('配置项 url 不能为空');
  } else if (!isValidUrl(config.url)) {
    errors.push(`配置项 url 格式无效: ${config.url}`);
  }

  // 类型检查
  if (typeof config.autoLaunch !== 'boolean') {
    errors.push('配置项 autoLaunch 必须是布尔值');
  }
  if (typeof config.kiosk !== 'boolean') {
    errors.push('配置项 kiosk 必须是布尔值');
  }
  if (typeof config.fullscreen !== 'boolean') {
    errors.push('配置项 fullscreen 必须是布尔值');
  }
  if (typeof config.alwaysOnTop !== 'boolean') {
    errors.push('配置项 alwaysOnTop 必须是布尔值');
  }
  if (typeof config.keepAwake !== 'boolean') {
    errors.push('配置项 keepAwake 必须是布尔值');
  }
  if (typeof config.openDevTools !== 'boolean') {
    errors.push('配置项 openDevTools 必须是布尔值');
  }
  if (typeof config.waitForServiceReady !== 'boolean') {
    errors.push('配置项 waitForServiceReady 必须是布尔值');
  }

  // 数值范围检查
  if (typeof config.reloadOnFailSeconds !== 'number' || config.reloadOnFailSeconds < 0) {
    errors.push('配置项 reloadOnFailSeconds 必须是非负数');
  }
  if (typeof config.displayIndex !== 'number' || config.displayIndex < 0) {
    errors.push('配置项 displayIndex 必须是非负整数');
  }
  if (typeof config.zoomFactor !== 'number' || config.zoomFactor <= 0) {
    errors.push('配置项 zoomFactor 必须是正数');
  }
  if (typeof config.waitForServiceMaxSeconds !== 'number' || config.waitForServiceMaxSeconds <= 0) {
    errors.push('配置项 waitForServiceMaxSeconds 必须是正数');
  }
  if (typeof config.waitForServiceCheckInterval !== 'number' || config.waitForServiceCheckInterval <= 0) {
    errors.push('配置项 waitForServiceCheckInterval 必须是正数');
  }

  // 字符串检查
  if (config.exitHotkey && typeof config.exitHotkey !== 'string') {
    errors.push('配置项 exitHotkey 必须是字符串');
  }
  if (config.userAgentAppend && typeof config.userAgentAppend !== 'string') {
    errors.push('配置项 userAgentAppend 必须是字符串');
  }

  const valid = errors.length === 0;

  if (!valid) {
    logger.error('配置验证失败:');
    errors.forEach(err => logger.error(`  - ${err}`));
  } else {
    logger.info('配置验证通过');
  }

  return { valid, errors };
}

module.exports = {
  validateConfig,
  isValidUrl
};
