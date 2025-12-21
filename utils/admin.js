const logger = require('./logger');

let cachedAdminIds = null;
let warnedMissingAdmins = false;

function getAdminIds() {
  if (cachedAdminIds) {
    return cachedAdminIds;
  }

  const adminIds = process.env.ADMIN_USER_IDS;
  if (!adminIds) {
    if (!warnedMissingAdmins) {
      logger.warn('未配置管理员用户ID (ADMIN_USER_IDS)');
      warnedMissingAdmins = true;
    }
    cachedAdminIds = [];
    return cachedAdminIds;
  }

  cachedAdminIds = adminIds
    .split(',')
    .map(id => Number.parseInt(id.trim(), 10))
    .filter(id => Number.isFinite(id));

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
