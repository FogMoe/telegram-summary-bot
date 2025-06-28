/**
 * 任务队列事件处理器
 * 处理任务完成、失败等事件的业务逻辑
 */

const cacheService = require('./cacheService');
const logger = require('../utils/logger');
const { escapeMarkdown, stripMarkdown } = require('../utils/markdown');

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
   * 处理任务完成事件
   */
  async handleTaskCompleted(event) {
    const { taskId, chatId, userId, result } = event;
    
    try {
      // 获取原始消息信息
      const messageInfo = cacheService.getCustomCache(`task_message_${taskId}`);
      if (!messageInfo) {
        logger.warn('未找到任务关联的消息信息', { taskId, chatId, userId });
        return;
      }

      // 尝试发送原生Markdown格式
      const response = this.formatSummaryResponse(result, false, false); // 第三个参数false表示不转义
      
      try {
        await this.safeSendTelegramMessage(
          chatId,
          messageInfo.messageId,
          response,
          {
            parse_mode: 'Markdown',
            disable_web_page_preview: true
          }
        );
        
        logger.success('总结结果已推送 (原生Markdown)', {
          taskId,
          chatId,
          userId,
          messageId: messageInfo.messageId
        });
        
      } catch (markdownError) {
        // 如果是网络错误，直接抛出
        if (this.isNetworkError(markdownError)) {
          throw markdownError;
        }
        
        // 如果Markdown格式错误，尝试转义后重试
        if (markdownError.response && 
            markdownError.response.error_code === 400 && 
            markdownError.response.description && 
            markdownError.response.description.includes("can't parse entities")) {
          
          logger.info('Markdown格式错误，尝试转义后重试', {
            taskId,
            chatId,
            error: markdownError.response.description
          });
          
          // 使用转义版本重试
          const escapedResponse = this.formatSummaryResponse(result, false, true); // 第三个参数true表示转义
          
          try {
            await this.safeSendTelegramMessage(
              chatId,
              messageInfo.messageId,
              escapedResponse,
              {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
              }
            );
            
            logger.success('使用转义Markdown格式推送总结结果', { taskId, chatId });
            
          } catch (escapedError) {
            // 如果是网络错误，直接抛出
            if (this.isNetworkError(escapedError)) {
              throw escapedError;
            }
            
            // 如果转义后仍然失败，使用纯文本
            const plainTextResponse = this.formatPlainTextResponse(result, false);
            
            await this.safeSendTelegramMessage(
              chatId,
              messageInfo.messageId,
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
      
    } catch (error) {
      // 特殊处理网络连接错误
      if (this.isNetworkError(error)) {
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
          error: error.message
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
      if (this.isNetworkError(sendError)) {
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
        // 数字不需要转义，但为了安全起见确保是数字
        const messageCount = Number(result.metadata?.messagesAnalyzed || 100);
        
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
      }
    } catch (fallbackError) {
      logger.error('发送错误消息也失败了', fallbackError);
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
    // 确保消息数量是数字
    const messageCount = Number(result.metadata?.messagesAnalyzed || 100);
    
    return `📋 总结已完成

⚠️ 网络连接不稳定，推送失败
    
🔄 可能的解决方案：
• 请稍后使用 /summary ${messageCount} 重新获取
• 检查网络连接状态
• 如果问题持续，请联系管理员

💾 总结结果已保存，可随时重新获取`;
  }

  /**
   * 格式化总结响应消息（Markdown格式）
   */
  formatSummaryResponse(summaryResult, fromCache, escape = false) {
    const { summary, metadata } = summaryResult;
    
    let response = `📋 *群组聊天总结*\n\n`;
    
    // 智能转义：只转义非格式化内容，保留AI生成的标题格式
    if (escape) {
      const formattedSummary = this.smartEscapeMarkdown(summary);
      response += `${formattedSummary}\n\n`;
    } else {
      response += `${summary}\n\n`;
    }
    
    // 元数据信息
    response += `📊 *分析统计*\n`;
    response += `• 分析消息：${metadata.messagesAnalyzed} 条\n`;
    response += `• 参与用户：${metadata.uniqueUsers} 人\n`;
    
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
    
    if (metadata.tokensUsed) {
      response += `• 字符数量：${metadata.charactersUsed || metadata.tokensUsed || 0}\n`;
    }
    
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
  smartEscapeMarkdown(text) {
    if (!text || typeof text !== 'string') {
      return text;
    }

    // 保护标题格式：*📌 标题* 或 *标题*
    const titlePattern = /\*([^*\n]+)\*/g;
    const titles = [];
    let titleIndex = 0;

    // 先提取所有标题，用占位符替换
    const textWithPlaceholders = text.replace(titlePattern, (match, title) => {
      titles.push(match);
      return `__TITLE_PLACEHOLDER_${titleIndex++}__`;
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
      finalText = finalText.replace(`__TITLE_PLACEHOLDER_${index}__`, title);
    });

    return finalText;
  }

  /**
   * 格式化纯文本响应消息（无Markdown格式）
   */
  formatPlainTextResponse(summaryResult, fromCache) {
    const { summary, metadata } = summaryResult;
    
    let response = `📋 群组聊天总结\n\n`;
    
    // 移除summary中的所有Markdown标记
    const plainSummary = stripMarkdown(summary);
    
    response += `${plainSummary}\n\n`;
    
    // 元数据信息
    response += `📊 分析统计\n`;
    response += `• 分析消息：${metadata.messagesAnalyzed} 条\n`;
    response += `• 参与用户：${metadata.uniqueUsers} 人\n`;
    
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
    
    if (metadata.tokensUsed) {
      response += `• 字符数量：${metadata.charactersUsed || metadata.tokensUsed || 0}\n`;
    }
    
    // 缓存标识
    if (fromCache) {
      response += `\n💾 此结果来自缓存`;
    }
    
    response += `\n\n⏰ 下次总结请等待5分钟冷却期`;
    
    return response;
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
    
    // 检查是否是消息过长错误
    if (error.includes('MessageTooLongError') || error.includes('消息记录过长')) {
      return this.getMessageTooLongErrorMessage();
    }
    
    // 通用错误消息 - 转义错误内容
    const errorMessage = escapeMarkdown(error.toString());
    return `❌ 总结生成失败

很抱歉，在生成总结时遇到了问题：
${errorMessage}

请稍后再试，或联系管理员检查 AI 服务配置。`;
  }


}

module.exports = TaskQueueHandler; 