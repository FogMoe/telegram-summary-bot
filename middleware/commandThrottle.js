/**
 * 命令节流中间件
 * 防止用户瞬间发送多条相同命令
 */

const logger = require('../utils/logger');

class CommandThrottle {
  constructor() {
    // 存储用户命令执行状态
    this.userCommands = new Map();
    
    // 定期清理过期的记录
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredRecords();
    }, 30 * 1000); // 每30秒清理一次
  }

  /**
   * 清理过期的记录
   */
  cleanupExpiredRecords() {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, data] of this.userCommands.entries()) {
      if (now - data.lastExecuted > 5 * 60 * 1000) { // 5分钟后清理
        this.userCommands.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`命令节流器清理了 ${cleaned} 个过期记录`);
    }
  }

  /**
   * 检查用户是否可以执行命令
   * @param {number} userId - 用户ID
   * @param {number} chatId - 聊天ID
   * @param {string} command - 命令名称
   * @param {number} throttleMs - 节流时间（毫秒）
   * @returns {boolean} 是否可以执行
   */
  canExecuteCommand(userId, chatId, command, throttleMs = 3000) {
    const key = `${userId}_${chatId}_${command}`;
    const now = Date.now();
    
    const record = this.userCommands.get(key);
    
    if (record) {
      const timeSinceLastExecution = now - record.lastExecuted;
      
      if (timeSinceLastExecution < throttleMs) {
        const remainingMs = throttleMs - timeSinceLastExecution;
        logger.warn(`用户命令节流触发`, {
          userId,
          chatId,
          command,
          remainingMs,
          timeSinceLastExecution
        });
        return false;
      }
    }

    // 更新执行时间
    this.userCommands.set(key, {
      lastExecuted: now,
      count: (record?.count || 0) + 1
    });

    return true;
  }

  /**
   * 获取命令执行统计
   * @param {number} userId - 用户ID
   * @param {number} chatId - 聊天ID
   * @param {string} command - 命令名称
   * @returns {Object} 执行统计
   */
  getCommandStats(userId, chatId, command) {
    const key = `${userId}_${chatId}_${command}`;
    return this.userCommands.get(key) || { count: 0, lastExecuted: 0 };
  }

  /**
   * 清理资源
   */
  cleanup() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.userCommands.clear();
    logger.info('命令节流器资源已清理');
  }
}

// 创建单例实例
const commandThrottle = new CommandThrottle();

/**
 * 命令节流中间件工厂
 * @param {string} command - 命令名称
 * @param {number} throttleMs - 节流时间（毫秒）
 * @returns {Function} 中间件函数
 */
function createCommandThrottle(command, throttleMs = 3000) {
  return (ctx, next) => {
    // 只对指定命令进行节流
    if (!ctx.message?.text?.startsWith(`/${command}`)) {
      return next();
    }

    const userId = ctx.from?.id;
    const chatId = ctx.chat?.id;

    if (!userId || !chatId) {
      return next();
    }

    // 检查是否可以执行命令
    if (!commandThrottle.canExecuteCommand(userId, chatId, command, throttleMs)) {
      const remainingSeconds = Math.ceil(throttleMs / 1000);
      return ctx.reply(`⏱️ 请勿重复发送命令

您刚刚已经执行了 /${command} 命令，请等待 ${remainingSeconds} 秒后再试。

这是为了防止重复处理和保护服务器资源。`);
    }

    return next();
  };
}

module.exports = {
  commandThrottle,
  createCommandThrottle
}; 