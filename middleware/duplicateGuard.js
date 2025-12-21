/**
 * 防重复执行中间件
 * 防止同一个update被多次处理
 */

const logger = require('../utils/logger');
const { DUPLICATE_GUARD } = require('../config/constants');

// 存储已处理的update_id
const processedUpdates = new Set();

// 定期清理旧的update_id（防止内存泄漏）
let cleanupTimer = setInterval(() => {
  const sizeBefore = processedUpdates.size;
  if (processedUpdates.size > DUPLICATE_GUARD.MAX_UPDATES) {
    const updates = Array.from(processedUpdates);
    const keepCount = Math.max(1, Math.floor(DUPLICATE_GUARD.MAX_UPDATES / 2));
    const toKeep = updates.slice(-keepCount);
    processedUpdates.clear();
    toKeep.forEach(id => processedUpdates.add(id));
    
    logger.info('清理已处理的update记录', {
      before: sizeBefore,
      after: processedUpdates.size
    });
  }
}, DUPLICATE_GUARD.CLEANUP_INTERVAL_MS);

/**
 * 防重复执行中间件
 */
const duplicateGuard = async (ctx, next) => {
  if (!ctx.update || !ctx.update.update_id) {
    return next();
  }
  
  const updateId = ctx.update.update_id;
  
  // 检查是否已处理过此update
  if (processedUpdates.has(updateId)) {
    logger.warn('检测到重复的update，跳过处理', {
      updateId: updateId,
      messageText: ctx.update.message?.text,
      from: ctx.update.message?.from?.username || ctx.update.message?.from?.id
    });
    return; // 直接返回，不继续处理
  }
  
  // 标记为已处理
  processedUpdates.add(updateId);
  
  // 继续处理
  return next();
};

/**
 * 清理资源
 */
function cleanup() {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
  processedUpdates.clear();
  logger.info('防重复中间件资源已清理');
}

module.exports = duplicateGuard;
module.exports.cleanup = cleanup; 
