/**
 * 日志中间件
 */

const logger = require('../utils/logger');

/**
 * 请求日志中间件
 * 记录所有传入的更新
 */
const requestLogger = (ctx, next) => {
  const start = Date.now();
  
  // 记录请求开始
  logger.info(`收到更新 ${ctx.update.update_id}`, {
    updateType: Object.keys(ctx.update).filter(key => key !== 'update_id')[0],
    userId: ctx.from?.id,
    chatId: ctx.chat?.id
  });
  
  return next().then(() => {
    // 记录请求完成
    const duration = Date.now() - start;
    logger.success(`更新 ${ctx.update.update_id} 处理完成 (${duration}ms)`);
  }).catch(error => {
    // 记录错误
    const duration = Date.now() - start;
    logger.error(`更新 ${ctx.update.update_id} 处理失败 (${duration}ms)`, error);
    throw error;
  });
};

/**
 * 命令使用日志中间件
 * 记录命令使用情况
 */
const commandLogger = (ctx, next) => {
  if (ctx.updateType === 'message' && ctx.message.text?.startsWith('/')) {
    const command = ctx.message.text.split(' ')[0];
    logger.userActivity(ctx, `执行命令: ${command}`);
  }
  
  return next();
};

module.exports = {
  requestLogger,
  commandLogger
}; 