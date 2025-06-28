/**
 * AI 服务模块
 * 支持主要模型(Gemini)和备用模型(Azure OpenAI)的自动切换
 */

const logger = require('../utils/logger');
const { initPrimaryClient, initFallbackClient } = require('./ai/clientFactory');
const { buildSystemPrompt, buildUserPrompt, buildResponseFormat } = require('./ai/promptBuilder');
const { cleanJsonContent, repairTruncatedJson, extractSummaryFromFailedJson, formatStructuredSummary } = require('./ai/responseHandler');
const { detectLanguage } = require('./ai/languageDetector');
const { truncateToTokenLimit, makeSafeUserName } = require('./ai/utils');

class AIService {
  constructor() {
    this.primaryClient = null;
    this.fallbackClient = null;
    this.isInitialized = false;
  }

  /**
   * 初始化 AI 客户端
   */
  async init() {
    this.primaryClient = initPrimaryClient();
    this.fallbackClient = initFallbackClient();

    this.isInitialized = true;
    logger.success('AI 服务初始化成功');
  }

  /**
   * 确保服务已初始化
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('AI 服务未初始化，请先调用 init() 方法');
    }
  }

  /**
   * 使用主要模型生成内容，失败时自动切换到备用模型
   * @param {Object} options - 生成选项
   * @returns {Object} 生成结果
   */
  async generateContentWithFallback(options) {
    this.ensureInitialized();

    // 首先尝试主要模型 (Gemini)
    try {
      if (!this.primaryClient) {
        throw new Error('主要模型 (Gemini) 未配置');
      }
      logger.info('尝试使用主要模型 (Gemini) 生成内容');
      
      const primaryOptions = {
        model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
        messages: options.messages,
        max_tokens: options.max_tokens,
        temperature: options.temperature,
        top_p: options.top_p
      };

      if (options.response_format) {
        primaryOptions.response_format = options.response_format;
      }

      const response = await this.primaryClient.chat.completions.create(primaryOptions);
      
      logger.success('主要模型 (Gemini) 调用成功');
      return {
        ...response,
        modelUsed: 'primary',
        modelName: 'Gemini'
      };

    } catch (primaryError) {
      logger.warn('主要模型 (Gemini) 调用失败，尝试备用模型', {
        error: primaryError.message,
        stack: primaryError.stack
      });

      // 如果主要模型失败，尝试备用模型 (Azure OpenAI)
      if (!this.fallbackClient) {
        logger.error('备用模型未配置，无法进行故障转移');
        throw new Error('主要模型调用失败且备用模型未配置');
      }

      try {
        logger.info('尝试使用备用模型 (Azure OpenAI) 生成内容');
        
        const fallbackOptions = {
          model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
          messages: options.messages,
          max_tokens: options.max_tokens,
          temperature: options.temperature,
          top_p: options.top_p
        };

        if (options.response_format) {
          fallbackOptions.response_format = options.response_format;
        }

        const response = await this.fallbackClient.chat.completions.create(fallbackOptions);
        
        logger.success('备用模型 (Azure OpenAI) 调用成功');
        return {
          ...response,
          modelUsed: 'fallback',
          modelName: 'Azure OpenAI',
          primaryError: primaryError.message
        };

      } catch (fallbackError) {
        logger.error('备用模型 (Azure OpenAI) 也调用失败', {
          primaryError: primaryError.message,
          fallbackError: fallbackError.message
        });

        // 如果两个模型都失败，抛出包含详细信息的错误
        const error = new Error('所有AI模型都不可用');
        error.primaryError = primaryError;
        error.fallbackError = fallbackError;
        throw error;
      }
    }
  }

