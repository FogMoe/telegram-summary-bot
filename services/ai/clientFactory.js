const OpenAI = require('openai');
const logger = require('../../utils/logger');

function buildClient({ apiKey, baseURL, label }) {
  if (!apiKey) {
    logger.warn(`${label} API Key 未配置`);
    return null;
  }

  try {
    const options = { apiKey };
    if (baseURL) {
      options.baseURL = baseURL;
    }
    const client = new OpenAI(options);
    logger.info(`${label} 客户端初始化成功`);
    return client;
  } catch (error) {
    logger.error(`${label} 客户端初始化失败`, error);
    return null;
  }
}

/**
 * 初始化主要客户端（OpenAI 兼容）
 * @returns {OpenAI | null}
 */
function initPrimaryClient() {
  return buildClient({
    apiKey: process.env.PRIMARY_API_KEY,
    baseURL: process.env.PRIMARY_API_BASE_URL,
    label: '主要API'
  });
}

/**
 * 初始化备用客户端（OpenAI 兼容）
 * @returns {OpenAI | null}
 */
function initFallbackClient() {
  return buildClient({
    apiKey: process.env.FALLBACK_API_KEY,
    baseURL: process.env.FALLBACK_API_BASE_URL,
    label: '备用API'
  });
}

module.exports = {
  initPrimaryClient,
  initFallbackClient
};
