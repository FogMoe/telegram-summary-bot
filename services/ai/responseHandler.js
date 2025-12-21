const logger = require('../../utils/logger');

/**
 * 清理JSON内容，修复常见的格式问题
 * @param {string} jsonContent - 原始JSON内容
 * @returns {string} 清理后的JSON内容
 */
function cleanJsonContent(jsonContent) {
  if (!jsonContent || typeof jsonContent !== 'string') {
    return jsonContent;
  }

  let cleaned = jsonContent.trim();
  
  try {
    // 1. 移除可能的代码块标记
    cleaned = cleaned.replace(/^```json\s*/, '').replace(/\s*```$/, '');
    cleaned = cleaned.replace(/^```\s*/, '').replace(/\s*```$/, '');
    
    // 2. 找到JSON对象的边界
    const firstBrace = cleaned.indexOf('{');
    let lastBrace = cleaned.lastIndexOf('}');
    
    if (firstBrace !== -1) {
      // 如果没有找到结束大括号，可能是截断了
      if (lastBrace === -1 || lastBrace <= firstBrace) {
        logger.warn('JSON内容可能被截断，尝试智能修复');
        
        // 截断修复策略
        cleaned = repairTruncatedJson(cleaned.substring(firstBrace));
      } else {
        cleaned = cleaned.substring(firstBrace, lastBrace + 1);
      }
    }
    
    // 3. 基础清理：移除多余的逗号和空白
    cleaned = cleaned
      .replace(/,(\s*[}\]])/g, '$1')      // 移除尾随逗号
      .replace(/\{\s*,/g, '{')            // 移除对象开头的逗号
      .replace(/\[\s*,/g, '[');           // 移除数组开头的逗号
    
    // 4. 激进但有效的清理方法
    // 将所有换行符、制表符替换为空格，避免复杂的转义
    cleaned = cleaned
      .replace(/[\r\n\t]/g, ' ')          // 替换所有控制字符为空格
      .replace(/\s+/g, ' ')               // 压缩多个空格为单个空格
      .replace(/"\s*:\s*"/g, '": "')      // 规范化键值对格式
      .replace(/,\s*}/g, '}')             // 移除尾随逗号
      .replace(/,\s*]/g, ']')             // 移除数组尾随逗号
      .trim();
    
    logger.debug('JSON清理完成', {
      originalLength: jsonContent.length,
      cleanedLength: cleaned.length,
      originalPreview: jsonContent.substring(0, 100),
      cleanedPreview: cleaned.substring(0, 100)
    });
    
    return cleaned;
    
  } catch (error) {
    logger.warn('JSON清理过程中发生错误', error);
    return jsonContent;
  }
}

/**
 * 修复被截断的JSON内容
 * @param {string} truncatedJson - 被截断的JSON字符串
 * @returns {string} 修复后的JSON字符串
 */