  /**
   * 总结群组消息
   * @param {Array} messages - 消息列表
   * @param {Object} stats - 群组统计信息
   * @param {Array} topUsers - 活跃用户列表
   * @returns {Object} 总结结果
   */
  async summarizeMessages(messages, stats, topUsers) {
    this.ensureInitialized();

    try {
      logger.info('开始生成消息总结', {
        messagesCount: messages.length,
        topUsersType: typeof topUsers,
        topUsersIsArray: Array.isArray(topUsers),
        topUsersLength: Array.isArray(topUsers) ? topUsers.length : 'N/A'
      });
      
      // 检测群组主要语言
      const detectedLanguage = detectLanguage(messages);

      // 准备消息文本
      const messageTexts = messages.map(msg => {
        const rawUserName = msg.first_name || msg.username || `用户${msg.user_id}`;
        const safeUserName = makeSafeUserName(rawUserName);
        return `${safeUserName}: ${msg.text}`;
      });

      const fullText = messageTexts.join('\n');
      
      // 检查消息记录是否过长
      if (fullText.length > 50000) {
        logger.warn('消息记录超过长度限制', {
          textLength: fullText.length,
          maxLength: 50000,
          messagesCount: messages.length
        });
        
        const error = new Error('消息记录过长，请减少消息数量');
        error.name = 'MessageTooLongError';
        error.textLength = fullText.length;
        error.maxLength = 50000;
        throw error;
      }
      
      const maxInputTokens = 6000;
      const truncatedText = truncateToTokenLimit(fullText, maxInputTokens);

      const validTopUsers = Array.isArray(topUsers) ? topUsers : [];
      const userInfo = validTopUsers.map(user => {
        const name = user.first_name || user.username || `用户${user.user_id}`;
        return `${name} (${user.message_count}条消息)`;
      }).join(', ');

      const systemPrompt = buildSystemPrompt(detectedLanguage);
      const userPrompt = buildUserPrompt(truncatedText, stats, userInfo, messages.length, detectedLanguage);

      const responseFormat = buildResponseFormat(detectedLanguage);

      const inputLength = systemPrompt.length + userPrompt.length;
      logger.info('AI调用参数', {
        inputLength,
        estimatedInputTokens: Math.ceil(inputLength / 2),
        messagesCount: messages.length
      });

      const response = await this.generateContentWithFallback({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 50000,
        temperature: 0.7,
        top_p: 0.9,
        response_format: responseFormat
      });

      let rawContent = response.choices[0]?.message?.content;
      let finishReason = response.choices[0]?.finish_reason;
      
      logger.info('AI响应详情', {
        contentLength: rawContent?.length || 0,
        finishReason: finishReason,
        usage: response.usage,
        modelUsed: response.modelUsed,
        contentPreview: rawContent?.substring(0, 200) || 'null'
      });
      
      if (!rawContent || rawContent.trim() === '') {
        logger.error('AI响应内容为空', { response, finishReason });
        throw new Error('未获得有效的总结结果 - AI返回空内容');
      }

      // 记录是否被截断（但不进行重试）
      if (finishReason === 'length') {
        logger.warn('AI输出因长度限制被截断，但保持使用完整聊天记录', {
          contentLength: rawContent.length,
          inputLength: inputLength,
          messagesCount: messages.length
        });
      }

      let structuredResult;
      try {
        structuredResult = JSON.parse(rawContent);
      } catch (parseError) {
        logger.warn('结构化响应解析失败，尝试清理JSON格式', { error: parseError.message });
        
        try {
          const cleanedContent = cleanJsonContent(rawContent);
          structuredResult = JSON.parse(cleanedContent);
          logger.info('JSON清理成功，解析通过');
        } catch (cleanError) {
          logger.warn('JSON清理仍然失败，使用纯文本回退', cleanError);
          const extractedSummary = extractSummaryFromFailedJson(rawContent);
          
          structuredResult = {
            formatted_summary: extractedSummary,
            main_topics: [],
            discussion_points: [],
            activity_analysis: '',
            special_events: '',
            other_notes: ''
          };
        }
      }

      const summary = formatStructuredSummary(structuredResult, detectedLanguage);

      logger.info('消息总结生成成功');

      return {
        summary,
        metadata: {
          messagesAnalyzed: messages.length,
          uniqueUsers: stats.unique_users,
          timeRange: {
            earliest: stats.earliest_message,
            latest: stats.latest_message
          },
          topUsers: validTopUsers.slice(0, 5),
          tokensUsed: response.usage?.total_tokens || 0,
          structuredData: structuredResult
        }
      };

    } catch (error) {
      logger.error('消息总结生成失败', error);
      throw error;
    }
  }

