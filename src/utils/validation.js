/**
 * 输入校验工具
 * 供命令与输入验证中间件共用
 */

const { INPUT_LIMITS } = require('../config/constants');

/**
 * 清理和转义用户输入
 * @param {string} input - 用户输入
 * @returns {string} 清理后的输入
 */
function sanitizeInput(input) {
  if (typeof input !== 'string') {
    return '';
  }

  return input
    .replace(/[<>]/g, '') // 移除潜在的HTML标签
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // 移除控制字符
    .trim()
    .substring(0, INPUT_LIMITS.MAX_INPUT_LENGTH);
}

/**
 * 验证数字参数
 * @param {string} value - 要验证的值
 * @param {number} min - 最小值
 * @param {number} max - 最大值
 * @returns {number|null} 验证后的数字或null
 */
function validateNumber(value, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const num = parseInt(value);
  if (isNaN(num) || num < min || num > max) {
    return null;
  }
  return num;
}

module.exports = {
  sanitizeInput,
  validateNumber
};
