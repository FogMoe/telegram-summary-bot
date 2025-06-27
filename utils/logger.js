/**
 * 日志工具模块
 */

const logger = {
  /**
   * 记录信息日志
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  info(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ℹ️  ${message}`, data ? data : '');
  },

  /**
   * 记录成功日志
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  success(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ✅ ${message}`, data ? data : '');
  },

  /**
   * 记录警告日志
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  warn(message, data = null) {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] ⚠️  ${message}`, data ? data : '');
  },

  /**
   * 记录错误日志
   * @param {string} message - 日志消息
   * @param {Error|*} error - 错误对象或附加数据
   */
  error(message, error = null) {
    const timestamp = new Date().toISOString();
    console.error(`[${timestamp}] ❌ ${message}`, error ? error : '');
  },

  /**
   * 记录调试日志
   * @param {string} message - 日志消息
   * @param {*} data - 附加数据
   */
  debug(message, data = null) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] 🐛 ${message}`, data ? data : '');
  },

  /**
   * 记录用户活动日志
   * @param {Object} ctx - Telegraf 上下文
   * @param {string} action - 用户操作
   */
  userActivity(ctx, action) {
    const user = ctx.from;
    const chat = ctx.chat;
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] 👤 用户活动: ${action}`, {
      userId: user.id,
      username: user.username,
      firstName: user.first_name,
      chatId: chat.id,
      chatType: chat.type
    });
  }
};

module.exports = logger; 