  /**
   * 诊断AI服务配置和状态
   */
  async diagnoseProblem() {
    logger.info('开始诊断AI服务问题');
    
    const diagnosis = {
      initialization: this.isInitialized,
      primaryClient: !!this.primaryClient,
      fallbackClient: !!this.fallbackClient,
      environment: {
        geminiApiKey: process.env.GEMINI_API_KEY ? '已配置' : '未配置',
        geminiModel: process.env.GEMINI_MODEL || 'gemini-2.5-flash',
        azureApiKey: process.env.AZURE_OPENAI_API_KEY ? '已配置' : '未配置',
        azureEndpoint: process.env.AZURE_OPENAI_ENDPOINT || '未配置',
        azureDeployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '未配置'
      }
    };
    
    logger.info('AI服务诊断结果', diagnosis);
    
    try {
      const testResult = await this.testConnection();
      diagnosis.connectionTest = testResult;
    } catch (error) {
      diagnosis.connectionTest = { error: error.message };
    }
    
    return diagnosis;
  }

  /**
   * 测试连接
   */
  async testConnection() {
    this.ensureInitialized();
    
    const results = {
      primary: { success: false, error: null, model: 'Gemini' },
      fallback: { success: false, error: null, model: 'Azure OpenAI' }
    };

    if (this.primaryClient) {
      try {
        const response = await this.primaryClient.chat.completions.create({
          model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
          messages: [
            { role: 'user', content: '请回复"连接测试成功"' }
          ],
          max_tokens: 50
        });

        const content = response.choices[0]?.message?.content;
        logger.success('Gemini API 连接测试成功', { response: content });
        results.primary.success = true;
        
      } catch (error) {
        logger.warn('Gemini API 连接测试失败', error);
        results.primary.error = error.message;
      }
    } else {
      results.primary.error = '主要模型未配置';
    }

    if (this.fallbackClient) {
      try {
        const response = await this.fallbackClient.chat.completions.create({
          model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
          messages: [
            { role: 'user', content: '请回复"连接测试成功"' }
          ],
          max_tokens: 50
        });

        const content = response.choices[0]?.message?.content;
        logger.success('Azure OpenAI 连接测试成功', { response: content });
        results.fallback.success = true;
        
      } catch (error) {
        logger.warn('Azure OpenAI 连接测试失败', error);
        results.fallback.error = error.message;
      }
    } else {
      results.fallback.error = '备用模型未配置';
    }

    const anyAvailable = results.primary.success || results.fallback.success;
    
    if (anyAvailable) {
      logger.success('AI 服务连接测试完成', { results });
    } else {
      logger.error('所有AI模型连接测试都失败了', { results });
    }

    return { success: anyAvailable, results };
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    const primaryConfigured = !!process.env.GEMINI_API_KEY;
    const fallbackConfigured = !!(
      process.env.AZURE_OPENAI_API_KEY && 
      process.env.AZURE_OPENAI_ENDPOINT && 
      process.env.AZURE_OPENAI_DEPLOYMENT_NAME
    );
    
    return {
      initialized: this.isInitialized,
      primary: {
        model: 'Gemini',
        configured: primaryConfigured,
        apiKey: process.env.GEMINI_API_KEY ? '已配置' : '未配置',
        modelName: process.env.GEMINI_MODEL || 'gemini-2.5-flash'
      },
      fallback: {
        model: 'Azure OpenAI',
        configured: fallbackConfigured,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT || '未配置',
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME || '未配置',
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview'
      }
    };
  }
}

module.exports = new AIService(); 