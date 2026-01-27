/**
 * 配置加载模块
 * 支持多层配置合并和外部配置优先读取
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { logger } = require('../utils/logger');

/**
 * 默认配置
 */
const DEFAULT_CONFIG = {
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
  userAgentAppend: " ElectronShell/1.0",
  openDevTools: false,
  // 启动前等待服务就绪配置
  waitForServiceReady: false,
  waitForServiceMaxSeconds: 120,
  waitForServiceCheckInterval: 3
};

/**
 * 获取配置文件所在目录
 * - 打包后：exe 同级目录（允许用户修改）
 * - 开发中：项目根目录
 */
function getConfigDir() {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'));
  } else {
    return path.join(__dirname, '..', '..');
  }
}

/**
 * 安全读取 JSON 配置文件
 * 优先读取外部配置（打包后可修改），回退到内部配置
 */
function readJsonSafe(filename, baseDir) {
  const externalPath = path.join(getConfigDir(), filename);
  const internalPath = path.join(baseDir || getConfigDir(), filename);

  // 优先读取外部配置（打包后可修改）
  try {
    if (fs.existsSync(externalPath)) {
      const content = JSON.parse(fs.readFileSync(externalPath, 'utf-8'));
      logger.info(`已加载配置: ${externalPath}`);
      return content;
    }
  } catch (e) {
    logger.error('读取外部配置失败：', externalPath, e.message);
  }

  // 回退到内部配置（asar 内或开发目录）
  try {
    if (fs.existsSync(internalPath)) {
      const content = JSON.parse(fs.readFileSync(internalPath, 'utf-8'));
      if (app.isPackaged) {
        logger.info(`使用内置配置: ${filename} (提示: 可在 exe 同目录创建该文件以覆盖)`);
      } else {
        logger.info(`已加载配置: ${internalPath}`);
      }
      return content;
    }
  } catch (e) {
    logger.error('读取内部配置失败：', internalPath, e.message);
  }

  return null;
}

/**
 * 获取运行环境
 * 优先级：--env 参数 > APP_ENV > NODE_ENV > app.isPackaged 推断
 */
function getRuntimeEnv() {
  const argv = process.argv.slice(1);

  const envFromArg = (() => {
    const i = argv.findIndex(a => a === '--env' || a.startsWith('--env='));
    if (i === -1) return null;
    if (argv[i].startsWith('--env=')) return argv[i].split('=')[1];
    return argv[i + 1] || null;
  })();

  return String(
    envFromArg ||
    process.env.APP_ENV ||
    process.env.NODE_ENV ||
    (app.isPackaged ? 'production' : 'development')
  ).toLowerCase();
}

/**
 * 加载配置
 * 按层合并：defaults -> config.json -> config.{env}.json -> config.local.json
 */
function loadConfig() {
  const runtimeEnv = getRuntimeEnv();
  const baseDir = path.join(__dirname, '..', '..');

  logger.info('========================================');
  logger.info('加载配置');
  logger.info('========================================');
  logger.info(`运行环境: ${runtimeEnv}`);
  logger.info(`配置目录: ${getConfigDir()}`);
  logger.info('----------------------------------------');

  const base = readJsonSafe('config.json', baseDir) || {};
  const envCfg = readJsonSafe(`config.${runtimeEnv}.json`, baseDir) || {};
  const local = readJsonSafe('config.local.json', baseDir) || {};

  const merged = { ...DEFAULT_CONFIG, ...base, ...envCfg, ...local };

  // 打印最终加载的 URL 便于调试
  if (merged.url) {
    logger.info(`大屏 URL: ${merged.url}`);
  }

  logger.info('========================================\n');

  return merged;
}

module.exports = {
  loadConfig,
  getConfigDir,
  getRuntimeEnv,
  DEFAULT_CONFIG
};
