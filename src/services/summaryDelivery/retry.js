/**
 * 网络操作重试
 * 针对网络类错误的指数退避重试
 */

const logger = require('../../utils/logger');
const { isNetworkError } = require('./errorClassification');

const DEFAULT_RETRY_CONFIG = {
  maxRetries: 3,
  retryDelay: 1000, // 1秒
  backoffMultiplier: 2
};

/**
 * 网络错误重试机制（指数退避）
 * @param {Function} operation - 要执行的操作
 * @param {Object} context - 日志上下文
 * @param {Object} retryConfig - 重试配置
 */
async function retryNetworkOperation(operation, context = {}, retryConfig = DEFAULT_RETRY_CONFIG) {
  let lastError;

  for (let attempt = 0; attempt <= retryConfig.maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;

      if (!isNetworkError(error) || attempt === retryConfig.maxRetries) {
        throw error;
      }

      const delay = retryConfig.retryDelay * Math.pow(retryConfig.backoffMultiplier, attempt);

      logger.warn(`网络操作失败，${delay}ms后重试 (${attempt + 1}/${retryConfig.maxRetries})`, {
        error: error.message,
        context,
        attempt: attempt + 1
      });

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

module.exports = {
  retryNetworkOperation,
  DEFAULT_RETRY_CONFIG
};
