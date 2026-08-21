/**
 * AI/网络错误分类
 * 判断错误属于网络错误还是内容过滤错误，决定重试与用户提示策略
 */

const logger = require('../../utils/logger');

/**
 * 检查是否为网络连接错误
 */
function isNetworkError(error) {
  if (!error) return false;

  const networkErrorCodes = ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'];
  const networkErrorTypes = ['system', 'network'];

  return Boolean(
    networkErrorCodes.includes(error.code) ||
    networkErrorTypes.includes(error.type) ||
    (error.message && error.message.includes('connect ETIMEDOUT')) ||
    (error.message && error.message.includes('network')) ||
    (error.response && error.response.error_code === 429) // Rate limit
  );
}

/**
 * 检查是否为内容过滤错误
 */
function isContentFilterError(error) {
  if (!error) return false;

  // 检查 OpenAI 兼容服务的 content_filter 错误码
  if (error.code === 'content_filter') {
    logger.debug('检测到content_filter错误码', {
      code: error.code,
      status: error.status
    });
    return true;
  }

  // 检查错误消息内容
  const errorMessage = error.message || error.toString();
  const errorString = String(errorMessage);

  // 检查状态码和错误内容
  const hasContentFilterStatus = error.status === 400;
  const hasContentFilterMessage = (
    errorString.includes('content management policy') ||
    errorString.includes('content filtering') ||
    errorString.includes('filtered due to the prompt') ||
    errorString.includes('Azure OpenAI\'s content management policy') ||
    errorString.includes('OpenAI policy') ||
    errorString.includes('ResponsibleAIPolicyViolation') ||
    errorString.includes('content_filter_result') ||
    errorString.includes('违反内容政策') ||
    errorString.includes('内容过滤')
  );

  const result = hasContentFilterStatus && hasContentFilterMessage;

  if (hasContentFilterStatus) {
    logger.debug('内容过滤错误检测', {
      status: error.status,
      code: error.code,
      hasContentFilterMessage,
      isContentFilterError: result,
      errorPreview: errorString.substring(0, 100)
    });
  }

  return result;
}

/**
 * 检查是否为 Telegram Markdown 解析错误（400 "can't parse entities"）
 */
function isMarkdownParseError(error) {
  return Boolean(
    error &&
    error.response &&
    error.response.error_code === 400 &&
    error.response.description &&
    error.response.description.includes("can't parse entities")
  );
}

module.exports = {
  isNetworkError,
  isContentFilterError,
  isMarkdownParseError
};
