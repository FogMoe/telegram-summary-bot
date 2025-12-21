/**
 * Admin 命令处理器
 * 管理员专用数据库查询和管理功能
 * 仅限管理员使用
 */

const messageStore = require('../storage/messageStore');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');
const { validateNumber } = require('../middleware/inputValidation');
const { isAdmin } = require('../utils/admin');

/**
 * 解析子命令和参数
 * @param {string} payload - 命令参数
 * @returns {Object} 解析结果
 */
function parseAdminCommand(payload) {
  if (!payload) {
    return { subCommand: 'help', args: [] };
  }

  const parts = payload.trim().split(' ').filter(part => part.length > 0);
  const subCommand = parts[0] || 'help';
  const args = parts.slice(1);

  return { subCommand: subCommand.toLowerCase(), args };
}

/**
 * 格式化数据库查询结果
 * @param {Array} results - 查询结果
 * @param {string} title - 标题
 * @returns {string} 格式化的消息
 */
function formatQueryResults(results, title) {
  if (!results || results.length === 0) {
    return `📊 *${title}*\n\n❌ 没有找到数据`;
  }

  let message = `📊 *${title}*\n\n`;
  
  results.forEach((row, index) => {
    message += `${index + 1}. `;
    Object.entries(row).forEach(([key, value]) => {
      message += `${key}: ${value} `;
    });
    message += '\n';
  });

  return message;
}

/**
 * 处理聊天统计查询
 * @param {Object} ctx - Telegraf 上下文
 * @param {Array} args - 参数数组
 */
async function handleChatStats(ctx, args) {
  try {
    let chatId = null;
    
    if (args.length > 0) {
      chatId = validateNumber(args[0]);
      if (chatId === null) {
        return ctx.reply('❌ 无效的群组ID格式');
      }
    } else {
      // 如果没有指定群组ID，使用当前群组
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        chatId = ctx.chat.id;
      } else {
        return ctx.reply('❌ 请指定群组ID或在群组中执行此命令');
      }
    }

    const stats = await messageStore.getChatStats(chatId);
    
    if (!stats || stats.total_messages === 0) {
      return ctx.reply(`📊 *群组统计* (${chatId})\n\n❌ 该群组暂无数据`, {
        parse_mode: 'Markdown'
      });
    }

    const earliestDate = new Date(stats.earliest_message * 1000);
    const latestDate = new Date(stats.latest_message * 1000);

    const message = `📊 *群组统计* (${chatId})

💬 总消息数：${stats.total_messages}
👥 参与用户：${stats.unique_users}
📅 数据范围：${earliestDate.toLocaleDateString('zh-CN')} - ${latestDate.toLocaleDateString('zh-CN')}
⏰ 最新消息：${latestDate.toLocaleString('zh-CN')}`;

    return ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    logger.error('获取聊天统计失败', error);
    return ctx.reply('❌ 查询失败：' + error.message);
  }
}

/**
 * 处理活跃用户查询
 * @param {Object} ctx - Telegraf 上下文
 * @param {Array} args - 参数数组
 */
async function handleTopUsers(ctx, args) {
  try {
    let chatId = null;
    let limit = 10;
    
    if (args.length > 0) {
      chatId = validateNumber(args[0]);
      if (chatId === null) {
        return ctx.reply('❌ 无效的群组ID格式');
      }
    } else {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        chatId = ctx.chat.id;
      } else {
        return ctx.reply('❌ 请指定群组ID或在群组中执行此命令');
      }
    }

    if (args.length > 1) {
      limit = validateNumber(args[1], 1, 50);
      if (limit === null) {
        return ctx.reply('❌ 无效的用户数量（1-50）');
      }
    }

    const users = await messageStore.getTopUsers(chatId, limit);
    
    if (!users || users.length === 0) {
      return ctx.reply(`👥 *活跃用户* (${chatId})\n\n❌ 该群组暂无用户数据`, {
        parse_mode: 'Markdown'
      });
    }

    let message = `👥 *活跃用户* (${chatId})\n\n`;
    
    users.forEach((user, index) => {
      const name = user.first_name || user.username || `用户${user.user_id}`;
      message += `${index + 1}. ${name} - ${user.message_count} 条消息\n`;
    });

    return ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    logger.error('获取活跃用户失败', error);
    return ctx.reply('❌ 查询失败：' + error.message);
  }
}

/**
 * 处理缓存状态查询
 * @param {Object} ctx - Telegraf 上下文
 */
async function handleCacheStatus(ctx) {
  try {
    const stats = cacheService.getCacheStats();
    
    const message = `💾 *缓存状态*

📋 总结缓存：
• 键数量：${stats.summary.keys}
• 命中次数：${stats.summary.hits}
• 错失次数：${stats.summary.misses}

📊 统计缓存：
• 键数量：${stats.stats.keys}
• 命中次数：${stats.stats.hits}
• 错失次数：${stats.stats.misses}

👥 用户缓存：
• 键数量：${stats.users.keys}
• 命中次数：${stats.users.hits}
• 错失次数：${stats.users.misses}`;

    return ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    logger.error('获取缓存状态失败', error);
    return ctx.reply('❌ 查询失败：' + error.message);
  }
}

