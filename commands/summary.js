/**
 * Summary 命令处理器
 * 支持群组消息总结功能
 */

const messageStore = require('../storage/messageStore');
const aiService = require('../services/aiService');
const cacheService = require('../services/cacheService');
const taskQueue = require('../services/taskQueue');
const logger = require('../utils/logger');
const { validateNumber, sanitizeInput } = require('../middleware/inputValidation');
const { escapeMarkdown, stripMarkdown, safeMarkdownProcess } = require('../utils/markdown');

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

请将我添加到群组中使用总结功能！`, {
        disable_web_page_preview: true
      });
    }

    // 解析消息数量参数
    const payload = sanitizeInput(ctx.payload?.trim() || '');
    let messageCount = 100; // 默认100条消息

    if (payload) {
      const parsed = validateNumber(payload, 1, 1000);
      if (parsed === null) {
        return ctx.reply(`❌ 参数错误！请输入有效的数字。

📝 正确格式：
/summary <数量>

🔢 数量范围：1-1000

💬 示例：
/summary 100 - 总结最近100条消息`, {
          disable_web_page_preview: true
        });
      }

      messageCount = parsed;
    }

    // 检查API请求频率限制
    if (!cacheService.canMakeAPIRequest(ctx.chat.id, ctx.from.id)) {
      const remainingTime = 5; // 简化显示
      return ctx.reply(`⏰ 请求过于频繁！

为了避免过度使用 AI 服务，每个用户在每个群组中需要等待5分钟才能再次使用总结功能。

请稍后再试。`, {
        disable_web_page_preview: true
      });
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
        message_id: processingMessage.message_id,
        disable_web_page_preview: true
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
      logger.info('使用缓存的总结结果', {
        chatId: ctx.chat.id,
        messageCount: messageCount,
        userId: ctx.from.id
      });
      
      // 发送缓存的总结结果（带错误处理）
      try {
        // 先尝试原生Markdown格式
        return await ctx.editMessageText(formatSummaryResponse(cached, messageCount, true, false), {
          message_id: processingMessage.message_id,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        });
      } catch (markdownError) {
        // 如果是Markdown格式错误，尝试转义后重试
        if (markdownError.response && 
            markdownError.response.error_code === 400 && 
            markdownError.response.description && 
            markdownError.response.description.includes("can't parse entities")) {
          
          logger.warn('缓存消息Markdown格式错误，尝试转义后重试', {
            chatId: ctx.chat.id,
            error: markdownError.response.description,
            errorOffset: markdownError.response.description.match(/byte offset (\d+)/)
          });
          
          try {
            // 使用转义版本重试
            const escapedResponse = formatSummaryResponse(cached, messageCount, true, true);
            return await ctx.editMessageText(escapedResponse, {
              message_id: processingMessage.message_id,
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            });
          } catch (escapedError) {
            // 检查是否仍然是Markdown格式错误
            if (escapedError.response && 
                escapedError.response.error_code === 400 && 
                escapedError.response.description && 
                escapedError.response.description.includes("can't parse entities")) {
              
              logger.warn('转义后仍有Markdown格式错误，尝试安全处理器', {
                chatId: ctx.chat.id,
                error: escapedError.response.description
              });
              
              try {
                // 使用安全Markdown处理器
                const safeCached = {
                  summary: safeMarkdownProcess(cached.summary),
                  metadata: cached.metadata || {}
                };
                const safeResponse = formatSummaryResponse(safeCached, messageCount, true, false);
                
                return await ctx.editMessageText(safeResponse, {
                  message_id: processingMessage.message_id,
                  parse_mode: 'Markdown',
                  disable_web_page_preview: true
                });
                
              } catch (safeError) {
                logger.warn('安全Markdown处理器也失败，使用纯文本格式', {
                  chatId: ctx.chat.id,
                  error: safeError.response?.description
                });
              }
            }
            
            // 最终回退：使用纯文本
            const plainTextResponse = formatPlainTextResponse(cached, messageCount, true);
            
            return await ctx.editMessageText(plainTextResponse, {
              message_id: processingMessage.message_id,
              disable_web_page_preview: true
            });
          }
        }
        
        // 如果不是Markdown格式错误，重新抛出
        throw markdownError;
      }
    }

    // 获取最近消息
    const messages = await messageStore.getRecentMessages(ctx.chat.id, messageCount);
    
    if (messages.length === 0) {
      return ctx.editMessageText(`📭 未找到消息记录

无法获取群组的聊天记录。请确保：
1. 机器人已正确加入群组
2. 群组中有足够的文本消息
3. 机器人有读取消息的权限`, {
        message_id: processingMessage.message_id,
        disable_web_page_preview: true
      });
    }

    // 获取活跃用户信息
    let topUsers = cacheService.getUserCache(ctx.chat.id, 10);
    if (!topUsers) {
      const users = await messageStore.getTopUsers(ctx.chat.id, 10);
      cacheService.setUserCache(ctx.chat.id, 10, users);
      topUsers = { users };
    }

    // 确保 topUsers.users 是数组
    const usersList = Array.isArray(topUsers?.users) ? topUsers.users : [];
    
    logger.info('准备生成总结', {
      chatId: ctx.chat.id,
      messagesCount: messages.length,
      topUsersCount: usersList.length,
      dataType: typeof topUsers,
      usersType: typeof topUsers?.users,
      isUsersArray: Array.isArray(topUsers?.users),
      firstUser: usersList[0] ? `${usersList[0].first_name || usersList[0].username || 'Unknown'}(${usersList[0].message_count})` : 'none'
    });

    // 标记API请求开始（只有确实要调用AI时才标记）
    cacheService.markAPIRequestStarted(ctx.chat.id, ctx.from.id);

    // 使用任务队列异步处理总结请求
    try {
      const taskId = taskQueue.addSummaryTask({
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        messageId: processingMessage.message_id,
        messages,
        stats,
        topUsers: usersList,
        messageCount
      });

      // 立即回复用户，保持原有风格
      await ctx.editMessageText(`🔄 正在分析群组消息...

