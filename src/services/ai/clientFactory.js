const OpenAI = require('openai');
const config = require('../../config');
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
    apiKey: config.ai.primary.apiKey,
    baseURL: config.ai.primary.baseURL,
    label: '主要API'
  });
}

/**
 * 初始化备用客户端（OpenAI 兼容）
 * @returns {OpenAI | null}
 */
function initFallbackClient() {
  return buildClient({
    apiKey: config.ai.fallback.apiKey,
    baseURL: config.ai.fallback.baseURL,
    label: '备用API'
  });
}

module.exports = {
  initPrimaryClient,
  initFallbackClient
};
