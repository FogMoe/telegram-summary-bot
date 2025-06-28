const { AzureOpenAI } = require('openai');
const OpenAI = require('openai');
const logger = require('../../utils/logger');

/**
 * 初始化主要客户端 (Gemini API)
 * @returns {OpenAI | null}
 */
function initPrimaryClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.warn('主要模型环境变量缺失: GEMINI_API_KEY');
    return null;
  }

  try {
    const client = new OpenAI({
      apiKey: apiKey,
      baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
    });
    logger.info('Gemini API 客户端初始化成功');
    return client;
  } catch (error) {
    logger.error('Gemini API 客户端初始化失败', error);
    return null;
  }
}

/**
 * 初始化备用客户端 (Azure OpenAI)
 * @returns {AzureOpenAI | null}
 */
function initFallbackClient() {
  const { AZURE_OPENAI_API_KEY, AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_DEPLOYMENT_NAME } = process.env;

  if (!AZURE_OPENAI_API_KEY || !AZURE_OPENAI_ENDPOINT || !AZURE_OPENAI_DEPLOYMENT_NAME) {
    logger.warn('备用模型 (Azure) 配置不完整，跳过初始化');
    return null;
  }
  
  try {
    const client = new AzureOpenAI({
      apiKey: AZURE_OPENAI_API_KEY,
      endpoint: AZURE_OPENAI_ENDPOINT,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview',
      deployment: AZURE_OPENAI_DEPLOYMENT_NAME
    });
    logger.info('Azure OpenAI 备用客户端初始化成功');
    return client;
  } catch (error) {
    logger.error('Azure OpenAI 备用客户端初始化失败', error);
    return null;
  }
}

module.exports = {
  initPrimaryClient,
  initFallbackClient
}; 