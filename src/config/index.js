/**
 * 集中配置模块
 * 统一读取环境变量，其余模块一律从此处获取配置，不再散读 process.env
 */

const path = require('path');

const DEFAULT_MODEL = 'gpt-4o-mini';

function parseAdminIds(raw) {
  if (!raw) {
    return [];
  }
  return raw
    .split(',')
    .map((id) => Number.parseInt(id.trim(), 10))
    .filter((id) => Number.isFinite(id));
}

const primaryModel = process.env.PRIMARY_MODEL || DEFAULT_MODEL;

const config = {
  // Telegram 机器人 Token（必需）
  botToken: process.env.BOT_TOKEN || '',

  // 管理员用户 ID 列表（逗号分隔）
  adminUserIds: parseAdminIds(process.env.ADMIN_USER_IDS),

  // SQLite 数据库文件路径
  databasePath: process.env.DATABASE_PATH
    ? path.resolve(process.env.DATABASE_PATH)
    : path.join(process.cwd(), 'storage', 'messages.db'),

  // 日志级别（debug/info/warn/error，留空输出全部）
  logLevel: (process.env.LOG_LEVEL || '').toLowerCase(),

  ai: {
    primary: {
      apiKey: process.env.PRIMARY_API_KEY || '',
      baseURL: process.env.PRIMARY_API_BASE_URL || '',
      model: primaryModel
    },
    fallback: {
      apiKey: process.env.FALLBACK_API_KEY || '',
      baseURL: process.env.FALLBACK_API_BASE_URL || '',
      model: process.env.FALLBACK_MODEL || primaryModel
    }
  }
};

module.exports = config;
