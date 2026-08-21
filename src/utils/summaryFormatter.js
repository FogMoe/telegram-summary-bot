const { SUMMARY_LIMITS } = require('../config/constants');
const { escapeMarkdown, stripMarkdown, smartEscapeMarkdown } = require('./markdown');

function formatSummaryResponse(summaryResult, options = {}) {
  const { fromCache = false, escape = false } = options;
  const { summary = '', metadata = {} } = summaryResult || {};

  let response = `📋 *群组聊天总结*\n\n`;

  if (escape) {
    response += `${smartEscapeMarkdown(summary)}\n\n`;
  } else {
    response += `${summary}\n\n`;
  }

  response += `📊 *分析统计*\n`;
  response += `• 分析消息：${metadata.messagesAnalyzed ?? '—'} 条\n`;
  response += `• 参与用户：${metadata.uniqueUsers ?? '—'} 人\n`;

  if (metadata.timeRange) {
    const startTime = new Date(metadata.timeRange.earliest * 1000).toLocaleDateString('zh-CN');
    const endTime = new Date(metadata.timeRange.latest * 1000).toLocaleDateString('zh-CN');
    response += `• 时间范围：${startTime} - ${endTime}\n`;
  }

  if (metadata.topUsers && metadata.topUsers.length > 0) {
    const userNames = metadata.topUsers.slice(0, 3).map(u => {
      const name = u.first_name || u.username || `用户${u.user_id}`;
      return escapeMarkdown(name);
    }).join(', ');
    response += `• 活跃用户：${userNames}\n`;
  }

  if (fromCache) {
    response += `\n💾 *此结果来自缓存*`;
  }

  response += `\n\n⏰ 下次总结请等待${SUMMARY_LIMITS.COOLDOWN_MINUTES}分钟冷却期`;

  return response;
}

function formatPlainTextResponse(summaryResult, options = {}) {
  const { fromCache = false } = options;
  const { summary = '', metadata = {} } = summaryResult || {};

  let response = `📋 群组聊天总结\n\n`;
  response += `${stripMarkdown(summary)}\n\n`;
  response += `📊 分析统计\n`;
  response += `• 分析消息：${metadata.messagesAnalyzed ?? '—'} 条\n`;
  response += `• 参与用户：${metadata.uniqueUsers ?? '—'} 人\n`;

  if (metadata.timeRange) {
    const startTime = new Date(metadata.timeRange.earliest * 1000).toLocaleDateString('zh-CN');
    const endTime = new Date(metadata.timeRange.latest * 1000).toLocaleDateString('zh-CN');
    response += `• 时间范围：${startTime} - ${endTime}\n`;
  }

  if (metadata.topUsers && metadata.topUsers.length > 0) {
    const userNames = metadata.topUsers.slice(0, 3).map(u => {
      const name = u.first_name || u.username || `用户${u.user_id}`;
      return name;
    }).join(', ');
    response += `• 活跃用户：${userNames}\n`;
  }

  if (fromCache) {
    response += `\n💾 此结果来自缓存`;
  }

  response += `\n\n⏰ 下次总结请等待${SUMMARY_LIMITS.COOLDOWN_MINUTES}分钟冷却期`;

  return response;
}

module.exports = {
  formatSummaryResponse,
  formatPlainTextResponse
};
