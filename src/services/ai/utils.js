/**
 * 将文本截断到指定的 token 限制
 */
function truncateToTokenLimit(text, maxTokens) {
  // 更准确的中文token估算：约 2 个字符 = 1 个 token
  const estimatedTokens = text.length / 2;
  
  if (estimatedTokens <= maxTokens) {
    return text;
  }

  // 计算需要保留的字符数，更保守的估计
  const maxChars = maxTokens * 1.8; // 更保守，确保不超限
  
  // 从末尾开始截断，保留最新的消息
  const truncated = text.slice(-maxChars);
  
  // 找到第一个完整的消息行
  const firstNewline = truncated.indexOf('\n');
  if (firstNewline > 0) {
    return truncated.slice(firstNewline + 1);
  }
  
  return truncated;
}

/**
 * 处理用户名中的特殊字符，避免Markdown冲突
 * @param {string} userName - 原始用户名
 * @returns {string} 处理后的安全用户名
 */
function makeSafeUserName(userName) {
  if (!userName || typeof userName !== 'string') {
    return userName;
  }

  return userName
    .replace(/_/g, '-')      // 下划线替换为中划线
    .replace(/\*/g, '·')     // 星号替换为中点
    .replace(/`/g, "'")      // 反引号替换为单引号
    .replace(/\[/g, '(')     // 左方括号替换为左圆括号
    .replace(/\]/g, ')');    // 右方括号替换为右圆括号
}

module.exports = {
  truncateToTokenLimit,
  makeSafeUserName,
}; 