/**
 * 处理缓存清理
 * @param {Object} ctx - Telegraf 上下文
 * @param {Array} args - 参数数组
 */
async function handleClearCache(ctx, args) {
  try {
    if (args.length > 0) {
      const chatId = validateNumber(args[0]);
      if (chatId === null) {
        return ctx.reply('❌ 无效的群组ID格式');
      }
      
      cacheService.clearChatCache(chatId);
      return ctx.reply(`✅ 已清除群组 ${chatId} 的缓存`);
    } else {
      cacheService.clearAllCache();
      return ctx.reply('✅ 已清除所有缓存');
    }
    
  } catch (error) {
    logger.error('清理缓存失败', error);
    return ctx.reply('❌ 清理失败：' + error.message);
  }
}

/**
 * 处理删除群组消息记录
 * @param {Object} ctx - Telegraf 上下文
 * @param {Array} args - 参数数组
 */
async function handleDeleteMessages(ctx, args) {
  try {
    let chatId = null;
    let confirmed = false;

    // 参数情况：
    // 1) /admin delete [chatId] confirm
    // 2) /admin delete [chatId]
    // 3) /admin delete confirm  (当前群组)
    // 4) /admin delete          (当前群组预览)

    // 如果只传了一个参数并且是 confirm，则表示当前群组确认删除
    if (args.length === 1 && args[0].toLowerCase() === 'confirm') {
      confirmed = true;
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        chatId = ctx.chat.id;
      } else {
        return ctx.reply('❌ 私聊环境下必须指定群组ID');
      }
    } else {
      // 第一个参数应为 chatId（可选）
      if (args.length > 0) {
        chatId = validateNumber(args[0]);
        if (chatId === null) {
          return ctx.reply('❌ 无效的群组ID格式');
        }
      } else if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        chatId = ctx.chat.id;
      } else {
        return ctx.reply('❌ 请指定群组ID或在群组中执行此命令');
      }

      // 检查第二个参数是否为 confirm
      if (args.length > 1 && args[1].toLowerCase() === 'confirm') {
        confirmed = true;
      }
    }

    // 如果没有确认参数，显示警告和确认信息
    if (!confirmed) {
      // 先获取统计信息显示给管理员
      const stats = await messageStore.getChatStats(chatId);
      
      if (!stats || stats.total_messages === 0) {
        return ctx.reply(`🗑️ *删除消息记录* (${chatId})\n\n❌ 该群组没有存储的消息记录`, {
          parse_mode: 'Markdown'
        });
      }

      const earliestDate = new Date(stats.earliest_message * 1000);
      const latestDate = new Date(stats.latest_message * 1000);

      let confirmCommand;
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        confirmCommand = chatId === ctx.chat.id ? 
          `/admin delete confirm` : 
          `/admin delete ${chatId} confirm`;
      } else {
        confirmCommand = `/admin delete ${chatId} confirm`;
      }

      return ctx.reply(`⚠️ *危险操作确认*

📊 即将删除群组数据：
🆔 群组ID：${chatId}
💬 消息数量：${stats.total_messages} 条
👥 涉及用户：${stats.unique_users} 人
📅 时间范围：${earliestDate.toLocaleDateString('zh-CN')} - ${latestDate.toLocaleDateString('zh-CN')}

🚨 *此操作不可逆！所有该群组的聊天记录将被永久删除*

✅ 如需确认删除，请执行：\`${confirmCommand}\`
❌ 如不确认则不会执行任何操作`, {
        parse_mode: 'Markdown'
      });
    }

    // 确认后执行删除
    const result = await messageStore.deleteChatMessages(chatId);
    
    if (result.success) {
      // 同时清除相关缓存
      cacheService.clearChatCache(chatId);
      
      let message = `✅ *删除操作完成*\n\n`;
      message += `🆔 群组ID：${chatId}\n`;
      message += `🗑️ 删除记录：${result.deletedCount} 条\n`;
      if (result.originalTotal) {
        message += `📊 原始总数：${result.originalTotal} 条\n`;
      }
      message += `💾 缓存已清理\n`;
      message += `⏰ 操作时间：${new Date().toLocaleString('zh-CN')}`;

      logger.info(`管理员删除群组消息记录`, {
        adminId: ctx.from.id,
        adminName: ctx.from.first_name || ctx.from.username,
        chatId,
        deletedCount: result.deletedCount,
        originalTotal: result.originalTotal
      });

      return ctx.reply(message, { parse_mode: 'Markdown' });
    } else {
      return ctx.reply(`❌ 删除失败：${result.message}`);
    }
    
  } catch (error) {
    logger.error('删除群组消息记录失败', error);
    return ctx.reply('❌ 删除失败：' + error.message);
  }
}

/**
 * 处理最近消息查询
 * @param {Object} ctx - Telegraf 上下文
 * @param {Array} args - 参数数组
 */
