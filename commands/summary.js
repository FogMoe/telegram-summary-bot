/**
 * Summary 命令处理器
 * 支持群组消息总结功能
 */

const messageStore = require('../storage/messageStore');
const azureOpenAI = require('../services/azureOpenAI');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');

const summaryCommand = async (ctx) => {
  try {
    // 检查是否在群组中
    if (ctx.chat.type === 'private') {
      return ctx.reply(`📝 Summary 命令使用说明

🔧 在群组中使用：
• /summary - 显示此帮助信息
• /summary <数量> - 总结最近的 1-1000 条消息

📊 功能特性：
• 智能分析群组聊天记录
• 识别主要话题和讨论重点
• 分析用户参与度和活跃情况
• 使用 AI 提供高质量总结

💡 使用示例：
• /summary 100 - 总结最近100条消息
• /summary 500 - 总结最近500条消息

⚠️ 注意事项：
• 只能在群组中使用总结功能
• 需要5分钟冷却期防止频繁调用
• 消息数量限制：1-1000条

请将我添加到群组中使用总结功能！`);
    }

    // 解析消息数量参数
    const payload = ctx.payload?.trim();
    let messageCount = 100; // 默认100条消息

    if (payload) {
      const parsed = parseInt(payload);
      if (isNaN(parsed)) {
        return ctx.reply(`❌ 参数错误！请输入有效的数字。

📝 正确格式：
/summary <数量>

🔢 数量范围：1-1000

💬 示例：
/summary 100 - 总结最近100条消息`);
      }

      if (parsed < 1 || parsed > 1000) {
        return ctx.reply(`❌ 消息数量超出范围！

🔢 有效范围：1-1000条消息

请输入 1 到 1000 之间的数字。`);
      }

      messageCount = parsed;
    }

    // 检查API请求频率限制
    if (!cacheService.canMakeAPIRequest(ctx.chat.id, ctx.from.id)) {
      const remainingTime = 5; // 简化显示
      return ctx.reply(`⏰ 请求过于频繁！

为了避免过度使用 AI 服务，每个用户在每个群组中需要等待5分钟才能再次使用总结功能。

请稍后再试。`);
    }

    // 发送处理中消息
    const processingMessage = await ctx.reply(`🔄 正在分析群组消息...

📊 准备总结最近 ${messageCount} 条消息
⏳ 预计需要 10-30 秒，请稍候...`);

    // 获取群组统计信息（先检查缓存）
    let stats = cacheService.getStatsCache(ctx.chat.id);
    if (!stats) {
      stats = await messageStore.getChatStats(ctx.chat.id);
      if (stats) {
        cacheService.setStatsCache(ctx.chat.id, stats);
      }
    }

    // 检查是否有足够的消息
    if (!stats || stats.total_messages === 0) {
      return ctx.editMessageText(`📭 暂无聊天记录

这个群组还没有足够的消息可供分析。机器人会自动存储群组中的文本消息，请先进行一些聊天再尝试总结功能。

💡 提示：机器人只会存储加入群组后的消息。`, {
        message_id: processingMessage.message_id
      });
    }

    if (stats.total_messages < messageCount) {
      messageCount = stats.total_messages;
    }

    // 检查总结缓存
    const cached = cacheService.getSummaryCache(
      ctx.chat.id, 
      messageCount, 
      stats.latest_message
    );

    if (cached) {
      return ctx.editMessageText(formatSummaryResponse(cached, messageCount, true), {
        message_id: processingMessage.message_id,
        parse_mode: 'Markdown'
      });
    }

    // 获取最近消息
    const messages = await messageStore.getRecentMessages(ctx.chat.id, messageCount);
    
    if (messages.length === 0) {
      return ctx.editMessageText(`📭 未找到消息记录

无法获取群组的聊天记录。请确保：
1. 机器人已正确加入群组
2. 群组中有足够的文本消息
3. 机器人有读取消息的权限`, {
        message_id: processingMessage.message_id
      });
    }

    // 获取活跃用户信息
    let topUsers = cacheService.getUserCache(ctx.chat.id, 10);
    if (!topUsers) {
      const users = await messageStore.getTopUsers(ctx.chat.id, 10);
      topUsers = { users };
      cacheService.setUserCache(ctx.chat.id, 10, topUsers);
    }

    // 使用 Azure OpenAI 生成总结
    try {
      const summaryResult = await azureOpenAI.summarizeMessages(
        messages, 
        stats, 
        topUsers.users || []
      );

      // 缓存总结结果
      cacheService.setSummaryCache(
        ctx.chat.id,
        messageCount,
        stats.latest_message,
        summaryResult
      );

      // 发送总结结果
      return ctx.editMessageText(
        formatSummaryResponse(summaryResult, messageCount, false), 
        {
          message_id: processingMessage.message_id,
          parse_mode: 'Markdown'
        }
      );

    } catch (error) {
      logger.error('生成总结失败', error);
      
      // 检查是否是消息过长错误
      if (error.name === 'MessageTooLongError') {
        const currentChars = error.textLength;
        const maxChars = error.maxLength;
        const suggestedCount = Math.floor(messageCount * (maxChars / currentChars));
        
        logger.info('用户请求的消息记录过长', {
          chatId: ctx.chat.id,
          userId: ctx.from.id,
          requestedCount: messageCount,
          actualLength: currentChars,
          suggestedCount: suggestedCount
        });
        
        return ctx.editMessageText(`⚠️ 消息记录过长

📏 当前消息长度：${currentChars.toLocaleString()} 字符
📏 最大允许长度：${maxChars.toLocaleString()} 字符

💡 建议解决方案：
• 减少消息数量到 ${suggestedCount} 条左右
• 或者选择更短的时间范围进行总结

🔄 请重新执行命令：
/summary ${suggestedCount}

这样可以确保总结功能正常工作。`, {
          message_id: processingMessage.message_id
        });
      }
      
      return ctx.editMessageText(`❌ 总结生成失败

很抱歉，在生成总结时遇到了问题：
${error.message}

请稍后再试，或联系管理员检查 Azure OpenAI 服务配置。`, {
        message_id: processingMessage.message_id
      });
    }

  } catch (error) {
    logger.error('Summary 命令执行失败', error);
    
    return ctx.reply(`❌ 命令执行失败

抱歉，执行总结命令时发生了错误。请稍后再试。

如果问题持续存在，请联系管理员。`);
  }
};

