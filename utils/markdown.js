/**
 * Markdown 工具模块
 * 提供Markdown相关的处理功能
 */

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

module.exports = {
  escapeMarkdown,
  escapeMarkdownV2,
  stripMarkdown
}; 