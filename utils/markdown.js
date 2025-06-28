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

  // 1. 转义所有在单词内部的下划线 `_`
  // 这可以防止 `variable_name` 这类写法导致解析错误
  processedText = processedText.replace(/(?<=[a-zA-Z0-9])_(?=[a-zA-Z0-9])/g, '\\_');

  // 2. 检查并修复未配对的 Markdown 实体
  const entities = ['*', '_', '`'];
  for (const char of entities) {
    // 正则：匹配未被转义的字符
    const unescapedCharRegex = new RegExp(`(?<!\\\\)\\${char}`, 'g');
    let count = (processedText.match(unescapedCharRegex) || []).length;
    
    // 对于星号(*)，需要排除用作列表项的情况
    if (char === '*') {
      // 正则：匹配行首的列表项标记（*后跟一个空格）
      const bulletRegex = /^\s*\*\s/gm;
      const bulletCount = (processedText.match(bulletRegex) || []).length;
      count -= bulletCount;
    }
    
    // 如果数量为奇数，说明有未配对的实体
    if (count > 0 && count % 2 !== 0) {
      logger.warn(`检测到未配对的 Markdown 字符 "${char}"，将进行转义处理。`);
      
      // 找到最后一个未被转义的字符并将其转义
      let lastIndex = processedText.lastIndexOf(char);
      while (lastIndex !== -1) {
        // 如果找到的字符已被转义，则继续往前找
        if (lastIndex > 0 && processedText[lastIndex - 1] === '\\') {
          lastIndex = processedText.lastIndexOf(char, lastIndex - 2);
        } else {
          // 找到目标，跳出循环
          break;
        }
      }

      if (lastIndex !== -1) {
        processedText = 
          processedText.substring(0, lastIndex) + 
          '\\' + 
          processedText.substring(lastIndex);
      }
    }
  }
  
  // 3. (可选) 移除用户可能不小心输入的实体嵌套
  // V1 不支持嵌套，例如 *`text`* 是无效的。这里简化处理，移除内层。
  processedText = processedText.replace(/\*\`(.+?)\`\*/g, '$1');
  processedText = processedText.replace(/\_\`(.+?)\`\_/g, '$1');

  if (processedText !== text) {
    logger.info('Markdown 文本已预处理', {
      originalLength: text.length,
      processedLength: processedText.length
    });
  }

  return processedText;
}

module.exports = {
  escapeMarkdown,
  escapeMarkdownV2,
  stripMarkdown,
  preProcessMarkdown
}; 