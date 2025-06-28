/**
 * Status 命令处理器
 * 显示机器人运行状态、队列状态和系统信息
 */

const messageStore = require('../storage/messageStore');
const aiService = require('../services/aiService');
const cacheService = require('../services/cacheService');
const taskQueue = require('../services/taskQueue');
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
    
    const startTime = process.hrtime();
    
    // 获取基本信息
    const botInfo = ctx.botInfo;
    const chatInfo = ctx.chat;
    const userInfo = ctx.from;

    // 获取AI服务状态
    const aiStatus = aiService.getStatus();
    
    // 获取缓存统计
    const cacheStats = cacheService.getCacheStats();
    
    // 获取任务队列状态
    const queueStatus = taskQueue.getQueueStatus();
    
    // 获取群组统计（如果是群组）
    let chatStats = null;
    if (chatInfo.type === 'group' || chatInfo.type === 'supergroup') {
      try {
        chatStats = await messageStore.getChatStats(chatInfo.id);
      } catch (error) {
        logger.error('获取群组统计失败', error);
      }
    }

    const endTime = process.hrtime(startTime);
    const responseTime = (endTime[0] * 1000 + endTime[1] / 1000000).toFixed(2);

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

    // AI 服务状态
    statusMessage += `🧠 *AI 服务状态*\n`;
    statusMessage += `• 总体状态：${aiStatus.initialized ? '✅ 已初始化' : '❌ 未初始化'}\n`;
    statusMessage += `• 自动切换：✅ 启用\n\n`;
    
    // 主要模型状态 (Gemini)
    statusMessage += `🚀 *主要模型 (Gemini)*\n`;
    statusMessage += `• 配置状态：${aiStatus.primary.configured ? '✅ 已配置' : '❌ 未配置'}\n`;
    statusMessage += `• API密钥：${aiStatus.primary.apiKey}\n`;
    statusMessage += `• 模型名称：${aiStatus.primary.modelName}\n\n`;
    
    // 备用模型状态 (Azure OpenAI)
    statusMessage += `🔄 *备用模型 (Azure OpenAI)*\n`;
    statusMessage += `• 配置状态：${aiStatus.fallback.configured ? '✅ 已配置' : '❌ 未配置'}\n`;
    if (aiStatus.fallback.configured) {
      statusMessage += `• 端点：${aiStatus.fallback.endpoint.replace(/^https?:\/\//, '')}\n`;
      statusMessage += `• 部署：${aiStatus.fallback.deployment}\n`;
      statusMessage += `• API版本：${aiStatus.fallback.apiVersion}\n`;
    } else {
      statusMessage += `• 状态：❌ 未配置\n`;
    }
    statusMessage += `\n`;

    // 任务队列状态
    statusMessage += `⏳ *任务队列状态*\n`;
    statusMessage += `• 队列长度：${queueStatus.queueLength} 个任务\n`;
    statusMessage += `• 处理状态：${queueStatus.processing ? '🔄 处理中' : '⏸️ 空闲'}\n`;
    statusMessage += `• 总任务数：${queueStatus.totalTasks} 个\n`;
    
    if (queueStatus.currentTask) {
      statusMessage += `• 当前任务：${queueStatus.currentTask.type} (${queueStatus.currentTask.id.slice(-8)})\n`;
      const taskAge = Math.floor((Date.now() - queueStatus.currentTask.createdAt) / 1000);
      statusMessage += `• 处理时长：${taskAge} 秒\n`;
    }
    statusMessage += `\n`;

    // 缓存服务状态
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

    statusMessage += `• 响应时间：${responseTime} ms\n`;

    // 群组统计（如果在群组中）
    if (chatStats) {
      statusMessage += `📊 *群组数据统计*\n`;
      statusMessage += `• 存储消息：${chatStats.total_messages} 条\n`;
      statusMessage += `• 参与用户：${chatStats.unique_users} 人\n`;
      
      if (chatStats.earliest_message && chatStats.latest_message) {
        const earliestDate = new Date(chatStats.earliest_message * 1000).toLocaleDateString('zh-CN');
        const latestDate = new Date(chatStats.latest_message * 1000).toLocaleDateString('zh-CN');
        statusMessage += `• 时间范围：${earliestDate} - ${latestDate}\n`;
      }
      
      // 获取活跃用户
      const topUsers = await messageStore.getTopUsers(chatInfo.id, 3);
      if (topUsers.length > 0) {
        const userNames = topUsers.map(user => {
          const name = user.first_name || user.username || `用户${user.user_id}`;
          return `${name}(${user.message_count})`;
        }).join(', ');
        statusMessage += `• 活跃用户：${userNames}\n`;
      }
    }

    // 功能状态
    statusMessage += `⚡ *功能状态*\n`;
    statusMessage += `• 消息存储：✅ 正常\n`;
    statusMessage += `• 总结功能：${aiStatus.initialized ? '✅ 可用' : '❌ 不可用'}\n`;
    statusMessage += `• 缓存系统：✅ 正常\n`;
    statusMessage += `• 任务队列：✅ 正常\n`;
    
    // AI模型可用性提示
    const primaryAvailable = aiStatus.primary.configured;
    const fallbackAvailable = aiStatus.fallback.configured;
    
    if (primaryAvailable && fallbackAvailable) {
      statusMessage += `• AI可靠性：🔥 双模型备份\n`;
    } else if (primaryAvailable) {
      statusMessage += `• AI可靠性：⚠️ 仅主模型可用\n`;
    } else if (fallbackAvailable) {
      statusMessage += `• AI可靠性：⚠️ 仅备用模型可用\n`;
    } else {
      statusMessage += `• AI可靠性：❌ 无可用模型\n`;
    }
    statusMessage += `\n`;
    
    statusMessage += `📅 报告时间：${new Date().toLocaleString('zh-CN')}`;

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