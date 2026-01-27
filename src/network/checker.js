/**
 * 网络服务检查模块
 * 负责检查大屏服务是否可用
 */

const http = require('http');
const https = require('https');
const { logger } = require('../utils/logger');

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
        logger.debug(`  [检查] 连接失败: ${err.code || err.message}`);
        resolve(false);
      });

      req.on('timeout', () => {
        logger.debug(`  [检查] 请求超时`);
        req.destroy();
        resolve(false);
      });
    } catch (e) {
      logger.debug(`  [检查] URL 解析错误: ${e.message}`);
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
  logger.info('========================================');
  logger.info('启动前服务检查');
  logger.info('========================================');
  logger.info(`目标服务: ${url}`);
  logger.info(`最长等待: ${maxWaitSeconds} 秒`);
  logger.info(`检查间隔: ${checkIntervalSeconds} 秒`);
  logger.info('----------------------------------------\n');

  const startTime = Date.now();
  let attemptCount = 0;

  while (true) {
    attemptCount++;
    const elapsed = Math.floor((Date.now() - startTime) / 1000);

    logger.info(`[尝试 ${attemptCount}] 检查服务状态... (已等待 ${elapsed} 秒)`);

    const isReady = await checkUrlAvailable(url);

    if (isReady) {
      logger.info(`\n✓ 大屏服务已就绪！`);
      logger.info(`  - 尝试次数: ${attemptCount}`);
      logger.info(`  - 等待时间: ${elapsed} 秒`);
      logger.info('========================================\n');
      return true;
    }

    // 检查是否超时
    if (elapsed >= maxWaitSeconds) {
      logger.warn(`\n✗ 等待超时 (${maxWaitSeconds} 秒)`);
      logger.warn(`  应用将继续启动，但可能显示离线页面`);
      logger.warn(`  应用内置了自动重试机制，稍后会自动加载内容`);
      logger.warn('========================================\n');
      return false;
    }

    // 等待后重试
    await new Promise(resolve => setTimeout(resolve, checkIntervalSeconds * 1000));
  }
}

module.exports = {
  checkUrlAvailable,
  waitForServiceReady
};
