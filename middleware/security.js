/**
 * 安全中间件
 */

const logger = require('../utils/logger');

/**
 * 速率限制中间件
 * 防止用户过于频繁地发送请求
 */
const rateLimiter = (() => {
  const userRequests = new Map();
  const RATE_LIMIT = 10; // 每分钟最多10次请求
  const TIME_WINDOW = 60 * 1000; // 1分钟
  const MAX_ENTRIES = 10000; // 最大缓存条目数

  // 定期清理过期的条目（防止内存泄漏）
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    let cleaned = 0;
    
    for (const [key, data] of userRequests.entries()) {
      if (now >= data.resetTime) {
        userRequests.delete(key);
        cleaned++;
      }
    }

    // 如果条目数仍然过多，删除最旧的条目
    if (userRequests.size > MAX_ENTRIES) {
      const sortedEntries = Array.from(userRequests.entries())
        .sort((a, b) => a[1].resetTime - b[1].resetTime);
      
      const toDelete = sortedEntries.slice(0, sortedEntries.length - MAX_ENTRIES);
      toDelete.forEach(([key]) => userRequests.delete(key));
      cleaned += toDelete.length;
    }

    if (cleaned > 0) {
      logger.debug(`速率限制器清理了 ${cleaned} 个过期条目`);
    }
  }, 5 * 60 * 1000); // 每5分钟清理一次

  const middleware = (ctx, next) => {
    const userId = ctx.from?.id;
    if (!userId) return next();

    const now = Date.now();
    const userKey = `user_${userId}`;
    
    if (!userRequests.has(userKey)) {
      userRequests.set(userKey, {
        count: 1,
        resetTime: now + TIME_WINDOW
      });
      return next();
    }

    const userData = userRequests.get(userKey);
    
    // 重置计数器如果时间窗口已过
    if (now >= userData.resetTime) {
      userData.count = 1;
      userData.resetTime = now + TIME_WINDOW;
      return next();
    }

    // 检查是否超过速率限制
    if (userData.count >= RATE_LIMIT) {
      logger.warn(`用户 ${userId} 触发速率限制`);
      return ctx.reply('⚠️ 您的请求过于频繁，请稍后再试。');
    }

    userData.count++;
    return next();
  };

  // 添加清理方法
  middleware.cleanup = () => {
    if (cleanupInterval) {
      clearInterval(cleanupInterval);
    }
    userRequests.clear();
    logger.info('速率限制器资源已清理');
  };

  return middleware;
})();

/**
 * 用户验证中间件
 * 验证用户是否被允许使用机器人
 */
const userValidator = (ctx, next) => {
  const user = ctx.from;
  
  // 记录用户信息
  if (user) {
    logger.info(`用户访问: ${user.first_name} (@${user.username || 'N/A'}) [${user.id}]`);
  }

  // 这里可以添加黑名单检查、用户权限验证等逻辑
  // 例如：
  // if (isBlacklisted(user.id)) {
  //   logger.warn(`黑名单用户尝试访问: ${user.id}`);
  //   return ctx.reply('您无权使用此机器人。');
  // }

  return next();
};

/**
 * 内容过滤中间件
 * 过滤不当内容
 */
const contentFilter = (ctx, next) => {
  const message = ctx.message;
  
  if (message?.text) {
    const text = message.text.toLowerCase();
    
    // 简单的内容过滤（可以扩展）
    const forbiddenWords = ['spam', 'abuse']; // 示例禁词
    
    const hasForbiddenContent = forbiddenWords.some(word => 
      text.includes(word)
    );
    
    if (hasForbiddenContent) {
      logger.warn(`检测到不当内容`, {
        userId: ctx.from.id,
        text: text.substring(0, 50)
      });
      return ctx.reply('⚠️ 检测到不当内容，请文明使用。');
    }
  }
  
  return next();
};

module.exports = {
  rateLimiter,
  userValidator,
  contentFilter
}; 