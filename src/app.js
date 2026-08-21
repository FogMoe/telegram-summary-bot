/**
 * 应用组装根
 * 创建机器人实例、初始化服务、注册中间件与命令、处理优雅停止
 */

const { Telegraf } = require('telegraf');
const config = require('./config');
const logger = require('./utils/logger');
const { COMMAND_THROTTLE } = require('./config/constants');

const { loadCommands } = require('./commands');

const { requestLogger, commandLogger } = require('./middleware/logging');
const { rateLimiter, userValidator } = require('./middleware/security');
const { inputValidation } = require('./middleware/inputValidation');
const { createCommandThrottle, commandThrottle } = require('./middleware/commandThrottle');
const duplicateGuard = require('./middleware/duplicateGuard');
const {
  messageStoreMiddleware,
  groupStatusMiddleware,
  chatTypeLogger,
  messageStatsMiddleware
} = require('./middleware/messageListener');

const messageStore = require('./services/messageStore');
const aiService = require('./services/aiService');
const cacheService = require('./services/cacheService');
const taskQueue = require('./services/taskQueue');
const TaskQueueHandler = require('./services/summaryDelivery/taskQueueHandler');
const { safeReply } = require('./telegram/safety');

// 初始化服务
async function initializeServices(bot) {
  try {
    logger.info('正在初始化服务...');

    // 初始化消息存储
    await messageStore.init();

    const hasPrimaryConfig = Boolean(config.ai.primary.apiKey);
    const hasFallbackConfig = Boolean(config.ai.fallback.apiKey);

    if (hasPrimaryConfig || hasFallbackConfig) {
      await aiService.init();

      const connectionResult = await aiService.testConnection();
      if (connectionResult.success) {
        logger.success('AI 服务连接正常');
      } else {
        logger.warn('AI 服务连接异常，但机器人将继续运行');
      }
    } else {
      logger.warn('未配置 AI 服务环境变量，总结功能将不可用');
    }

    // 初始化任务队列事件监听器
    const taskQueueHandler = new TaskQueueHandler(bot);
    taskQueueHandler.setupEventHandlers(taskQueue);

    logger.success('所有服务初始化完成');
  } catch (error) {
    logger.error('服务初始化失败', error);
    throw error;
  }
}

// 注册中间件（按顺序执行）
function registerMiddleware(bot) {
  logger.info('正在注册中间件...');

  // 防重复处理中间件（最优先）
  bot.use(duplicateGuard); // 防止重复处理同一个update（ctx.botInfo 由 Telegraf 自行注入）

  // 基础中间件
  bot.use(requestLogger); // 请求日志
  bot.use(inputValidation); // 输入验证（安全第一）
  bot.use(userValidator); // 用户验证
  bot.use(rateLimiter); // 速率限制

  // 命令节流中间件（针对特定命令）
  bot.use(createCommandThrottle('summary', COMMAND_THROTTLE.DEFAULT_THROTTLE_MS));

  // 消息处理中间件
  bot.use(messageStoreMiddleware); // 消息存储
  bot.use(groupStatusMiddleware); // 群组状态监控
  bot.use(chatTypeLogger); // 聊天类型日志
  bot.use(messageStatsMiddleware); // 消息统计
  bot.use(commandLogger); // 命令日志

  logger.success('中间件注册完成');
}

// 获取并记录bot信息
async function setupBotInfo(bot) {
  try {
    const botInfo = await bot.telegram.getMe();

    // 将bot信息存储到bot实例中，确保在所有上下文中可用
    bot.botInfo = botInfo;

    logger.success('Bot信息获取成功', {
      id: botInfo.id,
      username: botInfo.username,
      firstName: botInfo.first_name,
      isBot: botInfo.is_bot
    });

    logger.info(`Bot过滤已启用，将自动过滤Bot ID: ${botInfo.id} 发送的消息`);
  } catch (error) {
    logger.error('获取bot信息失败', error);
    throw error;
  }
}

// 显示服务状态
function displayServiceStatus() {
  logger.info('=== 服务状态 ===');

  const openaiStatus = aiService.getStatus();
  logger.info('AI 服务:', {
    initialized: openaiStatus.initialized,
    primary: openaiStatus.primary,
    fallback: openaiStatus.fallback
  });

  const cacheStats = cacheService.getCacheStats();
  logger.info('缓存服务:', cacheStats);

  logger.info('================');
}

// 优雅停止函数
async function gracefulShutdown(bot, signal) {
  logger.info(`收到 ${signal} 信号，正在优雅停止...`);

  try {
    // 停止机器人
    bot.stop(signal);
    logger.info('机器人已停止');

    // 关闭数据库连接
    await messageStore.close();
    logger.info('数据库连接已关闭');

    // 关闭缓存服务
    cacheService.close();
    logger.info('缓存服务已关闭');

    // 清理防重复中间件资源
    if (duplicateGuard.cleanup) {
      duplicateGuard.cleanup();
    }

    // 清理速率限制器资源
    if (rateLimiter.cleanup) {
      rateLimiter.cleanup();
    }

    // 清理命令节流器资源
    if (commandThrottle.cleanup) {
      commandThrottle.cleanup();
    }

    // 清理任务队列资源
    try {
      taskQueue.cleanup();
      logger.info('任务队列已清理');
    } catch (error) {
      logger.error('清理任务队列失败', error);
    }

    logger.success('所有服务已优雅停止');
    process.exit(0);
  } catch (error) {
    logger.error('优雅停止过程中发生错误', error);
    process.exit(1);
  }
}

// 启动应用
async function start() {
  if (!config.botToken) {
    throw new Error('BOT_TOKEN 未配置：请在 .env 中设置 Telegram 机器人 Token');
  }

  const bot = new Telegraf(config.botToken);

  // 全局错误处理
  bot.catch(async (err, ctx) => {
    const updateId = ctx?.update?.update_id;
    logger.error(`处理更新时发生错误 ${updateId}`, err);

    if (!ctx) {
      return;
    }

    await safeReply(ctx, '抱歉，处理您的请求时发生了错误，请稍后再试。');
  });

  // 优雅停止
  process.once('SIGINT', () => gracefulShutdown(bot, 'SIGINT'));
  process.once('SIGTERM', () => gracefulShutdown(bot, 'SIGTERM'));

  try {
    // 初始化服务
    await initializeServices(bot);

    // 获取并记录bot信息
    await setupBotInfo(bot);

    // 注册中间件
    registerMiddleware(bot);

    // 加载命令模块
    loadCommands(bot);

    // 启动机器人（长轮询）
    await bot.launch();

    logger.success('机器人已成功启动！');
    logger.info('机器人正在监听消息...');

    // 显示服务状态
    displayServiceStatus();
  } catch (error) {
    logger.error('机器人启动失败', error);
    process.exit(1);
  }
}

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  logger.error('未捕获的异常', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('未处理的 Promise 拒绝', { reason, promise });
  process.exit(1);
});

module.exports = { start };
