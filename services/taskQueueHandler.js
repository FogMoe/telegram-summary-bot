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
        await this.bot.telegram.editMessageText(
          chatId,
          messageInfo.messageId,
          undefined,
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
            await this.bot.telegram.editMessageText(
              chatId,
              messageInfo.messageId,
              undefined,
              escapedResponse,
              {
                parse_mode: 'Markdown',
                disable_web_page_preview: true
              }
            );
            
            logger.success('使用转义Markdown格式推送总结结果', { taskId, chatId });
            
          } catch (escapedError) {
            // 如果转义后仍然失败，使用纯文本
            const plainTextResponse = this.formatPlainTextResponse(result, false);
            
            await this.bot.telegram.editMessageText(
              chatId,
              messageInfo.messageId,
              undefined,
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

  /**
   * 处理任务失败事件
   */
  async handleTaskFailed(event) {
    const { taskId, chatId, userId, error } = event;
    
    try {
      const messageInfo = cacheService.getCustomCache(`task_message_${taskId}`);
      if (!messageInfo) {
        logger.warn('未找到失败任务关联的消息信息', { taskId, chatId, userId });
        return;
      }

      // 检查是否是消息过长错误
      const errorResponse = this.formatErrorMessage(error);

      await this.bot.telegram.editMessageText(
        chatId,
        messageInfo.messageId,
        undefined,
        errorResponse,
        {
          disable_web_page_preview: true
        }
      );
      
      logger.info('任务失败消息已推送', { taskId, chatId, userId });
      
    } catch (error) {
      logger.error('推送任务失败消息失败', {
        taskId,
        chatId,
        userId,
        error: error.message
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
        await this.bot.telegram.editMessageText(
          chatId,
          messageInfo.messageId,
          undefined,
          `📋 总结已完成

推送时遇到格式问题，请使用 /summary ${result.metadata?.messagesAnalyzed || 100} 重新获取结果。`,
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
   * 格式化总结响应消息（Markdown格式）
   */
  formatSummaryResponse(summaryResult, fromCache, escape = false) {
    const { summary, metadata } = summaryResult;
    
    let response = `📋 *群组聊天总结*\n\n`;
    
    // 根据escape参数决定是否转义特殊字符
    const formattedSummary = escape ? escapeMarkdown(summary) : summary;
    response += `${formattedSummary}\n\n`;
    
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
        return escape ? escapeMarkdown(name) : name;
      }).join(', ');
      response += `• 活跃用户：${userNames}\n`;
    }
    
    if (metadata.tokensUsed) {
      response += `• API 用量：${metadata.tokensUsed} tokens\n`;
    }
    
    // 缓存标识
    if (fromCache) {
      response += `\n💾 *此结果来自缓存*`;
    }
    
    response += `\n\n⏰ 下次总结请等待5分钟冷却期`;
    
    return response;
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
      response += `• API 用量：${metadata.tokensUsed} tokens\n`;
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
    if (error.includes('MessageTooLongError') || error.includes('消息记录过长')) {
      return `⚠️ 消息记录过长

💡 建议解决方案：
• 减少消息数量（尝试 100-500 条）
• 选择更短的时间范围进行总结

🔄 请重新执行命令：
/summary 300`;
    } else {
      return `❌ 总结生成失败

很抱歉，在生成总结时遇到了问题：
${error}

请稍后再试，或联系管理员检查 AI 服务配置。`;
    }
  }


}

module.exports = TaskQueueHandler; 