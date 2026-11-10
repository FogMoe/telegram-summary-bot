/**
 * AI 服务模块
 * 支持 OpenAI 兼容 API 的主备自动切换
 */

const logger = require('../utils/logger');
const { AI_LIMITS } = require('../config/constants');
const { initPrimaryClient, initFallbackClient } = require('./ai/clientFactory');
const { buildSystemPrompt, buildUserPrompt, buildResponseFormat } = require('./ai/promptBuilder');
const { parseSummaryResponse } = require('./ai/responseHandler');
const { detectLanguage } = require('./ai/languageDetector');
const { truncateToTokenLimit, makeSafeUserName } = require('./ai/utils');

class AIService {
  constructor() {
    this.primaryClient = null;
    this.fallbackClient = null;
    this.isInitialized = false;
  }

  async requestCompletion(client, request, label, maxRetries) {
    const timeoutMs = AI_LIMITS.REQUEST_TIMEOUT_MS;
    const controller = new AbortController();
    const body = {
      ...request,
      max_tokens: AI_LIMITS.MAX_OUTPUT_TOKENS,
      reasoning_effort: AI_LIMITS.REASONING_EFFORT
    };
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => {
        const error = new Error(`${label} request timeout after ${timeoutMs}ms`);
        error.code = 'AI_REQUEST_TIMEOUT';
        reject(error);
        controller.abort();
      }, timeoutMs);
    });

    try {
      return await Promise.race([
        client.chat.completions.create(body, {
          signal: controller.signal,
          timeout: timeoutMs,
          maxRetries
        }),
        timeoutPromise
      ]);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  getResponseContent(response, label) {
    const content = response?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
      const error = new Error(`${label} returned empty content`);
      error.code = 'AI_EMPTY_RESPONSE';
      throw error;
    }
    return content;
  }

  getPrimaryModel() {
    return process.env.PRIMARY_MODEL || 'gpt-4o-mini';
  }

  getFallbackModel() {
    return process.env.FALLBACK_MODEL || process.env.PRIMARY_MODEL || 'gpt-4o-mini';
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
   * 使用主备 API 生成内容，摘要请求须通过解析才算成功
   * @param {Object} options - 生成选项
   * @param {string} [detectedLanguage] - 摘要语言，普通内容生成无需提供
   * @returns {Object} 生成结果
   */
  async generateContentWithFallback(options, detectedLanguage) {
    this.ensureInitialized();

    const isSummary = detectedLanguage !== undefined;
    const routes = [
      {
        name: 'primary',
        label: '主要 API',
        client: this.primaryClient,
        model: this.getPrimaryModel()
      },
      {
        name: 'fallback',
        label: '备用 API',
        client: this.fallbackClient,
        model: this.getFallbackModel()
      }
    ];
    const errors = {};

    for (const { name, label, client, model } of routes) {
      if (!client) {
        continue;
      }

      const request = {
        model,
        messages: options.messages,
        temperature: options.temperature,
        top_p: options.top_p
      };
      if (options.response_format) {
        request.response_format = options.response_format;
      }

      const startedAt = performance.now();
      logger.info(`尝试使用${label} 生成内容`, { model, timeoutMs: AI_LIMITS.REQUEST_TIMEOUT_MS });
      let response;
      try {
        response = await this.requestCompletion(client, request, label, isSummary ? 0 : undefined);

        const content = this.getResponseContent(response, label);
        const parsedSummary = isSummary ? parseSummaryResponse(content, detectedLanguage) : undefined;
        if (isSummary && !parsedSummary) {
          const error = new Error(`${label} returned no usable summary`);
          error.code = 'AI_INVALID_SUMMARY';
          throw error;
        }

        logger.success(`${label} 调用成功`, {
          elapsedMs: Math.round(performance.now() - startedAt),
          model: response.model || model,
          finishReason: response.choices[0].finish_reason,
          usage: response.usage
        });
        return {
          ...response,
          ...parsedSummary,
          modelUsed: name,
          modelName: model,
          ...(name === 'fallback' && { primaryError: errors.primary?.message ?? '主要 API 未配置' })
        };
      } catch (error) {
        errors[name] = error;
        logger.warn(`${label} 调用失败`, {
          elapsedMs: Math.round(performance.now() - startedAt),
          finishReason: response?.choices?.[0]?.finish_reason,
          error: error.message,
          code: error.code,
          status: error.status
        });
      }
    }

    const failures = Object.values(errors);
    let message = this.fallbackClient ? '所有 AI API 都不可用' : '主要 API 调用失败且备用 API 未配置';
    let code;
    if (isSummary && failures.length > 0 && failures.every(error => error.code === 'AI_REQUEST_TIMEOUT')) {
      message = '总结生成超时';
      code = 'AI_REQUEST_TIMEOUT';
    } else if (isSummary && failures.some(error => ['AI_INVALID_SUMMARY', 'AI_EMPTY_RESPONSE'].includes(error.code))) {
      message = 'AI 未返回可用的总结';
      code = 'AI_INVALID_SUMMARY';
    }

    const error = new Error(message);
    error.code = code;
    error.primaryError = errors.primary ?? new Error('主要 API 未配置');
    error.fallbackError = errors.fallback;
    throw error;
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
      if (fullText.length > AI_LIMITS.MAX_INPUT_CHARS) {
        logger.warn('消息记录超过长度限制', {
          textLength: fullText.length,
          maxLength: AI_LIMITS.MAX_INPUT_CHARS,
          messagesCount: messages.length
        });
        
        const error = new Error('消息记录过长，请减少消息数量');
        error.name = 'MessageTooLongError';
        error.textLength = fullText.length;
        error.maxLength = AI_LIMITS.MAX_INPUT_CHARS;
        throw error;
      }
      
      const maxInputTokens = AI_LIMITS.MAX_INPUT_TOKENS;
      const truncatedText = truncateToTokenLimit(fullText, maxInputTokens);

      const validTopUsers = Array.isArray(topUsers) ? topUsers : [];
      const userInfo = validTopUsers.map(user => {
        const name = user.first_name || user.username || `用户${user.user_id}`;
        return `${name} (${user.message_count}条消息)`;
      }).join(', ');

      const systemPrompt = buildSystemPrompt(detectedLanguage);
      const userPrompt = buildUserPrompt(truncatedText, stats, userInfo, messages.length, detectedLanguage);

      const inputLength = systemPrompt.length + userPrompt.length;
      logger.info('AI调用参数', {
        inputLength,
        estimatedInputTokens: Math.ceil(inputLength / 2),
        messagesCount: messages.length
      });

      const { summary, structuredData, usage } = await this.generateContentWithFallback({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.7,
        response_format: buildResponseFormat(detectedLanguage)
      }, detectedLanguage);

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
          tokensUsed: usage?.total_tokens || 0,
          structuredData
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
        primaryApiKey: process.env.PRIMARY_API_KEY ? '已配置' : '未配置',
        primaryBaseUrl: process.env.PRIMARY_API_BASE_URL || '默认(OpenAI)',
        primaryModel: this.getPrimaryModel(),
        fallbackApiKey: process.env.FALLBACK_API_KEY ? '已配置' : '未配置',
        fallbackBaseUrl: process.env.FALLBACK_API_BASE_URL || '默认(OpenAI)',
        fallbackModel: this.getFallbackModel()
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
      primary: { success: false, error: null, model: this.getPrimaryModel() },
      fallback: { success: false, error: null, model: this.getFallbackModel() }
    };

    if (this.primaryClient) {
      try {
        const response = await this.requestCompletion(this.primaryClient, {
          model: this.getPrimaryModel(),
          messages: [
            { role: 'user', content: '请回复"连接测试成功"' }
          ]
        }, 'Primary API');

        const content = response?.choices?.[0]?.message?.content?.trim();
        if (!content) {
          throw new Error('Primary API returned empty content');
        }

        logger.success('主要 API 连接测试成功', { response: content });
        results.primary.success = true;
        
      } catch (error) {
        logger.warn('主要 API 连接测试失败', error);
        results.primary.error = error.message;
      }
    } else {
      results.primary.error = '主要 API 未配置';
    }

    if (this.fallbackClient) {
      try {
        const response = await this.requestCompletion(this.fallbackClient, {
          model: this.getFallbackModel(),
          messages: [
            { role: 'user', content: '请回复"连接测试成功"' }
          ]
        }, 'Fallback API');

        const content = response?.choices?.[0]?.message?.content?.trim();
        if (!content) {
          throw new Error('Fallback API returned empty content');
        }

        logger.success('备用 API 连接测试成功', { response: content });
        results.fallback.success = true;
        
      } catch (error) {
        logger.warn('备用 API 连接测试失败', error);
        results.fallback.error = error.message;
      }
    } else {
      results.fallback.error = '备用 API 未配置';
    }

    const anyAvailable = results.primary.success || results.fallback.success;
    
    if (anyAvailable) {
      logger.success('AI 服务连接测试完成', { results });
    } else {
      logger.error('所有 AI API 连接测试都失败了', { results });
    }

    return { success: anyAvailable, results };
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    const primaryConfigured = !!process.env.PRIMARY_API_KEY;
    const fallbackConfigured = !!process.env.FALLBACK_API_KEY;
    
    return {
      initialized: this.isInitialized,
      primary: {
        model: 'Primary API',
        configured: primaryConfigured,
        apiKey: process.env.PRIMARY_API_KEY ? '已配置' : '未配置',
        baseUrl: process.env.PRIMARY_API_BASE_URL || '默认(OpenAI)',
        modelName: this.getPrimaryModel()
      },
      fallback: {
        model: 'Fallback API',
        configured: fallbackConfigured,
        apiKey: process.env.FALLBACK_API_KEY ? '已配置' : '未配置',
        baseUrl: process.env.FALLBACK_API_BASE_URL || '默认(OpenAI)',
        modelName: this.getFallbackModel()
      }
    };
  }
}

module.exports = new AIService(); 
