/**
 * Telegram 错误辅助函数
 * 用于识别特定的权限错误
 */

/**
 * 提取 Telegram 错误描述
 * @param {Error} error
 * @returns {string}
 */
function getTelegramErrorDescription(error) {
  if (!error) {
    return '';
  }

  return (
    error.response?.description ||
    error.description ||
    error.message ||
    ''
  );
}

/**
 * 判断是否为发送消息权限不足错误
 * @param {Error} error
 * @returns {boolean}
 */
function isSendMessageForbiddenError(error) {
  const description = getTelegramErrorDescription(error).toLowerCase();

  if (!description) {
    return false;
  }

  if (error?.response?.error_code && ![400, 403].includes(error.response.error_code)) {
    return false;
  }

  return (
    description.includes('not enough rights to send text messages to the chat') ||
    description.includes('not enough rights to send messages') ||
    description.includes('have no rights to send a message') ||
    description.includes('chat write forbidden')
  );
}

module.exports = {
  getTelegramErrorDescription,
  isSendMessageForbiddenError
};

