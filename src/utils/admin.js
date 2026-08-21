const config = require('../config');
const logger = require('./logger');

let cachedAdminIds = null;
let warnedMissingAdmins = false;

function getAdminIds() {
  if (cachedAdminIds) {
    return cachedAdminIds;
  }

  if (config.adminUserIds.length === 0) {
    if (!warnedMissingAdmins) {
      logger.warn('未配置管理员用户ID (ADMIN_USER_IDS)');
      warnedMissingAdmins = true;
    }
    cachedAdminIds = [];
    return cachedAdminIds;
  }

  cachedAdminIds = config.adminUserIds;
  return cachedAdminIds;
}

function isAdmin(userId) {
  if (!userId) {
    return false;
  }
  return getAdminIds().includes(userId);
}

module.exports = {
  getAdminIds,
  isAdmin
};
