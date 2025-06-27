/**
 * Status 命令处理器
 * 显示机器人和服务状态
 * 仅限管理员使用
 */

const messageStore = require('../storage/messageStore');
const azureOpenAI = require('../services/azureOpenAI');
const cacheService = require('../services/cacheService');
const logger = require('../utils/logger');
const { version } = require('../package.json');

/**
 * 检查用户是否为管理员
 * @param {number} userId - 用户ID
 * @returns {boolean} 是否为管理员
 */
function isAdmin(userId) {
  const adminIds = process.env.ADMIN_USER_IDS;
  if (!adminIds) {
    logger.warn('未配置管理员用户ID (ADMIN_USER_IDS)');
    return false;
  }
  
  const adminList = adminIds.split(',').map(id => parseInt(id.trim())).filter(id => !isNaN(id));
  return adminList.includes(userId);
}

const statusCommand = async (ctx) => {
  try {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || ctx.from.username || '未知用户';
    
    // 检查管理员权限
    if (!isAdmin(userId)) {
      logger.warn(`非管理员用户尝试访问状态命令`, {
        userId,
        userName,
        chatId: ctx.chat.id,
        chatType: ctx.chat.type
      });
      
      return ctx.reply(`🚫 *访问被拒绝*

抱歉，/status 命令仅限机器人管理员使用。

👤 当前用户：${userName}
🆔 用户ID：${userId}
🔒 权限级别：普通用户

如需帮助，请使用 /help 命令查看可用功能。`, {
        parse_mode: 'Markdown'
      });
    }

    logger.info(`管理员 ${userName} (${userId}) 执行状态查询`);
    
    const startTime = Date.now();
    
    // 获取基本信息
    const botInfo = ctx.botInfo;
    const chatInfo = ctx.chat;
    const userInfo = ctx.from;

    let statusMessage = `🤖 *机器人状态报告*\n\n`;
    statusMessage += `👑 *执行者*：${userName} (管理员)\n\n`;

    // 机器人基本信息
    statusMessage += `📱 *机器人信息*\n`;
    statusMessage += `• 名称：${botInfo.first_name}\n`;
    statusMessage += `• 用户名：@${botInfo.username}\n`;
    statusMessage += `• ID：${botInfo.id}\n`;
    statusMessage += `• 版本：v${version}\n\n`;

    // 当前聊天信息
    statusMessage += `💬 *当前聊天*\n`;
    if (chatInfo.type === 'private') {
      statusMessage += `• 类型：私聊\n`;
      statusMessage += `• 用户：${userInfo.first_name} (@${userInfo.username || 'N/A'})\n`;
    } else {
      statusMessage += `• 类型：${chatInfo.type === 'group' ? '群组' : '超级群组'}\n`;
      statusMessage += `• 名称：${chatInfo.title}\n`;
      statusMessage += `• ID：${chatInfo.id}\n`;
    }
    statusMessage += `\n`;

    // Azure OpenAI 服务状态
    const openaiStatus = azureOpenAI.getStatus();
    statusMessage += `🧠 *Azure OpenAI 服务*\n`;
    statusMessage += `• 状态：${openaiStatus.initialized ? '✅ 已连接' : '❌ 未连接'}\n`;
    if (openaiStatus.endpoint) {
      statusMessage += `• 端点：${openaiStatus.endpoint.replace(/^https?:\/\//, '')}\n`;
      statusMessage += `• 部署：${openaiStatus.deployment}\n`;
      statusMessage += `• API版本：${openaiStatus.apiVersion}\n`;
    } else {
      statusMessage += `• 配置：❌ 未配置\n`;
    }
    statusMessage += `\n`;

    // 如果是群组，显示消息统计
    if (chatInfo.type === 'group' || chatInfo.type === 'supergroup') {
      try {
        const stats = await messageStore.getChatStats(chatInfo.id);
        if (stats && stats.total_messages > 0) {
          statusMessage += `📊 *群组数据统计*\n`;
          statusMessage += `• 存储消息：${stats.total_messages} 条\n`;
          statusMessage += `• 参与用户：${stats.unique_users} 人\n`;
          
          const earliestDate = new Date(stats.earliest_message * 1000).toLocaleDateString('zh-CN');
          const latestDate = new Date(stats.latest_message * 1000).toLocaleDateString('zh-CN');
          statusMessage += `• 时间范围：${earliestDate} - ${latestDate}\n`;
          
          // 获取活跃用户
          const topUsers = await messageStore.getTopUsers(chatInfo.id, 3);
          if (topUsers.length > 0) {
            const userNames = topUsers.map(user => {
              const name = user.first_name || user.username || `用户${user.user_id}`;
              return `${name}(${user.message_count})`;
            }).join(', ');
            statusMessage += `• 活跃用户：${userNames}\n`;
          }
        } else {
          statusMessage += `📊 *群组数据统计*\n`;
          statusMessage += `• 存储消息：0 条\n`;
          statusMessage += `• 状态：机器人刚加入，暂无历史数据\n`;
        }
        statusMessage += `\n`;
      } catch (error) {
        logger.error('获取群组统计失败', error);
        statusMessage += `📊 *群组数据统计*\n`;
        statusMessage += `• 状态：❌ 数据获取失败\n\n`;
      }
    }

    // 缓存服务状态
    const cacheStats = cacheService.getCacheStats();
    statusMessage += `💾 *缓存状态*\n`;
    statusMessage += `• 总结缓存：${cacheStats.summary.keys} 项\n`;
    statusMessage += `• 统计缓存：${cacheStats.stats.keys} 项\n`;
    statusMessage += `• 用户缓存：${cacheStats.users.keys} 项\n`;
    statusMessage += `\n`;

    // 系统信息
    const uptime = process.uptime();
    const uptimeHours = Math.floor(uptime / 3600);
    const uptimeMinutes = Math.floor((uptime % 3600) / 60);
    const memoryUsage = process.memoryUsage();
    const memoryMB = Math.round(memoryUsage.rss / 1024 / 1024);

    statusMessage += `⚙️ *系统信息*\n`;
    statusMessage += `• 机器人版本：v${version}\n`;
    statusMessage += `• 运行时间：${uptimeHours}小时 ${uptimeMinutes}分钟\n`;
    statusMessage += `• 内存使用：${memoryMB} MB\n`;
    statusMessage += `• Node.js 版本：${process.version}\n`;

    const responseTime = Date.now() - startTime;
    statusMessage += `• 响应时间：${responseTime} ms\n`;

    // 发送状态消息
    return ctx.reply(statusMessage, {
      parse_mode: 'Markdown'
    });

  } catch (error) {
    logger.error('状态命令执行失败', error);
    
    return ctx.reply(`❌ 状态查询失败

抱歉，获取状态信息时发生了错误：
${error.message}

请稍后再试。`);
  }
};

module.exports = {
  command: 'status',
  description: '查看机器人和服务状态（仅管理员）',
  handler: statusCommand
}; 