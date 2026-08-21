/**
 * Telegram 安全发送辅助函数
 * 统一处理权限不足等常见错误，避免未捕获的 Promise 拒绝
 */

const logger = require('../utils/logger');
const chatPermissionService = require('../services/chatPermissionService');
const { isSendMessageForbiddenError, getTelegramErrorDescription } = require('./errors');

/**
 * 统一的发送操作执行器
 * @param {string} action
 * @param {number|string|undefined} chatId
 * @param {Function} operation
 * @param {Object} metadata
 * @returns {Promise<*>}
 */
async function executeSafeTelegramAction(action, chatId, operation, metadata = {}) {
  try {
    return await operation();
  } catch (error) {
    const handled = handleSendRestriction(chatId, action, error, metadata);
    if (handled) {
      return null;
    }
    throw error;
  }
}

/**
 * 处理发送权限受限错误
 * @param {number|string|undefined} chatId
 * @param {string} action
 * @param {Error} error
 * @param {Object} metadata
 * @returns {boolean} 是否已处理
 */
function handleSendRestriction(chatId, action, error, metadata = {}) {
  if (!chatId || !isSendMessageForbiddenError(error)) {
    return false;
  }

  const description = getTelegramErrorDescription(error);

  chatPermissionService.markChatSendRestricted(chatId, description);

  logger.warn('检测到群组发送权限受限，将忽略后续发送尝试', {
    chatId,
    action,
    description,
    ...metadata
  });

  return true;
}

/**
 * 安全地调用 ctx.reply
 */
function safeReply(ctx, text, options = {}, metadata = {}) {
  const chatId = ctx?.chat?.id;
  const textPreview = typeof text === 'string' ? text.slice(0, 80) : undefined;

  return executeSafeTelegramAction(
    'ctx.reply',
    chatId,
    () => ctx.reply(text, options),
    { ...metadata, textPreview }
  );
}

/**
 * 安全地调用 ctx.editMessageText
 */
function safeEditMessageText(ctx, text, options = {}, metadata = {}) {
  const chatId = ctx?.chat?.id;
  const textPreview = typeof text === 'string' ? text.slice(0, 80) : undefined;

  return executeSafeTelegramAction(
    'ctx.editMessageText',
    chatId,
    () => ctx.editMessageText(text, options),
    { ...metadata, textPreview }
  );
}

module.exports = {
  safeReply,
  safeEditMessageText,
  handleSendRestriction
};

