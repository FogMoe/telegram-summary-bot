/**
 * 长文本分段器
 * 将超长文本在自然断点处切分为多段，供分段发送使用
 */

const { SUMMARY_LIMITS } = require('../../config/constants');

/**
 * 智能分割长文本为多个段落
 * @param {string} text - 要分割的文本
 * @param {number} maxLength - 每段最大长度
 * @returns {Array} 分割后的文本段数组
 */
function splitTextIntoSegments(text, maxLength = SUMMARY_LIMITS.RESPONSE_SEGMENT_MAX_LENGTH) {
  if (text.length <= maxLength) {
    return [text];
  }

  const segments = [];
  let currentPos = 0;

  while (currentPos < text.length) {
    let segmentEnd = currentPos + maxLength;

    // 如果这是最后一段，直接取到结尾
    if (segmentEnd >= text.length) {
      segments.push(text.substring(currentPos));
      break;
    }

    // 尝试在合适的位置分段（优先级：\n\n > \n > 。\n > 。 > 空格）
    const searchText = text.substring(currentPos, segmentEnd);
    const breakPoints = [
      { char: '\n\n', priority: 5 },
      { char: '\n', priority: 4 },
      { char: '。\n', priority: 3 },
      { char: '。', priority: 2 },
      { char: ' ', priority: 1 }
    ];

    let bestBreakPoint = segmentEnd;
    for (const breakPoint of breakPoints) {
      const lastIndex = searchText.lastIndexOf(breakPoint.char);
      if (lastIndex > maxLength * 0.7) { // 确保不会分段太短
        bestBreakPoint = currentPos + lastIndex + breakPoint.char.length;
        break;
      }
    }

    segments.push(text.substring(currentPos, bestBreakPoint));
    currentPos = bestBreakPoint;
  }

  return segments;
}

module.exports = {
  splitTextIntoSegments
};
