/**
 * 任务队列事件处理器
 * 订阅任务队列的完成/失败事件，将结果通过 summarySender 推送给用户
 */

const cacheService = require('../cacheService');
const chatPermissionService = require('../chatPermissionService');
const logger = require('../../utils/logger');
const { preProcessMarkdown } = require('../../utils/markdown');
const { formatSummaryResponse } = require('../../utils/summaryFormatter');
const { SUMMARY_LIMITS } = require('../../config/constants');
const { isSendMessageForbiddenError, getTelegramErrorDescription } = require('../../telegram/errors');
const { isNetworkError, isContentFilterError } = require('./errorClassification');
const { retryNetworkOperation } = require('./retry');
const { formatErrorMessage, getContentFilterMessage, getNetworkErrorMessageForTask } = require('./errorMessages');
const { createTelegramEditSender, sendSingleSummary, sendSegmentedSummary } = require('./summarySender');

class TaskQueueHandler {
  constructor(bot) {
    this.bot = bot;
  }

  /**
   * 设置任务队列事件监听器
   * @param {Object} taskQueue - 任务队列实例
   */
  setupEventHandlers(taskQueue) {
    // 任务完成事件
    taskQueue.on('taskCompleted', async (event) => {
      await this.handleTaskCompleted(event);
    });

    // 任务失败事件
    taskQueue.on('taskFailed', async (event) => {
      await this.handleTaskFailed(event);
    });

    logger.info('任务队列事件处理器已设置');
  }

  /**
   * 处理任务完成事件
   */
  async handleTaskCompleted(event) {
    const { taskId, chatId, userId, result } = event;

    if (chatPermissionService.isChatSendRestricted(chatId)) {
      logger.warn('群组发送权限受限，跳过推送总结结果', {
        taskId,
        chatId,
        userId
      });
      return;
    }

    try {
      // 获取原始消息信息
      const messageInfo = cacheService.getCustomCache(`task_message_${taskId}`);
      if (!messageInfo) {
        logger.warn('未找到任务关联的消息信息', { taskId, chatId, userId });
        return;
      }

      // 使用预处理器增强原生Markdown的健壮性
      const processedSummary = preProcessMarkdown(result.summary);
      const processedResult = { ...result, summary: processedSummary };

      // 生成完整的响应内容
      const fullResponse = formatSummaryResponse(processedResult, {
        fromCache: false,
        escape: false
      });

      // 检查是否需要分段发送
      if (fullResponse.length > SUMMARY_LIMITS.RESPONSE_SEGMENT_MAX_LENGTH) {
        logger.info('总结内容较长，将分段发送', {
          totalLength: fullResponse.length,
          taskId,
          chatId
        });

        await sendSegmentedSummary(this.bot, chatId, messageInfo.messageId, fullResponse, taskId);
      } else {
        // 内容不长，正常发送单条消息
        await sendSingleSummary(this.bot, chatId, messageInfo.messageId, processedResult, taskId);
      }
    } catch (error) {
      // 特殊处理权限错误
      if (isSendMessageForbiddenError(error)) {
        const description = getTelegramErrorDescription(error);
        chatPermissionService.markChatSendRestricted(chatId, description);

        logger.warn('总结结果推送失败：缺少发送权限', {
          taskId,
          chatId,
          userId,
          error: description
        });
        return;
      } else if (isNetworkError(error)) {
        // 特殊处理网络连接错误
        logger.error('网络连接错误，总结结果推送失败', {
          taskId,
          chatId,
          userId,
          error: error.message,
          errorCode: error.code
        });

        // 尝试发送网络错误提示消息
        await this.sendNetworkErrorMessage(taskId, chatId, result);
      } else if (isContentFilterError(error)) {
        logger.warn('内容过滤错误，总结结果推送失败', {
          taskId,
          chatId,
          userId,
          error: error.message || error.toString()
        });

        // 尝试发送内容安全提示消息
        await this.sendContentFilterMessage(taskId, chatId);
      } else {
        logger.error('推送总结结果失败', {
          taskId,
          chatId,
          userId,
          error: error.message,
          hasResult: !!result,
          hasResultMetadata: !!(result?.metadata)
        });

        // 尝试发送错误消息
        await this.sendFallbackMessage(taskId, chatId, result);
      }
    }
  }

