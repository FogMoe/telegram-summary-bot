/**
 * 任务队列事件处理器
 * 处理任务完成、失败等事件的业务逻辑
 */

const cacheService = require('./cacheService');
const chatPermissionService = require('./chatPermissionService');
const logger = require('../utils/logger');
const { SUMMARY_LIMITS } = require('../config/constants');
const { escapeMarkdown, preProcessMarkdown, safeMarkdownProcess } = require('../utils/markdown');
const { formatSummaryResponse, formatPlainTextResponse } = require('../utils/summaryFormatter');
const { isSendMessageForbiddenError, getTelegramErrorDescription } = require('../utils/telegramErrors');

class TaskQueueHandler {
  constructor(bot) {
    this.bot = bot;
    // 网络重试配置
    this.retryConfig = {
      maxRetries: 3,
      retryDelay: 1000, // 1秒
      backoffMultiplier: 2
    };
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
   * 检查是否为网络连接错误
   */
  isNetworkError(error) {
    if (!error) return false;
    
    const networkErrorCodes = ['ETIMEDOUT', 'ECONNREFUSED', 'ENOTFOUND', 'ECONNRESET'];
    const networkErrorTypes = ['system', 'network'];
    
    return (
      networkErrorCodes.includes(error.code) ||
      networkErrorTypes.includes(error.type) ||
      (error.message && error.message.includes('connect ETIMEDOUT')) ||
      (error.message && error.message.includes('network')) ||
      (error.response && error.response.error_code === 429) // Rate limit
    );
  }

  /**
   * 检查是否为内容过滤错误
   */
  isContentFilterError(error) {
    if (!error) return false;
    
    // 检查Azure OpenAI特定的content_filter错误码
    if (error.code === 'content_filter') {
      logger.debug('检测到content_filter错误码', { 
        code: error.code, 
        status: error.status 
      });
      return true;
    }
    
    // 检查错误消息内容
    const errorMessage = error.message || error.toString();
    const errorString = String(errorMessage);
    
    // 检查状态码和错误内容
    const hasContentFilterStatus = error.status === 400;
    const hasContentFilterMessage = (
      errorString.includes('content management policy') ||
      errorString.includes('content filtering') ||
      errorString.includes('filtered due to the prompt') ||
      errorString.includes('Azure OpenAI\'s content management policy') ||
      errorString.includes('ResponsibleAIPolicyViolation') ||
      errorString.includes('content_filter_result') ||
      errorString.includes('违反内容政策') ||
      errorString.includes('内容过滤')
    );
    
    const isContentFilterError = hasContentFilterStatus && hasContentFilterMessage;
    
    if (hasContentFilterStatus) {
      logger.debug('内容过滤错误检测', {
        status: error.status,
        code: error.code,
        hasContentFilterMessage,
        isContentFilterError,
        errorPreview: errorString.substring(0, 100)
      });
    }
    
    return isContentFilterError;
  }

  /**
   * 网络错误重试机制
   */
  async retryNetworkOperation(operation, context = {}) {
    let lastError;
    
    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (!this.isNetworkError(error) || attempt === this.retryConfig.maxRetries) {
          throw error;
        }
        
        const delay = this.retryConfig.retryDelay * Math.pow(this.retryConfig.backoffMultiplier, attempt);
        
        logger.warn(`网络操作失败，${delay}ms后重试 (${attempt + 1}/${this.retryConfig.maxRetries})`, {
          error: error.message,
          context,
          attempt: attempt + 1
        });
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError;
  }

  /**
   * 安全发送Telegram消息（带网络错误处理）
   */
  async safeSendTelegramMessage(chatId, messageId, text, options = {}) {
    return await this.retryNetworkOperation(async () => {
      return await this.bot.telegram.editMessageText(
        chatId,
        messageId,
        undefined,
        text,
        options
      );
    }, { chatId, messageId, operation: 'editMessageText' });
  }

  /**
   * 智能分割长文本为多个段落
   * @param {string} text - 要分割的文本
   * @param {number} maxLength - 每段最大长度
   * @returns {Array} 分割后的文本段数组
   */
  splitTextIntoSegments(text, maxLength = SUMMARY_LIMITS.RESPONSE_SEGMENT_MAX_LENGTH) {
    if (text.length <= maxLength) {
      return [text];
    }

    const segments = [];
    let currentPos = 0;

    while (currentPos < text.length) {
      let segmentEnd = currentPos + maxLength;
      
      // 如果这是最后一段，直接取到结尾
      if (segmentEnd >= text.length) {
        segments.push(text.substring(currentPos));
        break;
      }

      // 尝试在合适的位置分段（优先级：\n\n > \n > 。> 句号 > 空格）
      const searchText = text.substring(currentPos, segmentEnd);
      const breakPoints = [
        { char: '\n\n', priority: 5 },
        { char: '\n', priority: 4 },
        { char: '。\n', priority: 3 },
        { char: '。', priority: 2 },
        { char: ' ', priority: 1 }
      ];

      let bestBreakPoint = segmentEnd;
      for (const breakPoint of breakPoints) {
        const lastIndex = searchText.lastIndexOf(breakPoint.char);
        if (lastIndex > maxLength * 0.7) { // 确保不会分段太短
          bestBreakPoint = currentPos + lastIndex + breakPoint.char.length;
          break;
        }
      }

      segments.push(text.substring(currentPos, bestBreakPoint));
      currentPos = bestBreakPoint;
    }

    return segments;
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
        
        await this.sendSegmentedSummary(chatId, messageInfo.messageId, fullResponse, taskId);
        
      } else {
        // 内容不长，正常发送单条消息
        await this.sendSingleSummary(chatId, messageInfo.messageId, processedResult, taskId);
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
      } else if (this.isNetworkError(error)) {
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
      } else if (this.isContentFilterError(error)) {
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
   * 发送单条总结消息
   */
  async sendSingleSummary(chatId, messageId, summaryResult, taskId) {
    const response = formatSummaryResponse(summaryResult, {
      fromCache: false,
      escape: false
    });

    try {
      await this.safeSendTelegramMessage(
        chatId,
        messageId,
        response,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }
      );

      logger.success('总结结果已推送 (单条消息)', {
        taskId,
        chatId,
        messageId
      });

    } catch (markdownError) {
      if (this.isNetworkError(markdownError)) {
        throw markdownError;
      }

      if (markdownError.response &&
          markdownError.response.error_code === 400 &&
          markdownError.response.description &&
          markdownError.response.description.includes("can't parse entities")) {

        logger.warn('Markdown格式错误，尝试转义后重试', {
          taskId,
          chatId,
          error: markdownError.response.description,
          errorOffset: markdownError.response.description.match(/byte offset (\d+)/)
        });

        const escapedResponse = formatSummaryResponse(summaryResult, {
          fromCache: false,
          escape: true
        });

        try {
          await this.safeSendTelegramMessage(
            chatId,
            messageId,
            escapedResponse,
            {
              parse_mode: 'Markdown',
              disable_web_page_preview: true
            }
          );

          logger.success('使用转义Markdown格式推送总结结果', { taskId, chatId });

        } catch (escapedError) {
          if (this.isNetworkError(escapedError)) {
            throw escapedError;
          }

          if (escapedError.response &&
              escapedError.response.error_code === 400 &&
              escapedError.response.description &&
              escapedError.response.description.includes("can't parse entities")) {

            logger.warn('转义后仍有Markdown格式错误，使用安全处理器', {
              taskId,
              chatId,
              error: escapedError.response.description
            });

            try {
              const safeResult = {
                summary: safeMarkdownProcess(summaryResult.summary || ''),
                metadata: summaryResult.metadata || {}
              };
              const safeMarkdownResponse = formatSummaryResponse(safeResult, {
                fromCache: false,
                escape: false
              });

              await this.safeSendTelegramMessage(
                chatId,
                messageId,
                safeMarkdownResponse,
                {
                  parse_mode: 'Markdown',
                  disable_web_page_preview: true
                }
              );

              logger.success('使用安全Markdown处理器推送总结结果', { taskId, chatId });
              return;

            } catch (safeError) {
              logger.warn('安全Markdown处理器也失败，使用纯文本', {
                taskId,
                chatId,
                error: safeError.response?.description
              });
            }
          }

          const plainTextResponse = formatPlainTextResponse(summaryResult, {
            fromCache: false
          });

          await this.safeSendTelegramMessage(
            chatId,
            messageId,
            plainTextResponse,
            {
              disable_web_page_preview: true
            }
          );

          logger.info('使用纯文本格式推送总结结果', { taskId, chatId });
        }
      } else {
        throw markdownError;
      }
    }
  }

  /**
   * 分段发送总结消息
   */
  async sendSegmentedSummary(chatId, messageId, fullResponse, taskId) {
    // 分离主要内容和统计信息
    const parts = fullResponse.split('\n\n📊');
    const mainContent = parts[0];
    const statsContent = parts[1] ? '\n\n📊' + parts[1] : '';

    // 分割主要内容
    const segments = this.splitTextIntoSegments(
      mainContent,
      SUMMARY_LIMITS.RESPONSE_SEGMENT_MAIN_MAX_LENGTH
    );
    
    logger.info('开始分段发送总结', {
      taskId,
      chatId,
      totalSegments: segments.length,
      totalLength: fullResponse.length
    });

    try {
      // 发送第一段（替换原消息）
      const firstSegment = segments.length > 1 
        ? `${segments[0]}\n\n📝 *总结分段发送中... (1/${segments.length})*`
        : segments[0];

      await this.safeSendTelegramMessage(
        chatId,
        messageId,
        firstSegment,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }
      );

      // 发送其余段落（新消息）
      for (let i = 1; i < segments.length; i++) {
        const segment = `${segments[i]}\n\n📝 *总结续篇 (${i + 1}/${segments.length})*`;
        
        await this.bot.telegram.sendMessage(
          chatId,
          segment,
          {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          }
        );

        // 短暂延迟避免过快发送
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      // 发送统计信息（如果有）
      if (statsContent.trim()) {
        await this.bot.telegram.sendMessage(
          chatId,
          statsContent,
          {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          }
        );
      }

      logger.success('分段总结发送完成', {
        taskId,
        chatId,
        segmentsSent: segments.length,
        hasStats: !!statsContent.trim()
      });

    } catch (segmentError) {
      logger.error('分段发送失败，回退到截断单条消息', {
        taskId,
        chatId,
        error: segmentError.message
      });

      // 回退策略：发送截断的单条消息
      const truncatedResponse = fullResponse.substring(0, 3400) + '\n\n...(内容过长，发送时遇到问题)';
      
      await this.safeSendTelegramMessage(
        chatId,
        messageId,
        truncatedResponse,
        {
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        }
      );
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
        isContentFilter: this.isContentFilterError(error)
      });

      const messageInfo = cacheService.getCustomCache(`task_message_${taskId}`);
      if (!messageInfo) {
        logger.warn('未找到失败任务关联的消息信息', { taskId, chatId, userId });
        return;
      }

      // 格式化错误消息
      const errorResponse = this.formatErrorMessage(error);

      await this.safeSendTelegramMessage(
        chatId,
        messageInfo.messageId,
        errorResponse,
        {
          disable_web_page_preview: true
        }
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
      } else if (this.isNetworkError(sendError)) {
        logger.error('网络连接错误，无法推送任务失败消息', {
          taskId,
          chatId,
          userId,
          originalError: error,
          networkError: sendError.message
        });
      } else if (this.isContentFilterError(sendError)) {
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
        await this.retryNetworkOperation(async () => {
          return await this.bot.telegram.editMessageText(
            chatId,
            messageInfo.messageId,
            undefined,
            this.getNetworkErrorMessageForTask(result),
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
        const errorMessage = this.getContentFilterMessage();
        
        await this.safeSendTelegramMessage(
          chatId,
          messageInfo.messageId,
          errorMessage,
          {
            disable_web_page_preview: true
          }
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

  /**
   * 获取统一的内容过滤错误消息
   */
  getContentFilterMessage() {
    return `🤖 内容安全提醒

💬 检测到讨论内容可能包含不当信息，为了维护良好的交流环境，AI无法处理此次总结请求。

🌟 建议优化方向：
• 鼓励积极正面的讨论话题
• 避免争议性或冒犯性内容
• 提倡理性友善的交流方式
• 分享有价值的信息和观点

🔄 解决方案：
• 等待群组产生更多正面内容后重新总结
• 尝试使用 /summary 50 总结更少的消息
• 管理员可引导群组讨论向积极方向发展

💡 我们致力于创建一个友善、包容的交流空间！`;
  }

  /**
   * 获取统一的网络错误消息
   */
  getNetworkErrorMessage(error) {
    // 转义错误消息中的特殊字符
    const errorMessage = escapeMarkdown(error.message || error);
    
    return `⚠️ 网络连接错误

🔗 连接到AI服务时遇到网络问题：
${errorMessage}

💡 建议解决方案：
• 检查网络连接状态
• 稍后重试命令
• 如果问题持续，请联系管理员

🔄 请重新执行命令：
/summary`;
  }

  /**
   * 获取统一的消息过长错误消息
   */
  getMessageTooLongErrorMessage() {
    return `⚠️ 消息记录过长

💡 建议解决方案：
• 减少消息数量（尝试 100-500 条）
• 选择更短的时间范围进行总结

🔄 请重新执行命令：
/summary 300`;
  }

  /**
   * 获取任务完成后的网络错误消息
   */
  getNetworkErrorMessageForTask(result) {
    // 安全地获取消息数量，处理 result 为 undefined 的情况
    const messageCount = Number(
      result?.metadata?.messagesAnalyzed ?? SUMMARY_LIMITS.DEFAULT_MESSAGE_COUNT
    );
    
    return `📋 总结已完成

⚠️ 网络连接不稳定，推送失败
    
🔄 可能的解决方案：
• 请稍后使用 /summary ${messageCount} 重新获取
• 检查网络连接状态
• 如果问题持续，请联系管理员

💾 总结结果已保存，可随时重新获取`;
  }

  /**
   * 格式化错误消息
   */
  formatErrorMessage(error) {
    // 检查是否是内容过滤错误
    if (this.isContentFilterError(error)) {
      return this.getContentFilterMessage();
    }
    
    // 检查是否是网络连接错误
    if (this.isNetworkError(error)) {
      return this.getNetworkErrorMessage(error);
    }
    
    // 将错误转换为字符串以便安全检查
    const errorString = error?.message || error?.toString() || String(error);
    
    // 检查是否是消息过长错误
    if (errorString.includes('MessageTooLongError') || errorString.includes('消息记录过长')) {
      return this.getMessageTooLongErrorMessage();
    }
    
    // 通用错误消息 - 转义错误内容
    const errorMessage = escapeMarkdown(errorString);
    return `❌ 总结生成失败

很抱歉，在生成总结时遇到了问题：
${errorMessage}

请稍后再试，或联系管理员检查 AI 服务配置。`;
  }


}

module.exports = TaskQueueHandler; 
