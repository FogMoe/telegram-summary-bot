/**
 * 消息监听中间件
 * 自动存储群组消息到数据库
 */

const messageStore = require('../storage/messageStore');
const logger = require('../utils/logger');
const { MESSAGE_STATS } = require('../config/constants');

/**
 * 消息存储中间件
 * 监听所有文本消息并存储群组消息（过滤bot自身消息）
 */
const messageStoreMiddleware = async (ctx, next) => {
  try {
    // 只处理文本消息
    if (ctx.message && ctx.message.text) {
      // 获取bot信息（优先使用上下文中的，其次使用bot实例中的）
      const botId = ctx.botInfo?.id || ctx.telegram?.botInfo?.id || null;
      const senderId = ctx.message.from?.id;
      
      // 过滤掉bot自己发送的消息，防止"总结套娃"
      if (botId && senderId && senderId === botId) {
        logger.info('过滤bot自身消息', {
          messageId: ctx.message.message_id,
          chatId: ctx.message.chat.id,
          botId: botId,
          senderId: senderId,
          messagePreview: ctx.message.text.length > 50 
            ? ctx.message.text.substring(0, 50) + '...' 
            : ctx.message.text
        });
        
        // 继续处理下一个中间件，但不存储消息
        return next();
      }
      
      // 异步存储消息（不阻塞消息处理）
      setImmediate(async () => {
        try {
          // 在存储前处理用户名
          if (ctx.message.from) {
            if (ctx.message.from.username) {
              ctx.message.from.username = ctx.message.from.username.replace(/_/g, '-');
            }
            if (ctx.message.from.first_name) {
              ctx.message.from.first_name = ctx.message.from.first_name.replace(/_/g, '-');
            }
          }
          
          await messageStore.storeMessage(ctx.message, botId);
        } catch (error) {
          logger.error('存储消息失败', {
            messageId: ctx.message.message_id,
            chatId: ctx.message.chat.id,
            senderId: senderId,
            error: error.message
          });
        }
      });
    }

    // 继续处理下一个中间件
    return next();
  } catch (error) {
    logger.error('消息监听中间件错误', error);
    return next();
  }
};

/**
 * 群组状态监控中间件
 * 监控机器人加入/离开群组的状态
 */
const groupStatusMiddleware = (ctx, next) => {
  try {
    // 处理新成员加入事件
    if (ctx.message?.new_chat_members) {
      const botInfo = ctx.botInfo;
      const newMembers = ctx.message.new_chat_members;
      
      // 检查机器人是否被添加到群组
      const botAdded = newMembers.some(member => member.id === botInfo.id);
      
      if (botAdded) {
        logger.success(`机器人已加入群组: ${ctx.chat.title} (${ctx.chat.id})`);
        
        // 发送欢迎消息
        ctx.reply(`🎉 感谢邀请我加入群组！

我是 Telegram Summary Bot，可以帮助总结群组聊天记录。

📝 主要功能：
• 使用 /summary 查看使用说明
• 使用 /summary <数量> 总结最近的聊天记录
• 自动存储群组消息以供分析

我会开始监听并存储群组消息，用于生成有用的聊天总结。

如需帮助，请使用 /help 命令。`).catch(err => {
          logger.error('发送欢迎消息失败', err);
        });
      }
    }

    // 处理成员离开事件
    if (ctx.message?.left_chat_member) {
      const botInfo = ctx.botInfo;
      const leftMember = ctx.message.left_chat_member;
      
      // 检查机器人是否被移出群组
      if (leftMember.id === botInfo.id) {
        logger.info(`机器人已离开群组: ${ctx.chat.title} (${ctx.chat.id})`);
        
        // 可以在这里清理该群组的数据
        // 但考虑到用户可能重新邀请机器人，暂时保留数据
      }
    }

    return next();
  } catch (error) {
    logger.error('群组状态监控中间件错误', error);
    return next();
  }
};

/**
 * 聊天类型过滤中间件
 * 记录不同类型聊天的统计信息
 */
const chatTypeLogger = (ctx, next) => {
  try {
    if (ctx.chat) {
      const chatType = ctx.chat.type;
      const chatId = ctx.chat.id;
      const chatTitle = ctx.chat.title || '私聊';

      // 记录聊天类型统计
      if (chatType === 'group' || chatType === 'supergroup') {
        logger.info(`群组消息: ${chatTitle} (${chatId})`, {
          type: chatType,
          messageId: ctx.message?.message_id,
          userId: ctx.from?.id,
          hasText: !!ctx.message?.text
        });
      } else if (chatType === 'private') {
        logger.info(`私聊消息: ${ctx.from?.first_name} (${ctx.from?.id})`, {
          messageId: ctx.message?.message_id,
          hasText: !!ctx.message?.text
        });
      }
    }

    return next();
  } catch (error) {
    logger.error('聊天类型过滤中间件错误', error);
    return next();
  }
};

/**
 * 消息统计中间件
 * 收集消息统计信息
 */
const messageStatsMiddleware = (() => {
  let messageCount = 0;
  let groupMessageCount = 0;
  let privateMessageCount = 0;
  let lastStatsReport = Date.now();
  
  return (ctx, next) => {
    try {
      messageCount++;
      
      if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
        groupMessageCount++;
      } else if (ctx.chat?.type === 'private') {
        privateMessageCount++;
      }

      // 每1000条消息或每小时报告一次统计
      const now = Date.now();
      const shouldReport = (
        messageCount % MESSAGE_STATS.REPORT_EVERY_MESSAGES === 0 || 
        (now - lastStatsReport) > MESSAGE_STATS.REPORT_INTERVAL_MS
      );

      if (shouldReport) {
        logger.info('消息统计报告', {
          total: messageCount,
          groups: groupMessageCount,
          private: privateMessageCount,
          period: `${Math.round((now - lastStatsReport) / 1000 / 60)}分钟`
        });
        lastStatsReport = now;
      }

      return next();
    } catch (error) {
      logger.error('消息统计中间件错误', error);
      return next();
    }
  };
})();

module.exports = {
  messageStoreMiddleware,
  groupStatusMiddleware,
  chatTypeLogger,
  messageStatsMiddleware
}; 