  /**
   * 处理任务失败事件
   */
  async handleTaskFailed(event) {
    const { taskId, chatId, userId, error } = event;

    if (chatPermissionService.isChatSendRestricted(chatId)) {
      logger.warn('群组发送权限受限，跳过任务失败通知', {
        taskId,
        chatId,
        userId
      });
      return;
    }

    try {
      // 调试日志：记录接收到的错误对象
      logger.debug('处理任务失败事件', {
        taskId,
        chatId,
        userId,
        errorType: typeof error,
        errorCode: error?.code,
        errorStatus: error?.status,
        isContentFilter: isContentFilterError(error)
      });

      const messageInfo = cacheService.getCustomCache(`task_message_${taskId}`);
      if (!messageInfo) {
        logger.warn('未找到失败任务关联的消息信息', { taskId, chatId, userId });
        return;
      }

      // 格式化错误消息
      const errorResponse = formatErrorMessage(error);

      await createTelegramEditSender(this.bot, chatId, messageInfo.messageId)(
        errorResponse,
        { disable_web_page_preview: true }
      );

      logger.info('任务失败消息已推送', { taskId, chatId, userId });
    } catch (sendError) {
      if (isSendMessageForbiddenError(sendError)) {
        const description = getTelegramErrorDescription(sendError);
        chatPermissionService.markChatSendRestricted(chatId, description);
        logger.warn('任务失败消息推送失败：缺少发送权限', {
          taskId,
          chatId,
          userId,
          error: description
        });
      } else if (isNetworkError(sendError)) {
        logger.error('网络连接错误，无法推送任务失败消息', {
          taskId,
          chatId,
          userId,
          originalError: error,
          networkError: sendError.message
        });
      } else if (isContentFilterError(sendError)) {
        logger.warn('内容过滤错误，无法推送任务失败消息', {
          taskId,
          chatId,
          userId,
          originalError: error,
          contentFilterError: sendError.message || sendError.toString()
        });
      } else {
        logger.error('推送任务失败消息失败', {
          taskId,
          chatId,
          userId,
          error: sendError.message
        });
      }
    }
  }

  /**
   * 发送网络错误消息
   */
  async sendNetworkErrorMessage(taskId, chatId, result) {
    try {
      const messageInfo = cacheService.getCustomCache(`task_message_${taskId}`);
      if (messageInfo) {
        // 使用基本的网络重试机制
        await retryNetworkOperation(async () => {
          return await this.bot.telegram.editMessageText(
            chatId,
            messageInfo.messageId,
            undefined,
            getNetworkErrorMessageForTask(result),
            {
              disable_web_page_preview: true
            }
          );
        }, { taskId, chatId, operation: 'sendNetworkErrorMessage' });
      }
    } catch (fallbackError) {
      if (isSendMessageForbiddenError(fallbackError)) {
        const description = getTelegramErrorDescription(fallbackError);
        chatPermissionService.markChatSendRestricted(chatId, description);
        logger.warn('发送网络错误消息失败：缺少发送权限', {
          taskId,
          chatId,
          error: description
        });
        return;
      }

      logger.error('发送网络错误消息也失败了', {
        taskId,
        chatId,
        error: fallbackError.message
      });
    }
  }

  /**
   * 发送内容过滤错误消息
   */
  async sendContentFilterMessage(taskId, chatId) {
    try {
      const messageInfo = cacheService.getCustomCache(`task_message_${taskId}`);
      if (messageInfo) {
        // 使用统一的错误消息格式
        const errorMessage = getContentFilterMessage();

        await createTelegramEditSender(this.bot, chatId, messageInfo.messageId)(
          errorMessage,
          { disable_web_page_preview: true }
        );
      }
    } catch (fallbackError) {
      if (isSendMessageForbiddenError(fallbackError)) {
        const description = getTelegramErrorDescription(fallbackError);
        chatPermissionService.markChatSendRestricted(chatId, description);
        logger.warn('发送内容过滤错误消息失败：缺少发送权限', {
          taskId,
          chatId,
          error: description
        });
        return;
      }

      logger.error('发送内容过滤错误消息也失败了', {
        taskId,
        chatId,
        error: fallbackError.message
      });
    }
  }

  /**
   * 发送回退错误消息
   */
  async sendFallbackMessage(taskId, chatId, result) {
    try {
      const messageInfo = cacheService.getCustomCache(`task_message_${taskId}`);
      if (messageInfo) {
        // 安全地获取消息数量，处理 result 为 undefined 的情况
        const messageCount = Number(result?.metadata?.messagesAnalyzed ?? 100);

        await this.bot.telegram.editMessageText(
          chatId,
          messageInfo.messageId,
          undefined,
          `📋 总结已完成

推送时遇到格式问题，请使用 /summary ${messageCount} 重新获取结果。`,
          {
            disable_web_page_preview: true
          }
        );

        logger.info('已发送回退错误消息', { taskId, chatId, messageCount });
      }
    } catch (fallbackError) {
      if (isSendMessageForbiddenError(fallbackError)) {
        const description = getTelegramErrorDescription(fallbackError);
        chatPermissionService.markChatSendRestricted(chatId, description);
        logger.warn('发送回退错误消息失败：缺少发送权限', {
          taskId,
          chatId,
          error: description
        });
        return;
      }

      logger.error('发送回退错误消息也失败了', {
        taskId,
        chatId,
        error: fallbackError.message
      });
    }
  }
}

module.exports = TaskQueueHandler;