/**
 * 格式化总结响应消息
 */
function formatSummaryResponse(summaryResult, messageCount, fromCache) {
  const { summary, metadata } = summaryResult;
  
  let response = `📋 *群组聊天总结*\n\n`;
  
  // 总结内容
  response += `${summary}\n\n`;
  
  // 元数据信息
  response += `📊 *分析统计*\n`;
  response += `• 分析消息：${metadata.messagesAnalyzed} 条\n`;
  response += `• 参与用户：${metadata.uniqueUsers} 人\n`;
  
  if (metadata.timeRange) {
    const startTime = new Date(metadata.timeRange.earliest * 1000).toLocaleDateString('zh-CN');
    const endTime = new Date(metadata.timeRange.latest * 1000).toLocaleDateString('zh-CN');
    response += `• 时间范围：${startTime} - ${endTime}\n`;
  }
  
  if (metadata.topUsers && metadata.topUsers.length > 0) {
    response += `• 活跃用户：${metadata.topUsers.slice(0, 3).map(u => 
      u.first_name || u.username || `用户${u.user_id}`
    ).join(', ')}\n`;
  }
  
  if (metadata.tokensUsed) {
    response += `• API 用量：${metadata.tokensUsed} tokens\n`;
  }
  
  // 缓存标识
  if (fromCache) {
    response += `\n💾 *此结果来自缓存*`;
  }
  
  response += `\n\n⏰ 下次总结请等待5分钟冷却期`;
  
  return response;
}

module.exports = {
  command: 'summary',
  description: '总结群组聊天记录 (支持 1-1000 条消息)',
  handler: summaryCommand
}; 