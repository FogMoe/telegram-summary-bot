/**
 * 统一错误处理和恢复机制
 */

const logger = require('./logger');

/**
 * 错误分类
 */
const ErrorTypes = {
  TELEGRAM_API: 'telegram_api',
  AI_API: 'ai_api', 
  DATABASE: 'database',
  VALIDATION: 'validation',
  RATE_LIMIT: 'rate_limit',
  NETWORK: 'network',
  UNKNOWN: 'unknown'
};

/**
 * 错误恢复策略
 */
const RecoveryStrategies = {
  RETRY: 'retry',
  FALLBACK: 'fallback',
  SKIP: 'skip',
  FAIL: 'fail'
};

/**
 * 错误分类器
 * @param {Error} error - 错误对象
 * @returns {string} 错误类型
 */
function classifyError(error) {
  if (!error) return ErrorTypes.UNKNOWN;

  const message = error.message?.toLowerCase() || '';
  const name = error.name?.toLowerCase() || '';
  const code = error.code;

  // Telegram API 错误
  if (name.includes('telegraf') || message.includes('telegram') || code === 429) {
    return ErrorTypes.TELEGRAM_API;
  }

  // AI API 错误
  if (name.includes('openai') || message.includes('openai') || message.includes('azure') || message.includes('ai')) {
    return ErrorTypes.AI_API;
  }

  // 数据库错误
  if (name.includes('sqlite') || message.includes('database') || message.includes('sql')) {
    return ErrorTypes.DATABASE;
  }

  // 验证错误
  if (name.includes('validation') || message.includes('invalid')) {
    return ErrorTypes.VALIDATION;
  }

  // 速率限制错误
  if (message.includes('rate limit') || message.includes('too many')) {
    return ErrorTypes.RATE_LIMIT;
  }

  // 网络错误
  if (name.includes('network') || message.includes('timeout') || message.includes('connection')) {
    return ErrorTypes.NETWORK;
  }

  return ErrorTypes.UNKNOWN;
}

/**
 * 获取错误恢复策略
 * @param {string} errorType - 错误类型
 * @param {number} attemptCount - 尝试次数
 * @returns {string} 恢复策略
 */
function getRecoveryStrategy(errorType, attemptCount = 1) {
  switch (errorType) {
    case ErrorTypes.TELEGRAM_API:
      return attemptCount < 3 ? RecoveryStrategies.RETRY : RecoveryStrategies.FAIL;
    
    case ErrorTypes.AI_API:
      return attemptCount < 2 ? RecoveryStrategies.RETRY : RecoveryStrategies.FALLBACK;
    
    case ErrorTypes.DATABASE:
      return attemptCount < 3 ? RecoveryStrategies.RETRY : RecoveryStrategies.FAIL;
    
    case ErrorTypes.NETWORK:
      return attemptCount < 5 ? RecoveryStrategies.RETRY : RecoveryStrategies.FAIL;
    
    case ErrorTypes.RATE_LIMIT:
      return RecoveryStrategies.SKIP;
    
    case ErrorTypes.VALIDATION:
      return RecoveryStrategies.FAIL;
    
    default:
      return RecoveryStrategies.FAIL;
  }
}

/**
 * 计算重试延迟（指数退避）
 * @param {number} attemptCount - 尝试次数
 * @returns {number} 延迟时间（毫秒）
 */
function getRetryDelay(attemptCount) {
  const baseDelay = 1000; // 1秒
  const maxDelay = 30000; // 30秒
  const delay = Math.min(baseDelay * Math.pow(2, attemptCount - 1), maxDelay);
  
  // 添加随机抖动防止雷群效应
  const jitter = Math.random() * 0.1 * delay;
  return Math.floor(delay + jitter);
}

/**
 * 带重试的函数执行器
 * @param {Function} fn - 要执行的函数
 * @param {Object} options - 选项
 * @returns {Promise} 执行结果
 */
async function withRetry(fn, options = {}) {
  const {
    maxAttempts = 3,
    context = 'unknown operation',
    fallbackValue = null
  } = options;

  let lastError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await fn();
      
      if (attempt > 1) {
        logger.success(`${context} 在第 ${attempt} 次尝试后成功`);
      }
      
      return result;
    } catch (error) {
      lastError = error;
      const errorType = classifyError(error);
      const strategy = getRecoveryStrategy(errorType, attempt);
      
      logger.warn(`${context} 第 ${attempt} 次尝试失败`, {
        error: error.message,
        errorType,
        strategy,
        attempt: `${attempt}/${maxAttempts}`
      });

      if (strategy === RecoveryStrategies.FAIL || attempt === maxAttempts) {
        break;
      }

      if (strategy === RecoveryStrategies.SKIP) {
        return fallbackValue;
      }

      if (strategy === RecoveryStrategies.RETRY) {
        const delay = getRetryDelay(attempt);
        logger.info(`${context} 等待 ${delay}ms 后重试...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  logger.error(`${context} 在 ${maxAttempts} 次尝试后最终失败`, lastError);
  
  if (options.fallbackValue !== undefined) {
    logger.info(`${context} 使用回退值`);
    return fallbackValue;
  }
  
  throw lastError;
}

/**
 * 生成用户友好的错误消息
 * @param {Error} error - 错误对象
 * @param {string} operation - 操作名称
 * @returns {string} 用户友好的错误消息
 */
function getUserFriendlyErrorMessage(error, operation = '操作') {
  const errorType = classifyError(error);
  
  switch (errorType) {
    case ErrorTypes.TELEGRAM_API:
      return `🤖 Telegram服务暂时不可用，请稍后再试。`;
    
    case ErrorTypes.AI_API:
      return `🧠 AI 服务暂时繁忙，请稍后再试或联系管理员。`;
    
    case ErrorTypes.DATABASE:
      return `💾 数据服务暂时不可用，请稍后再试。`;
    
    case ErrorTypes.RATE_LIMIT:
      return `⏰ 请求过于频繁，请稍后再试。`;
    
    case ErrorTypes.VALIDATION:
      return `❌ 输入参数有误，请检查后重试。`;
    
    case ErrorTypes.NETWORK:
      return `🌐 网络连接异常，请检查网络后重试。`;
    
    default:
      return `❌ ${operation}失败，请稍后再试。如问题持续，请联系管理员。`;
  }
}

/**
 * 全局错误处理器
 * @param {Error} error - 错误对象
 * @param {Object} context - 上下文信息
 */
function handleGlobalError(error, context = {}) {
  const errorType = classifyError(error);
  
  logger.error('全局错误', {
    error: error.message,
    stack: error.stack,
    errorType,
    context,
    timestamp: new Date().toISOString()
  });

  // 关键错误需要重启
  if (errorType === ErrorTypes.DATABASE && error.code === 'SQLITE_CORRUPT') {
    logger.error('检测到数据库损坏，需要人工干预');
    process.exit(1);
  }
}

module.exports = {
  ErrorTypes,
  RecoveryStrategies,
  classifyError,
  getRecoveryStrategy,
  withRetry,
  getUserFriendlyErrorMessage,
  handleGlobalError
}; 