function repairTruncatedJson(truncatedJson) {
  if (!truncatedJson || !truncatedJson.startsWith('{')) {
    return truncatedJson;
  }

  try {
    let repaired = truncatedJson;
    
    // 检查是否是在字符串中间被截断
    const quoteCount = (repaired.match(/"/g) || []).length;
    const isInsideString = quoteCount % 2 === 1;
    
    if (isInsideString) {
      // 如果在字符串中间被截断，尝试闭合字符串
      repaired += '"';
      logger.info('检测到字符串中间截断，已添加结束引号');
    }
    
    // 构建一个最小有效的JSON结构
    const requiredFields = [
      'main_topics',
      'discussion_points',
      'activity_analysis',
      'special_events',
      'other_notes'
    ];
    
    // 尝试提取已存在的字段值
    const extractedFields = {};
    for (const field of requiredFields) {
      const fieldPattern = new RegExp(`"${field}"\\s*:\\s*(".*?"|\\[.*?\\]|[^,}]+)`, 's');
      const match = repaired.match(fieldPattern);
      if (match) {
        let value = match[1].trim();
        
        // 如果是字符串但没有结束引号，添加结束引号
        if (value.startsWith('"') && !value.endsWith('"')) {
          value += '"';
        }
        
        extractedFields[field] = value;
      }
    }
    
    // 为缺失的字段提供默认值
    const defaultValues = {
      main_topics: '["响应截断"]',
      discussion_points: '["内容不完整"]',
      activity_analysis: '"响应被截断，无法分析"',
      special_events: '"无"',
      other_notes: '"请重新尝试获取完整总结"'
    };
    
    // 构建完整的JSON
    const jsonParts = [];
    for (const field of requiredFields) {
      const value = extractedFields[field] || defaultValues[field];
      jsonParts.push(`"${field}": ${value}`);
    }
    
    const completeJson = `{${jsonParts.join(', ')}}`;
    
    logger.info('截断JSON修复完成', {
      originalLength: truncatedJson.length,
      repairedLength: completeJson.length,
      extractedFields: Object.keys(extractedFields).length,
      addedDefaults: requiredFields.length - Object.keys(extractedFields).length
    });
    
    return completeJson;
    
  } catch (error) {
    logger.error('修复截断JSON时发生错误', error);
    
    // 应急方案：返回一个基本的有效JSON
    return `{
      "main_topics": ["系统错误"],
      "discussion_points": ["响应截断"],
      "activity_analysis": "由于技术问题无法分析",
      "special_events": "无",
      "other_notes": "请重试获取完整总结"
    }`;
  }
}

/**
 * 从失败的JSON中提取可能的总结内容
 * @param {string} failedJson - 失败的JSON字符串
 * @returns {string} 提取的总结内容
 */
function extractSummaryFromFailedJson(failedJson) {
  if (!failedJson || typeof failedJson !== 'string') {
    return '总结生成时遇到格式问题，请重试。';
  }

  try {
    logger.debug('尝试从失败JSON中提取内容', { 
      jsonLength: failedJson.length,
      jsonPreview: failedJson.substring(0, 200) 
    });
    
    // 方法1: 尝试构建基本的总结结构
    const extractedParts = {};
    
    // 提取各个字段
    const fieldPatterns = {
      main_topics: /"main_topics"\s*:\s*\[(.*?)\]/s,
      discussion_points: /"discussion_points"\s*:\s*\[(.*?)\]/s,
      activity_analysis: /"activity_analysis"\s*:\s*"([^"]*)/,
      special_events: /"special_events"\s*:\s*"([^"]*)/,
      other_notes: /"other_notes"\s*:\s*"([^"]*)"/
    };
    
    for (const [field, pattern] of Object.entries(fieldPatterns)) {
      const match = failedJson.match(pattern);
      if (match && match[1]) {
        extractedParts[field] = match[1].replace(/\\"/g, '"').replace(/\\n/g, '\n');
      }
    }
    
    // 如果提取到足够的内容，重新构建概要文本（纯文本）
    if (Object.keys(extractedParts).length >= 2) {
      const parts = [];
      
      if (extractedParts.main_topics) {
        const topics = extractedParts.main_topics
          .replace(/["\[\]]/g, '')
          .split(',')
          .filter(t => t.trim().length > 0)
          .map(t => `- ${t.trim()}`);
        if (topics.length) {
          parts.push(`主要话题:\n${topics.join('\n')}`);
        }
      }
      
      if (extractedParts.discussion_points) {
        const points = extractedParts.discussion_points
          .replace(/["\[\]]/g, '')
          .split(',')
          .filter(p => p.trim().length > 0)
          .map(p => `- ${p.trim()}`);
        if (points.length) {
          parts.push(`讨论要点:\n${points.join('\n')}`);
        }
      }
      
      if (extractedParts.activity_analysis) {
        parts.push(`活跃度分析:\n${extractedParts.activity_analysis}`);
      }
      
      if (extractedParts.special_events) {
        parts.push(`特殊事件:\n${extractedParts.special_events}`);
      }
      
      if (extractedParts.other_notes) {
        parts.push(`其他备注:\n${extractedParts.other_notes}`);
      }
      
      const reconstructed = parts.join('\n\n');
      
      logger.info('成功重构部分总结内容', { 
        fieldsExtracted: Object.keys(extractedParts).length,
        contentLength: reconstructed.length 
      });
      
      return reconstructed.trim();
    }
    
    // 方法3: 如果JSON看起来包含明显的总结内容，提取可见文本
    const textContent = failedJson
      .replace(/[{}":\[\],]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
      
    if (textContent.length > 100 && (textContent.includes('话题') || textContent.includes('讨论') || textContent.includes('活跃'))) {
      logger.info('提取到文本内容作为回退');
      return `文本提取内容：${textContent.substring(0, 500)}${textContent.length > 500 ? '...' : ''}`;
    }
    
    // 如果都没有找到，返回友好的错误消息
    return `总结解析失败，请稍后重试或尝试减少消息数量。`;
    
  } catch (error) {
    logger.error('提取失败JSON内容时发生错误', error);
    return '总结生成遇到技术问题，请重试。';
  }
}

/**
 * 格式化结构化摘要结果
 * @param {Object} structuredResult - 结构化结果
 * @param {string} detectedLanguage - 检测到的语言
 */
function formatStructuredSummary(structuredResult, detectedLanguage = 'zh') {
  const normalizeList = (value) => {
    if (Array.isArray(value)) {
      return value
        .map(item => {
          if (item === null || item === undefined) {
            return '';
          }
          if (typeof item === 'string') {
            return item.trim();
          }
          return JSON.stringify(item);
        })
        .filter(item => item && item.trim().length > 0);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      return [value.trim()];
    }
    if (value === null || value === undefined) {
      return [];
    }
    return [String(value)];
  };

  // 否则根据结构化数据生成格式化摘要
  const templates = {
    'zh': {
      mainTopics: '*📌 主要话题概述*',
      discussionPoints: '*💬 重要讨论点*',
      activityAnalysis: '*👥 群组活跃度分析*',
      specialEvents: '*⭐ 特殊事件或决定*',
      otherNotes: '*🖊 其他备注*'
    },
    'en': {
      mainTopics: '*📌 Main Topics Overview*',
      discussionPoints: '*💬 Important Discussion Points*',
      activityAnalysis: '*👥 Group Activity Analysis*',
      specialEvents: '*⭐ Special Events or Decisions*',
      otherNotes: '*🖊 Other Notes*'
    }
  };

  const template = templates[detectedLanguage] || templates['en'];
  
  let formattedSummary = '';

  // 主要话题
  const mainTopics = normalizeList(structuredResult.main_topics);
  if (mainTopics.length > 0) {
    formattedSummary += `${template.mainTopics}\n`;
    mainTopics.forEach(topic => {
      formattedSummary += `• ${topic}\n`;
    });
    formattedSummary += '\n';
  }

  // 重要讨论点
  const discussionPoints = normalizeList(structuredResult.discussion_points);
  if (discussionPoints.length > 0) {
    formattedSummary += `${template.discussionPoints}\n`;
    discussionPoints.forEach(point => {
      formattedSummary += `• ${point}\n`;
    });
    formattedSummary += '\n';
  }

  // 群组活跃度分析
  if (structuredResult.activity_analysis) {
    formattedSummary += `${template.activityAnalysis}\n${structuredResult.activity_analysis}\n\n`;
  }

  // 特殊事件
  if (structuredResult.special_events) {
    formattedSummary += `${template.specialEvents}\n${structuredResult.special_events}\n\n`;
  }

  // 其他备注
  if (structuredResult.other_notes) {
    formattedSummary += `${template.otherNotes}\n${structuredResult.other_notes}`;
  }

  return formattedSummary.trim();
}

module.exports = {
  cleanJsonContent,
  repairTruncatedJson,
  extractSummaryFromFailedJson,
  formatStructuredSummary
}; 
