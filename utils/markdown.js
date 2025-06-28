/**
 * Markdown 工具模块
 * 提供Markdown相关的处理功能
 */

const logger = require('./logger');

/**
 * 转义传统Markdown特殊字符
 * 根据Telegram传统Markdown格式要求，只转义 '_', '*', '`', '[' 字符
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeMarkdown(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  return text
    .replace(/\\/g, '\\\\')    // 反斜杠 (必须最先处理)
    .replace(/\*/g, '\\*')     // 星号 - 粗体标记
    .replace(/_/g, '\\_')      // 下划线 - 斜体标记
    .replace(/`/g, '\\`')      // 反引号 - 代码标记
    .replace(/\[/g, '\\[');    // 左方括号 - 链接标记
}

/**
 * 转义MarkdownV2特殊字符（保留用于兼容性）
 * @param {string} text - 需要转义的文本
 * @returns {string} 转义后的文本
 */
function escapeMarkdownV2(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  return text
    .replace(/\\/g, '\\\\')    // 反斜杠 (必须最先处理)
    .replace(/\*/g, '\\*')     // 星号
    .replace(/_/g, '\\_')      // 下划线
    .replace(/\[/g, '\\[')     // 左方括号
    .replace(/\]/g, '\\]')     // 右方括号
    .replace(/\(/g, '\\(')     // 左圆括号
    .replace(/\)/g, '\\)')     // 右圆括号
    .replace(/~/g, '\\~')      // 波浪号
    .replace(/`/g, '\\`')      // 反引号
    .replace(/>/g, '\\>')      // 大于号
    .replace(/#/g, '\\#')      // 井号
    .replace(/\+/g, '\\+')     // 加号
    .replace(/-/g, '\\-')      // 减号
    .replace(/=/g, '\\=')      // 等号
    .replace(/\|/g, '\\|')     // 竖线
    .replace(/\{/g, '\\{')     // 左大括号
    .replace(/\}/g, '\\}')     // 右大括号
    .replace(/\./g, '\\.')     // 点号
    .replace(/!/g, '\\!');     // 感叹号
}

/**
 * 清理Markdown格式（转换为纯文本）
 * @param {string} text - 包含Markdown格式的文本
 * @returns {string} 纯文本
 */
function stripMarkdown(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  return text
    .replace(/\*/g, '')  // 移除星号
    .replace(/\_/g, '')  // 移除下划线
    .replace(/\`/g, '')  // 移除反引号
    .replace(/\[([^\]]+)\]\([^\)]+\)/g, '$1')  // 移除链接格式，保留文本
    .replace(/\#\#\#\#?\s/g, '')  // 移除标题标记
    .replace(/\>/g, '');  // 移除引用标记
}

/**
 * 安全的 Markdown 处理器，用于处理复杂的格式问题
 * 当常规预处理失败时使用此函数
 * @param {string} text - 需要处理的文本
 * @returns {string} 安全的 Markdown 文本
 */
function safeMarkdownProcess(text) {
  if (!text || typeof text !== 'string') {
    return text || '';
  }

  try {
    let safeText = text;

    // 1. 移除所有可能导致解析问题的字符组合
    safeText = safeText
      .replace(/([^\\])\*([^*]*?)\*/g, '$1\\*$2\\*')  // 转义未转义的星号对
      .replace(/([^\\])_([^_]*?)_/g, '$1\\_$2\\_')    // 转义未转义的下划线对
      .replace(/([^\\])`([^`]*?)`/g, '$1\\`$2\\`')    // 转义未转义的反引号对
      .replace(/\[([^\]]*?)\]\([^\)]*?\)/g, '$1')     // 移除链接，只保留文本
      .replace(/([^\\])\[/g, '$1\\[')                 // 转义孤立的左括号
      .replace(/([^\\])\]/g, '$1\\]')                 // 转义孤立的右括号
      .replace(/\\\*/g, '*')                          // 恢复已转义的星号为普通星号
      .replace(/\\_/g, '_')                           // 恢复已转义的下划线为普通下划线
      .replace(/\\`/g, '`')                           // 恢复已转义的反引号为普通反引号
      .replace(/\\\[/g, '[')                          // 恢复已转义的左括号
      .replace(/\\\]/g, ']');                         // 恢复已转义的右括号

    // 2. 再次进行标准转义
    safeText = escapeMarkdown(safeText);

    if (text && text.length > 0) {
      logger.info('使用安全Markdown处理器处理文本', {
        originalLength: text.length,
        processedLength: safeText.length
      });
    }

    return safeText;

  } catch (error) {
    logger.error('安全Markdown处理也失败，返回纯文本', { 
      error: error.message,
      textType: typeof text,
      textLength: text?.length
    });
    return stripMarkdown(text) || '';
  }
}

/**
 * 预处理发往 Telegram 的 Markdown 文本，修复常见的格式问题。
 * Telegram 的 Markdown V1 解析器非常严格，此函数旨在解决：
 * 1. 未配对的 `*`, `_`, `` ` ``
 * 2. `_` 字符出现在单词内部（例如 `snake_case`），这在 V1 中不被允许。
 * 
 * @param {string} text 要处理的 Markdown 文本
 * @returns {string} 处理后更安全的 Markdown 文本
 */
function preProcessMarkdown(text) {
  if (!text || typeof text !== 'string') {
    return text;
  }

  let processedText = text;

  try {
    // 1. 转义所有在单词内部的下划线 `_`
    // 这可以防止 `variable_name` 这类写法导致解析错误
    processedText = processedText.replace(/(?<=[a-zA-Z0-9])_(?=[a-zA-Z0-9])/g, '\\_');

    // 2. 检查并修复未配对的 Markdown 实体
    const entities = ['*', '_', '`'];
    for (const char of entities) {
      try {
        // 正则：匹配未被转义的字符，使用更安全的方式
        const unescapedMatches = [];
        let index = 0;
        while (index < processedText.length) {
          const charIndex = processedText.indexOf(char, index);
          if (charIndex === -1) break;
          
          // 检查是否被转义
          if (charIndex === 0 || processedText[charIndex - 1] !== '\\') {
            unescapedMatches.push(charIndex);
          }
          index = charIndex + 1;
        }
        
        let count = unescapedMatches.length;
        
        // 对于星号(*)，需要排除用作列表项的情况
        if (char === '*') {
          const bulletRegex = /^\s*\*\s/gm;
          const bulletCount = (processedText.match(bulletRegex) || []).length;
          count -= bulletCount;
        }
        
        // 如果数量为奇数，说明有未配对的实体
        if (count > 0 && count % 2 !== 0) {
          logger.warn(`检测到未配对的 Markdown 字符 "${char}"，将进行转义处理。`);
          
          // 转义最后一个未被转义的字符
          if (unescapedMatches.length > 0) {
            const lastIndex = unescapedMatches[unescapedMatches.length - 1];
            // 确保不是列表项标记
            if (char !== '*' || !processedText.substring(Math.max(0, lastIndex - 10), lastIndex + 10).match(/^\s*\*\s/m)) {
              processedText = 
                processedText.substring(0, lastIndex) + 
                '\\' + 
                processedText.substring(lastIndex);
            }
          }
        }
      } catch (entityError) {
        logger.warn(`处理 Markdown 字符 "${char}" 时出错`, { error: entityError.message });
      }
    }
    
    // 3. 移除可能导致问题的嵌套格式
    processedText = processedText.replace(/\*\`(.+?)\`\*/g, '`$1`');
    processedText = processedText.replace(/\_\`(.+?)\`\_/g, '`$1`');
    
    // 4. 修复可能的断开链接
    processedText = processedText.replace(/\[([^\]]*?)$/, '[$1]');
    processedText = processedText.replace(/^([^\[]*?)\]/m, '[$1]');

    if (processedText !== text) {
      logger.info('Markdown 文本已预处理', {
        originalLength: text.length,
        processedLength: processedText.length,
        changes: processedText !== text
      });
    }

  } catch (error) {
    logger.error('Markdown 预处理失败，返回转义的纯文本', { 
      error: error.message,
      originalLength: text?.length 
    });
    // 如果预处理失败，返回完全转义的文本
    return escapeMarkdown(text);
  }

  return processedText;
}

module.exports = {
  escapeMarkdown,
  escapeMarkdownV2,
  stripMarkdown,
  preProcessMarkdown,
  safeMarkdownProcess
}; 