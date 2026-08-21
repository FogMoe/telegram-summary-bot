/**
 * 总结结果发送器
 * 统一实现四级 Markdown 降级发送链与超长内容分段发送：
 *   原生 Markdown → 转义 Markdown → safeMarkdownProcess → 纯文本
 * 传输函数由调用方注入（bot API + 网络重试，或 ctx 回调），发送逻辑完全复用
 */

const logger = require('../../utils/logger');
const { SUMMARY_LIMITS } = require('../../config/constants');
const { safeMarkdownProcess } = require('../../utils/markdown');
const { formatSummaryResponse, formatPlainTextResponse } = require('../../utils/summaryFormatter');
const { isNetworkError, isMarkdownParseError } = require('./errorClassification');
const { splitTextIntoSegments } = require('./textSegmenter');
const { retryNetworkOperation } = require('./retry');

const MARKDOWN_OPTIONS = { parse_mode: 'Markdown', disable_web_page_preview: true };
const PLAIN_OPTIONS = { disable_web_page_preview: true };

/**
 * 创建基于 bot API 的消息编辑传输函数（带网络错误重试）
 */
function createTelegramEditSender(bot, chatId, messageId) {
  return (text, options) =>
    retryNetworkOperation(
      () => bot.telegram.editMessageText(chatId, messageId, undefined, text, options),
      { chatId, messageId, operation: 'editMessageText' }
    );
}

/**
 * 四级 Markdown 降级发送链
 * @param {Object} params
 * @param {Object} params.summaryResult - 总结结果 { summary, metadata }
 * @param {boolean} params.fromCache - 是否来自缓存（显示缓存徽标）
 * @param {Function} params.send - 传输函数 (text, options) => Promise
 * @param {boolean} params.rethrowNetworkErrors - 网络错误是否上抛（bot 路径上抛触发外层重试分支，ctx 路径降级为纯文本）
 * @param {string} params.logLabel - 日志前缀
 * @param {Object} params.logContext - 日志附加字段
 * @returns {Promise<'raw'|'escaped'|'safe'|'plain'>} 实际发送成功的级别
 */
async function sendWithMarkdownFallback({
  summaryResult,
  fromCache = false,
  send,
  rethrowNetworkErrors = true,
  logLabel = '总结结果',
  logContext = {}
}) {
  try {
    await send(
      formatSummaryResponse(summaryResult, { fromCache, escape: false }),
      MARKDOWN_OPTIONS
    );
    return 'raw';
  } catch (markdownError) {
    if (rethrowNetworkErrors && isNetworkError(markdownError)) {
      throw markdownError;
    }

    if (!isMarkdownParseError(markdownError)) {
      throw markdownError;
    }

    logger.warn(`${logLabel}Markdown格式错误，尝试转义后重试`, {
      ...logContext,
      error: markdownError.response.description,
      errorOffset: markdownError.response.description.match(/byte offset (\d+)/)
    });

    try {
      await send(
        formatSummaryResponse(summaryResult, { fromCache, escape: true }),
        MARKDOWN_OPTIONS
      );
      logger.success(`使用转义Markdown格式推送${logLabel}`, logContext);
      return 'escaped';
    } catch (escapedError) {
      if (rethrowNetworkErrors && isNetworkError(escapedError)) {
        throw escapedError;
      }

      if (isMarkdownParseError(escapedError)) {
        logger.warn(`${logLabel}转义后仍有Markdown格式错误，使用安全处理器`, {
          ...logContext,
          error: escapedError.response.description
        });

        try {
          const safeResult = {
            summary: safeMarkdownProcess(summaryResult.summary || ''),
            metadata: summaryResult.metadata || {}
          };
          await send(
            formatSummaryResponse(safeResult, { fromCache, escape: false }),
            MARKDOWN_OPTIONS
          );
          logger.success(`使用安全Markdown处理器推送${logLabel}`, logContext);
          return 'safe';
        } catch (safeError) {
          logger.warn(`${logLabel}安全Markdown处理器也失败，使用纯文本`, {
            ...logContext,
            error: safeError.response?.description
          });
        }
      }

      await send(formatPlainTextResponse(summaryResult, { fromCache }), PLAIN_OPTIONS);
      logger.info(`使用纯文本格式推送${logLabel}`, logContext);
      return 'plain';
    }
  }
}

/**
 * 发送单条总结消息（bot API 路径）
 * 返回实际发送成功的降级级别（raw/escaped/safe/plain）
 */
async function sendSingleSummary(bot, chatId, messageId, summaryResult, taskId) {
  const logContext = { taskId, chatId, messageId };

  const level = await sendWithMarkdownFallback({
    summaryResult,
    fromCache: false,
    send: createTelegramEditSender(bot, chatId, messageId),
    rethrowNetworkErrors: true,
    logLabel: '总结结果',
    logContext
  });

  if (level === 'raw') {
    logger.success('总结结果已推送 (单条消息)', logContext);
  }

  return level;
}

/**
 * 分段发送总结消息（bot API 路径）
 * 首段编辑原"处理中"消息，其余段落作为新消息发送，统计块最后单独发送
 */
async function sendSegmentedSummary(bot, chatId, messageId, fullResponse, taskId) {
  // 分离主要内容和统计信息（依赖 formatSummaryResponse 中 "\n\n📊" 分节的输出约定）
  const parts = fullResponse.split('\n\n📊');
  const mainContent = parts[0];
  const statsContent = parts[1] ? '\n\n📊' + parts[1] : '';

  // 分割主要内容
  const segments = splitTextIntoSegments(
    mainContent,
    SUMMARY_LIMITS.RESPONSE_SEGMENT_MAIN_MAX_LENGTH
  );

  logger.info('开始分段发送总结', {
    taskId,
    chatId,
    totalSegments: segments.length,
    totalLength: fullResponse.length
  });

  const sendWithRetry = createTelegramEditSender(bot, chatId, messageId);

  try {
    // 发送第一段（替换原消息）
    const firstSegment = segments.length > 1
      ? `${segments[0]}\n\n📝 *总结分段发送中... (1/${segments.length})*`
      : segments[0];

    await sendWithRetry(firstSegment, MARKDOWN_OPTIONS);

    // 发送其余段落（新消息）
    for (let i = 1; i < segments.length; i++) {
      const segment = `${segments[i]}\n\n📝 *总结续篇 (${i + 1}/${segments.length})*`;

      await bot.telegram.sendMessage(chatId, segment, MARKDOWN_OPTIONS);

      // 短暂延迟避免过快发送
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // 发送统计信息（如果有）
    if (statsContent.trim()) {
      await bot.telegram.sendMessage(chatId, statsContent, MARKDOWN_OPTIONS);
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

    await sendWithRetry(truncatedResponse, MARKDOWN_OPTIONS);
  }
}

module.exports = {
  createTelegramEditSender,
  sendWithMarkdownFallback,
  sendSingleSummary,
  sendSegmentedSummary
};
