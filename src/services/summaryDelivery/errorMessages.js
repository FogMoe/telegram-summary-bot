/**
 * 任务失败/推送失败的用户提示文案
 */

const { escapeMarkdown } = require('../../utils/markdown');
const { SUMMARY_LIMITS } = require('../../config/constants');
const { isNetworkError, isContentFilterError } = require('./errorClassification');

/**
 * 获取统一的内容过滤错误消息
 */
function getContentFilterMessage() {
  return `🤖 内容安全提醒

💬 检测到讨论内容可能包含不当信息，为了维护良好的交流环境，AI无法处理此次总结请求。

🌟 建议优化方向：
• 鼓励积极正面的讨论话题
• 避免争议性或冒犯性内容
• 提倡理性友善的交流方式
• 分享有价值的信息和观点

🔄 解决方案：
• 等待群组产生更多正面内容后重新总结
• 尝试使用 /summary 50 总结更少的消息
• 管理员可引导群组讨论向积极方向发展

💡 我们致力于创建一个友善、包容的交流空间！`;
}

/**
 * 获取统一的网络错误消息
 */
function getNetworkErrorMessage(error) {
  // 转义错误消息中的特殊字符
  const errorMessage = escapeMarkdown(error.message || error);

  return `⚠️ 网络连接错误

🔗 连接到AI服务时遇到网络问题：
${errorMessage}

💡 建议解决方案：
• 检查网络连接状态
• 稍后重试命令
• 如果问题持续，请联系管理员

🔄 请重新执行命令：
/summary`;
}

/**
 * 获取统一的消息过长错误消息
 */
function getMessageTooLongErrorMessage() {
  return `⚠️ 消息记录过长

💡 建议解决方案：
• 减少消息数量（尝试 100-500 条）
• 选择更短的时间范围进行总结

🔄 请重新执行命令：
/summary 300`;
}

/**
 * 获取任务完成后的网络错误消息
 */
function getNetworkErrorMessageForTask(result) {
  // 安全地获取消息数量，处理 result 为 undefined 的情况
  const messageCount = Number(
    result?.metadata?.messagesAnalyzed ?? SUMMARY_LIMITS.DEFAULT_MESSAGE_COUNT
  );

  return `📋 总结已完成

⚠️ 网络连接不稳定，推送失败

🔄 可能的解决方案：
• 请稍后使用 /summary ${messageCount} 重新获取
• 检查网络连接状态
• 如果问题持续，请联系管理员

💾 总结结果已保存，可随时重新获取`;
}

/**
 * 格式化错误消息
 */
function formatErrorMessage(error) {
  // 检查是否是内容过滤错误
  if (isContentFilterError(error)) {
    return getContentFilterMessage();
  }

  // 检查是否是网络连接错误
  if (isNetworkError(error)) {
    return getNetworkErrorMessage(error);
  }

  // 将错误转换为字符串以便安全检查
  const errorString = error?.message || error?.toString() || String(error);

  // 检查是否是消息过长错误
  if (errorString.includes('MessageTooLongError') || errorString.includes('消息记录过长')) {
    return getMessageTooLongErrorMessage();
  }

  // 通用错误消息 - 转义错误内容
  const errorMessage = escapeMarkdown(errorString);
  return `❌ 总结生成失败

很抱歉，在生成总结时遇到了问题：
${errorMessage}

请稍后再试，或联系管理员检查 AI 服务配置。`;
}

module.exports = {
  getContentFilterMessage,
  getNetworkErrorMessage,
  getMessageTooLongErrorMessage,
  getNetworkErrorMessageForTask,
  formatErrorMessage
};
