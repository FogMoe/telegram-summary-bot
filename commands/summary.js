/**
 * Summary 命令处理器
 * 支持群组消息总结功能
 */

const messageStore = require('../storage/messageStore');
const cacheService = require('../services/cacheService');
const taskQueue = require('../services/taskQueue');
const chatPermissionService = require('../services/chatPermissionService');
const logger = require('../utils/logger');
const { SUMMARY_LIMITS } = require('../config/constants');
const { validateNumber, sanitizeInput } = require('../middleware/inputValidation');
const { safeMarkdownProcess } = require('../utils/markdown');
const { formatSummaryResponse, formatPlainTextResponse } = require('../utils/summaryFormatter');
const { safeReply, safeEditMessageText } = require('../utils/telegramSafety');

const summaryCommand = async (ctx) => {
  try {
    // 检查是否在群组中
    if (ctx.chat.type === 'private') {
      return await safeReply(ctx, `📝 Summary 命令使用说明

🔧 在群组中使用：
• /summary - 显示此帮助信息
• /summary <数量> - 总结最近的 ${SUMMARY_LIMITS.MIN_MESSAGE_COUNT}-${SUMMARY_LIMITS.MAX_MESSAGE_COUNT} 条消息

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
• 需要${SUMMARY_LIMITS.COOLDOWN_MINUTES}分钟冷却期防止频繁调用
• 消息数量限制：${SUMMARY_LIMITS.MIN_MESSAGE_COUNT}-${SUMMARY_LIMITS.MAX_MESSAGE_COUNT}条

请将我添加到群组中使用总结功能！`, {
        disable_web_page_preview: true
      });
    }

    if (chatPermissionService.isChatSendRestricted(ctx.chat.id)) {
      logger.warn('检测到群组发送权限受限，忽略 summary 命令', {
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        updateId: ctx.update?.update_id
      });
      return;
    }

    // 解析消息数量参数
    const payload = sanitizeInput(ctx.payload?.trim() || '');
    let messageCount = SUMMARY_LIMITS.DEFAULT_MESSAGE_COUNT; // 默认消息数

    if (payload) {
      const parsed = validateNumber(
        payload,
        SUMMARY_LIMITS.MIN_MESSAGE_COUNT,
        SUMMARY_LIMITS.MAX_MESSAGE_COUNT
      );
      if (parsed === null) {
        return await safeReply(ctx, `❌ 参数错误！请输入有效的数字。

📝 正确格式：
/summary <数量>

🔢 数量范围：${SUMMARY_LIMITS.MIN_MESSAGE_COUNT}-${SUMMARY_LIMITS.MAX_MESSAGE_COUNT}

💬 示例：
/summary 100 - 总结最近100条消息`, {
          disable_web_page_preview: true
        });
      }

      messageCount = parsed;
    }

    // 检查API请求频率限制
    if (!cacheService.canMakeAPIRequest(ctx.chat.id, ctx.from.id)) {
      const remainingMs = cacheService.getApiCooldownRemaining(ctx.chat.id, ctx.from.id);
      const remainingMinutes = remainingMs
        ? Math.max(1, Math.ceil(remainingMs / 1000 / 60))
        : SUMMARY_LIMITS.COOLDOWN_MINUTES;

      return await safeReply(ctx, `⏰ 请求过于频繁！

为了避免过度使用 AI 服务，每个用户在每个群组中需要等待${remainingMinutes}分钟才能再次使用总结功能。

请稍后再试。`, {
        disable_web_page_preview: true
      });
    }

    // 发送处理中消息
    const processingMessage = await safeReply(ctx, `🔄 正在分析群组消息...

📊 准备总结最近 ${messageCount} 条消息
⏳ 预计需要 ${SUMMARY_LIMITS.PROCESSING_ESTIMATE_SECONDS} 秒，请稍候...`);

    if (!processingMessage) {
      logger.warn('无法发送处理中提示消息，summary 命令提前结束', {
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        updateId: ctx.update?.update_id
      });
      return;
    }

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
      return await safeEditMessageText(ctx, `📭 暂无聊天记录

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
        return await safeEditMessageText(ctx, formatSummaryResponse(cached, {
          fromCache: true,
          escape: false
        }), {
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
            const escapedResponse = formatSummaryResponse(cached, {
              fromCache: true,
              escape: true
            });
            return await safeEditMessageText(ctx, escapedResponse, {
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
                const safeResponse = formatSummaryResponse(safeCached, {
                  fromCache: true,
                  escape: false
                });
                
                return await safeEditMessageText(ctx, safeResponse, {
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
            const plainTextResponse = formatPlainTextResponse(cached, {
              fromCache: true
            });
            
            return await safeEditMessageText(ctx, plainTextResponse, {
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
      return await safeEditMessageText(ctx, `📭 未找到消息记录

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
      await safeEditMessageText(ctx, `🔄 正在分析群组消息...

📊 准备总结最近 ${messageCount} 条消息
⏳ 预计需要 ${SUMMARY_LIMITS.PROCESSING_ESTIMATE_SECONDS} 秒，请稍候...

💭 正在处理中，稍后自动更新结果...`, {
        message_id: processingMessage.message_id,
        disable_web_page_preview: true
      });

      // 存储消息ID以便后续更新
      cacheService.setCustomCache(`task_message_${taskId}`, {
        chatId: ctx.chat.id,
        messageId: processingMessage.message_id,
        userId: ctx.from.id
      }, SUMMARY_LIMITS.TASK_MESSAGE_TTL_SECONDS);

      logger.info('总结任务已提交到队列', {
        taskId,
        chatId: ctx.chat.id,
        userId: ctx.from.id,
        messageCount
      });

    } catch (error) {
      logger.error('提交总结任务失败', error);
      
      return await safeEditMessageText(ctx, `❌ 任务提交失败

很抱歉，在提交总结任务时遇到了问题：
${error.message}

请稍后再试，或联系管理员检查服务配置。`, {
        message_id: processingMessage.message_id,
        disable_web_page_preview: true
      });
    }

  } catch (error) {
    logger.error('Summary 命令执行失败', error);
    
    await safeReply(ctx, `❌ 命令执行失败

抱歉，执行总结命令时发生了错误。请稍后再试。

如果问题持续存在，请联系管理员。`, {
      disable_web_page_preview: true
    });

    return;
  }
};


module.exports = {
  command: 'summary',
  description: `总结群组聊天记录 (支持 ${SUMMARY_LIMITS.MIN_MESSAGE_COUNT}-${SUMMARY_LIMITS.MAX_MESSAGE_COUNT} 条消息)`,
  handler: summaryCommand
};
