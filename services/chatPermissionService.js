/**
 * 群组权限状态管理服务
 * 负责记录和查询机器人在群组中的发送权限情况
 */

const cacheService = require('./cacheService');
const logger = require('../utils/logger');

const RESTRICTION_KEY_PREFIX = 'chat_send_restricted';
const DEFAULT_RESTRICTION_TTL = 6 * 60 * 60; // 6 小时

/**
 * 生成受限群组缓存 key
 * @param {number|string} chatId
 * @returns {string}
 */
function getRestrictionKey(chatId) {
  return `${RESTRICTION_KEY_PREFIX}_${chatId}`;
}

/**
 * 标记群组为发送受限状态
 * @param {number|string} chatId
 * @param {string} reason
 * @param {number} ttl 生存时间（秒）
 */
function markChatSendRestricted(chatId, reason = 'unknown', ttl = DEFAULT_RESTRICTION_TTL) {
  if (!chatId) {
    return;
  }

  const metadata = {
    restricted: true,
    reason,
    timestamp: Date.now()
  };

  cacheService.setCustomCache(getRestrictionKey(chatId), metadata, ttl);

  logger.warn('群组已标记为发送受限', {
    chatId,
    reason,
    ttl
  });
}

/**
 * 检查群组是否被标记为发送受限
 * @param {number|string} chatId
 * @returns {boolean}
 */
function isChatSendRestricted(chatId) {
  if (!chatId) {
    return false;
  }

  const data = cacheService.getCustomCache(getRestrictionKey(chatId));
  return Boolean(data?.restricted);
}

module.exports = {
  markChatSendRestricted,
  isChatSendRestricted
};

