/**
 * Summary 命令处理器
 * 支持群组消息总结功能
 */

const messageStore = require('../services/messageStore');
const cacheService = require('../services/cacheService');
const taskQueue = require('../services/taskQueue');
const chatPermissionService = require('../services/chatPermissionService');
const logger = require('../utils/logger');
const { SUMMARY_LIMITS } = require('../config/constants');
const { validateNumber, sanitizeInput } = require('../utils/validation');
const { safeReply, safeEditMessageText } = require('../telegram/safety');
const { sendWithMarkdownFallback } = require('../services/summaryDelivery/summarySender');

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

      // 发送缓存的总结结果（四级 Markdown 降级链；权限错误由 safeEditMessageText 吞掉，
      // 网络等其它错误上抛给外层统一兜底）
      await sendWithMarkdownFallback({
        summaryResult: cached,
        fromCache: true,
        rethrowNetworkErrors: false,
        logLabel: '缓存消息',
        logContext: { chatId: ctx.chat.id, userId: ctx.from.id },
        send: (text, options) => safeEditMessageText(ctx, text, {
          ...options,
          message_id: processingMessage.message_id
        })
      });

      return;
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