async function handleRecentMessages(ctx, args) {
  try {
    let chatId = null;
    let limit = 10;
    
    if (args.length > 0) {
      chatId = validateNumber(args[0]);
      if (chatId === null) {
        return ctx.reply('❌ 无效的群组ID格式');
      }
    } else {
      if (ctx.chat.type === 'group' || ctx.chat.type === 'supergroup') {
        chatId = ctx.chat.id;
      } else {
        return ctx.reply('❌ 请指定群组ID或在群组中执行此命令');
      }
    }

    if (args.length > 1) {
      limit = validateNumber(args[1], 1, 20);
      if (limit === null) {
        return ctx.reply('❌ 无效的消息数量（1-20）');
      }
    }

    const messages = await messageStore.getRecentMessages(chatId, limit);
    
    if (!messages || messages.length === 0) {
      return ctx.reply(`💬 *最近消息* (${chatId})\n\n❌ 该群组暂无消息数据`, {
        parse_mode: 'Markdown'
      });
    }

    let message = `💬 *最近消息* (${chatId})\n\n`;
    
    messages.slice(-5).forEach((msg, index) => { // 只显示最后5条
      const name = msg.first_name || msg.username || `用户${msg.user_id}`;
      const date = new Date(msg.date * 1000).toLocaleString('zh-CN');
      const text = msg.text.length > 50 ? msg.text.substring(0, 50) + '...' : msg.text;
      message += `${index + 1}. ${name} (${date})\n   ${text}\n\n`;
    });

    return ctx.reply(message, { parse_mode: 'Markdown' });
    
  } catch (error) {
    logger.error('获取最近消息失败', error);
    return ctx.reply('❌ 查询失败：' + error.message);
  }
}

/**
 * 显示帮助信息
 * @param {Object} ctx - Telegraf 上下文
 */
function showHelp(ctx) {
  const helpMessage = `🔧 *管理员命令帮助*

📊 **数据查询**
\`/admin stats [群组ID]\` - 查看群组统计
\`/admin users [群组ID] [数量]\` - 查看活跃用户
\`/admin messages [群组ID] [数量]\` - 查看最近消息

💾 **缓存管理**
\`/admin cache\` - 查看缓存状态
\`/admin clear [群组ID]\` - 清除缓存

🗑️ **数据管理**
\`/admin delete [群组ID] [confirm]\` - 删除群组的所有聊天记录

📝 **参数说明**
• 群组ID：可选，不填则使用当前群组
• 数量：可选，默认值为10
• confirm：删除命令的确认参数，必须添加才会执行删除

💡 **使用示例**
\`/admin stats\` - 查看当前群组统计
\`/admin users -1001234567890 20\` - 查看指定群组前20名用户
\`/admin clear\` - 清除所有缓存
\`/admin delete -1001234567890\` - 预览删除信息（不会执行）
\`/admin delete -1001234567890 confirm\` - 确认删除指定群组
\`/admin delete confirm\` - 确认删除当前群组

⚠️ **安全提示**
• delete 命令需要添加 confirm 参数才会执行，操作不可逆
• 删除操作会同时清除相关缓存和数据库记录
• 仅管理员可执行此命令`;

  return ctx.reply(helpMessage, { parse_mode: 'Markdown' });
}

/**
 * 主命令处理器
 */
const adminCommand = async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || ctx.from.username || '未知用户';
    
    // 检查管理员权限
    if (!isAdmin(userId)) {
      logger.warn(`非管理员用户尝试访问管理命令`, {
        userId,
        userName,
        chatId: ctx.chat.id,
        chatType: ctx.chat.type
      });
      
      return ctx.reply(`🚫 *访问被拒绝*

抱歉，/admin 命令仅限机器人管理员使用。

👤 当前用户：${userName}
🆔 用户ID：${userId}
🔒 权限级别：普通用户`, {
        parse_mode: 'Markdown'
      });
    }

    logger.info(`管理员 ${userName} (${userId}) 执行管理命令`, {
      payload: ctx.payload
    });

    // 解析子命令
    const { subCommand, args } = parseAdminCommand(ctx.payload);

    switch (subCommand) {
      case 'stats':
        return await handleChatStats(ctx, args);
      
      case 'users':
        return await handleTopUsers(ctx, args);
      
      case 'messages':
        return await handleRecentMessages(ctx, args);
      
      case 'cache':
        return await handleCacheStatus(ctx);
      
      case 'clear':
        return await handleClearCache(ctx, args);
      
      case 'delete':
        return await handleDeleteMessages(ctx, args);
      
      case 'help':
      default:
        return showHelp(ctx);
    }

  } catch (error) {
    logger.error('Admin 命令执行失败', error);
    
    return ctx.reply(`❌ 命令执行失败

抱歉，执行管理命令时发生了错误：${error.message}

请检查命令格式或稍后再试。`);
  }
};

module.exports = {
  command: 'admin',
  description: '管理员数据库查询和管理功能（仅管理员）',
  handler: adminCommand
}; 
