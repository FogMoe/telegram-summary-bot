const logger = require('../../utils/logger');

/**
 * 检测群组消息的主要语言
 * @param {Array} messages - 消息列表
 * @returns {string} 检测到的语言代码
 */
function detectLanguage(messages) {
  // 合并所有消息文本用于语言检测
  const allText = messages.map(msg => msg.text).join(' ');
  
  // 简单的语言检测规则（基于字符和关键词）
  const languagePatterns = {
    // 中文（简体）
    'zh': /[\u4e00-\u9fff]/,
    // 中文（繁体）- 检测繁体字特征
    'zh-tw': /[繁體臺灣復興課時間]/,
    // 英文
    'en': /^[a-zA-Z\s\d\.,!?\-'"():;]+$/,
    // 日文
    'ja': /[\u3040-\u309f\u30a0-\u30ff]/,
    // 韩文
    'ko': /[\uac00-\ud7af]/,
    // 俄文
    'ru': /[\u0400-\u04ff]/,
    // 阿拉伯文
    'ar': /[\u0600-\u06ff]/,
    // 泰文
    'th': /[\u0e00-\u0e7f]/,
    // 越南文（检测特殊字符）
    'vi': /[àáâãèéêìíòóôõùúýăđĩũơưạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịọỏốồổỗộớờởỡợụủứừửữựỳỵỷỹ]/,
    // 德文
    'de': /[äöüßÄÖÜ]/,
    // 法文
    'fr': /[àâäéèêëïîôöùûüÿç]/,
    // 西班牙文
    'es': /[ñáéíóúü¿¡]/,
    // 葡萄牙文
    'pt': /[ãõáéíóúâêîôûàèìòùç]/,
    // 意大利文
    'it': /[àèéìíîòóù]/,
    // 荷兰文
    'nl': /[áéíóúèë]/,
    // 波兰文
    'pl': /[ąćęłńóśźż]/,
    // 土耳其文
    'tr': /[çğıöşü]/,
    // 匈牙利文
    'hu': /[áéíóöőúüű]/
  };

  // 计算各种语言的匹配度
  const languageScores = {};
  
  for (const [lang, pattern] of Object.entries(languagePatterns)) {
    const matches = allText.match(new RegExp(pattern.source, 'g'));
    languageScores[lang] = matches ? matches.length : 0;
  }

  // 特殊处理：检查英文（如果主要是ASCII字符）
  const asciiRatio = (allText.match(/[a-zA-Z\s]/g) || []).length / allText.length;
  if (asciiRatio > 0.8 && languageScores['zh'] === 0) {
    languageScores['en'] = allText.length * 0.8;
  }

  // 找出得分最高的语言
  const detectedLanguage = Object.entries(languageScores)
    .filter(([, score]) => score > 0)
    .sort(([,a], [,b]) => b - a)[0]?.[0] || 'en';

  logger.info(`检测到群组主要语言: ${detectedLanguage}`, {
    scores: Object.fromEntries(
      Object.entries(languageScores)
        .filter(([, score]) => score > 0)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 3)
    )
  });

  return detectedLanguage;
}

module.exports = {
  detectLanguage
}; 