📊 准备总结最近 ${messageCount} 条消息
⏳ 预计需要 10-30 秒，请稍候...

💭 正在处理中，稍后自动更新结果...`, {
        message_id: processingMessage.message_id,
        disable_web_page_preview: true
      });

      // 存储消息ID以便后续更新
      cacheService.setCustomCache(`task_message_${taskId}`, {
        chatId: ctx.chat.id,
        messageId: processingMessage.message_id,
        userId: ctx.from.id
      }, 15 * 60); // 15分钟过期

      logger.info('总结任务已提交到队列', {
        taskId,
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        messageCount
      });

    } catch (error) {
      logger.error('提交总结任务失败', error);
      
      return ctx.editMessageText(`❌ 任务提交失败

很抱歉，在提交总结任务时遇到了问题：
${error.message}

请稍后再试，或联系管理员检查服务配置。`, {
        message_id: processingMessage.message_id,
        disable_web_page_preview: true
      });
    }

  } catch (error) {
    logger.error('Summary 命令执行失败', error);
    
    return ctx.reply(`❌ 命令执行失败

抱歉，执行总结命令时发生了错误。请稍后再试。

如果问题持续存在，请联系管理员。`, {
      disable_web_page_preview: true
    });
  }
};



/**
 * 格式化总结响应消息
 */
function formatSummaryResponse(summaryResult, messageCount, fromCache, escape = false) {
  const { summary, metadata = {} } = summaryResult;
  
  let response = `📋 *群组聊天总结*\n\n`;
  
  // 智能转义：保留AI生成的标题格式，转义其他特殊字符
  if (escape) {
    const formattedSummary = smartEscapeMarkdown(summary);
    response += `${formattedSummary}\n\n`;
  } else {
    response += `${summary}\n\n`;
  }
  
  // 元数据信息
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
      // 用户名总是需要转义，因为可能包含特殊字符
      return escapeMarkdown(name);
    }).join(', ');
    response += `• 活跃用户：${userNames}\n`;
  }
  
  // if (metadata.tokensUsed) {
  //   response += `• 字符数量：${metadata.charactersUsed || metadata.tokensUsed || 0}\n`;
  // }
  
  // 缓存标识
  if (fromCache) {
    response += `\n💾 *此结果来自缓存*`;
  }
  
  response += `\n\n⏰ 下次总结请等待5分钟冷却期`;
  
  return response;
}

/**
 * 智能转义Markdown：保留标题格式，转义其他特殊字符
 */
function smartEscapeMarkdown(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // 保护标题格式：*📌 标题* 或 *标题*
  const titlePattern = /\*([^*\n]+)\*/g;
  const titles = [];
  let titleIndex = 0;

  // 先提取所有标题，用占位符替换，并同时转义标题内部的下划线
  const textWithPlaceholders = text.replace(titlePattern, (match) => {
    // 对标题内部的下划线进行转义，保持星号不变
    const escapedTitle = match.replace(/_/g, '\\_');
    titles.push(escapedTitle);
    return `%%TITLE_PLACEHOLDER_${titleIndex++}%%`;
  });

  // 转义非标题部分的特殊字符
  // 注意：下划线的转义很重要，因为它是斜体标记
  const escapedText = textWithPlaceholders
    .replace(/\\/g, '\\\\')    // 反斜杠 (必须最先处理)
    .replace(/_/g, '\\_')      // 下划线 - 斜体标记（处理用户名中的下划线）
    .replace(/`/g, '\\`')      // 反引号 - 代码标记  
    .replace(/\[/g, '\\[');    // 左方括号 - 链接标记

  // 恢复标题格式
  let finalText = escapedText;
  titles.forEach((title, index) => {
    finalText = finalText.replace(`%%TITLE_PLACEHOLDER_${index}%%`, title);
  });

  return finalText;
}

/**
 * 格式化纯文本响应消息（无Markdown格式）
 */
function formatPlainTextResponse(summaryResult, messageCount, fromCache) {
  const { summary, metadata = {} } = summaryResult;
  
  let response = `📋 群组聊天总结\n\n`;
  
  // 移除summary中的所有Markdown标记
  const plainSummary = stripMarkdown(summary);
  
  response += `${plainSummary}\n\n`;
  
  // 元数据信息
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
      return name; // 纯文本格式不需要转义
    }).join(', ');
    response += `• 活跃用户：${userNames}\n`;
  }
  
  // if (metadata.tokensUsed) {
  //   response += `• 字符数量：${metadata.charactersUsed || metadata.tokensUsed || 0}\n`;
  // }
  
  // 缓存标识
  if (fromCache) {
    response += `\n💾 此结果来自缓存`;
  }
  
  response += `\n\n⏰ 下次总结请等待5分钟冷却期`;
  
  return response;
}

module.exports = {
  command: 'summary',
  description: '总结群组聊天记录 (支持 1-1000 条消息)',
  handler: summaryCommand
}; 