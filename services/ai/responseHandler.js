const jsonString = /"(?:[^"\\\x00-\x1f]|\\(?:["\\/bfnrt]|u[\da-fA-F]{4}))*"/.source;
const jsonStringList = jsonString + '(?:[ \\t\\r\\n]*,[ \\t\\r\\n]*' + jsonString + ')*';
const summaryField = new RegExp(
  '"(main_topics|discussion_points|activity_analysis|special_events|other_notes)"\\s*:\\s*' +
  '(?:(' + jsonString + ')|\\[\\s*(' + jsonStringList + '))',
  'g'
);

function parseSummaryData(content) {
  try {
    return JSON.parse(content);
  } catch {
    const firstBrace = content.indexOf('{');
    if (firstBrace === -1) {
      return null;
    }

    const json = content.slice(firstBrace).replace(/[\r\n\t]/g, ' ');
    const lastBrace = json.lastIndexOf('}');
    if (lastBrace !== -1) {
      try {
        return JSON.parse(json.slice(0, lastBrace + 1));
      } catch {
        // Fall through to recovering complete values from malformed JSON.
      }
    }

    const recovered = {};
    for (const [, field, text, items] of json.matchAll(summaryField)) {
      recovered[field] = JSON.parse(text ?? '[' + items + ']');
    }
    return recovered;
  }
}

function parseSummaryResponse(content, detectedLanguage) {
  const structuredData = parseSummaryData(content);
  if (!structuredData || typeof structuredData !== 'object' || Array.isArray(structuredData)) {
    return null;
  }

  const summary = formatStructuredSummary(structuredData, detectedLanguage);
  return summary ? { summary, structuredData } : null;
}

function normalizeList(value) {
  const items = Array.isArray(value) ? value : [value];
  return items
    .filter(item => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

/**
 * 格式化结构化摘要结果
 * @param {Object} structuredResult - 结构化结果
 * @param {string} detectedLanguage - 检测到的语言
 */
function formatStructuredSummary(structuredResult, detectedLanguage = 'zh') {
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
  const activityAnalysis = normalizeList(structuredResult.activity_analysis).join('\n');
  if (activityAnalysis) {
    formattedSummary += `${template.activityAnalysis}\n${activityAnalysis}\n\n`;
  }

  // 特殊事件
  const specialEvents = normalizeList(structuredResult.special_events).join('\n');
  if (specialEvents) {
    formattedSummary += `${template.specialEvents}\n${specialEvents}\n\n`;
  }

  // 其他备注
  const otherNotes = normalizeList(structuredResult.other_notes).join('\n');
  if (otherNotes) {
    formattedSummary += `${template.otherNotes}\n${otherNotes}`;
  }

  return formattedSummary.trim();
}

module.exports = {
  parseSummaryResponse,
  formatStructuredSummary
}; 
