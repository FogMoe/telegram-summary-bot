/**
 * 输入验证中间件
 * 增强输入安全性，防止各种攻击
 */

const logger = require('../utils/logger');

/**
 * 输入验证中间件
 */
const inputValidation = (ctx, next) => {
  try {
    // 验证消息长度（防止DoS攻击）
    if (ctx.message?.text && ctx.message.text.length > 10000) {
      logger.warn('检测到超长消息', {
        userId: ctx.from?.id,
        messageLength: ctx.message.text.length,
        chatId: ctx.chat?.id
      });
      return ctx.reply('⚠️ 消息过长，请发送较短的内容。');
    }

    // 验证命令参数（防止注入攻击）
    if (ctx.message?.text?.startsWith('/')) {
      const parts = ctx.message.text.split(' ');
      const command = parts[0];
      const args = parts.slice(1);

      // 检查命令格式
      if (!/^\/[a-zA-Z_][a-zA-Z0-9_]*(@[a-zA-Z_][a-zA-Z0-9_]*)?$/.test(command)) {
        logger.warn('检测到非法命令格式', {
          command: command,
          userId: ctx.from?.id
        });
        return ctx.reply('⚠️ 无效的命令格式。');
      }

      // 验证参数
      for (const arg of args) {
        if (arg.length > 1000) {
          logger.warn('检测到超长命令参数', {
            userId: ctx.from?.id,
            argLength: arg.length
          });
          return ctx.reply('⚠️ 命令参数过长。');
        }

        // 检查危险字符
        if (/[<>\"'&]/.test(arg)) {
          logger.warn('检测到潜在危险字符', {
            userId: ctx.from?.id,
            argument: arg.substring(0, 50)
          });
          return ctx.reply('⚠️ 参数包含不允许的字符。');
        }
      }
    }

    // 验证用户ID和聊天ID范围
    if (ctx.from?.id && (ctx.from.id < 0 || ctx.from.id > Number.MAX_SAFE_INTEGER)) {
      logger.warn('检测到异常用户ID', {
        userId: ctx.from.id
      });
      return;
    }

    if (ctx.chat?.id && Math.abs(ctx.chat.id) > Number.MAX_SAFE_INTEGER) {
      logger.warn('检测到异常聊天ID', {
        chatId: ctx.chat.id
      });
      return;
    }

    return next();
  } catch (error) {
    logger.error('输入验证中间件错误', error);
    return next();
  }
};

/**
 * 清理和转义用户输入
 * @param {string} input - 用户输入
 * @returns {string} 清理后的输入
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/[<>]/g, '') // 移除潜在的HTML标签
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 移除控制字符
    .trim()
    .substring(0, 1000); // 限制长度
}

/**
 * 验证数字参数
 * @param {string} value - 要验证的值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number|null} 验证后的数字或null
 */
function validateNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = parseInt(value);
  if (isNaN(num) || num < min || num > max) {
    return null;
  }
  return num;
}

module.exports = {
  inputValidation,
  sanitizeInput,
  validateNumber
}; 