/**
 * 文本处理工具模块
 */

const textUtils = {
  /**
   * 统计文本信息
   * @param {string} text - 要统计的文本
   * @returns {Object} 统计结果
   */
  getTextStats(text) {
    if (!text || typeof text !== 'string') {
      return {
        characters: 0,
        words: 0,
        lines: 0,
        sentences: 0
      };
    }

    const characters = text.length;
    const words = text.trim().split(/\s+/).filter(word => word.length > 0).length;
    const lines = text.split('\n').length;
    const sentences = text.split(/[.!?]+/).filter(sentence => sentence.trim().length > 0).length;

    return {
      characters,
      words,
      lines,
      sentences
    };
  },

  /**
   * 截断文本到指定长度
   * @param {string} text - 要截断的文本
   * @param {number} maxLength - 最大长度
   * @returns {string} 截断后的文本
   */
  truncate(text, maxLength = 100) {
    if (!text || text.length <= maxLength) {
      return text;
    }
    
    return text.substring(0, maxLength - 3) + '...';
  },

  /**
   * 清理文本（移除多余空格、换行等）
   * @param {string} text - 要清理的文本
   * @returns {string} 清理后的文本
   */
  cleanText(text) {
    if (!text) return '';
    
    return text
      .replace(/\s+/g, ' ')  // 替换多个空格为单个空格
      .replace(/\n+/g, '\n') // 替换多个换行为单个换行
      .trim();               // 移除首尾空格
  },

  /**
   * 检查文本是否为空或只包含空格
   * @param {string} text - 要检查的文本
   * @returns {boolean} 是否为空
   */
  isEmpty(text) {
    return !text || text.trim().length === 0;
  },

  /**
   * 提取文本中的关键词（简单实现）
   * @param {string} text - 要分析的文本
   * @param {number} limit - 最大关键词数量
   * @returns {Array} 关键词数组
   */
  extractKeywords(text, limit = 5) {
    if (!text) return [];
    
    // 简单的关键词提取（按词频）
    const words = text.toLowerCase()
      .replace(/[^\w\s\u4e00-\u9fff]/g, '') // 只保留字母、数字、中文字符
      .split(/\s+/)
      .filter(word => word.length > 1);

    const wordCount = {};
    words.forEach(word => {
      wordCount[word] = (wordCount[word] || 0) + 1;
    });

    return Object.entries(wordCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([word]) => word);
  }
};

module.exports = textUtils; 