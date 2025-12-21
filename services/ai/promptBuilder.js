const LANGUAGE_NAMES = {
  'zh': 'Simplified Chinese',
  'zh-tw': 'Traditional Chinese',
  'en': 'English',
  'ja': 'Japanese',
  'ko': 'Korean',
  'es': 'Spanish',
  'fr': 'French',
  'de': 'German',
  'ru': 'Russian',
  'pt': 'Portuguese',
  'it': 'Italian',
  'ar': 'Arabic',
  'hi': 'Hindi',
  'th': 'Thai',
  'vi': 'Vietnamese',
  'id': 'Indonesian',
  'ms': 'Malay',
  'tr': 'Turkish',
  'nl': 'Dutch',
  'sv': 'Swedish',
  'da': 'Danish',
  'no': 'Norwegian',
  'fi': 'Finnish',
  'pl': 'Polish',
  'cs': 'Czech',
  'sk': 'Slovak',
  'hu': 'Hungarian',
  'ro': 'Romanian',
  'bg': 'Bulgarian',
  'hr': 'Croatian',
  'sr': 'Serbian',
  'sl': 'Slovenian',
  'et': 'Estonian',
  'lv': 'Latvian',
  'lt': 'Lithuanian',
  'uk': 'Ukrainian',
  'be': 'Belarusian',
  'ka': 'Georgian',
  'am': 'Amharic',
  'he': 'Hebrew',
  'fa': 'Persian',
  'ur': 'Urdu'
};

/**
 * 构建系统提示词
 * - 注意：用户名可能包含下划线等特殊字符，在提及用户时要自然表达，避免过度使用下划线和其他格式字符
 * @param {string} detectedLanguage - 检测到的群组主要语言
 */
function buildSystemPrompt(detectedLanguage = 'zh') {
  const languageName = resolveLanguageName(detectedLanguage);

  return `You are a professional Telegram group chat analysis assistant. Analyze the chat logs and produce a structured summary.

Requirements:
1. Respond in ${languageName}.
2. Provide an objective and accurate summary highlighting main topics and key discussion points.
3. Analyze interaction patterns while respecting user privacy.
4. Keep the summary concise and focused.
5. Keep the summary under 4000 characters.
6. Output valid JSON only. Do not wrap in code fences.
7. JSON fields must include: main_topics, discussion_points, activity_analysis, special_events, other_notes.
8. Field values must be plain text without Markdown or special formatting.`;
}

function resolveLanguageName(detectedLanguage = 'zh') {
  return LANGUAGE_NAMES[detectedLanguage] || detectedLanguage || 'English';
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toLocaleString('en-US', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

/**
 * 构建用户提示词
 * @param {string} messagesText - 消息文本
 * @param {Object} stats - 统计信息
 * @param {string} userInfo - 用户信息
 * @param {number} messageCount - 消息数量
 * @param {string} detectedLanguage - 检测到的语言
 */
function buildUserPrompt(messagesText, stats, userInfo, messageCount, detectedLanguage = 'zh') {
  const languageName = resolveLanguageName(detectedLanguage);

  return `Please summarize the following Telegram group chat.
Respond in ${languageName}.

Group Statistics:
- Messages analyzed: ${messageCount}
- Users: ${stats.unique_users}
- Time range: ${formatTimestamp(stats.earliest_message)} to ${formatTimestamp(stats.latest_message)}
- Active users: ${userInfo}

Chat Records:
${messagesText}

Generate a structured summary identifying main topics, key discussions, and group interaction patterns.`;
}

/**
 * 构建结构化输出格式定义
 * @param {string} detectedLanguage - 检测到的语言
 */
function buildResponseFormat(detectedLanguage = 'zh') {
  const desc = {
    main_topics: 'List of main topics',
    discussion_points: 'List of important discussion points',
    activity_analysis: 'Group activity analysis',
    special_events: 'Special events or decisions',
    other_notes: 'Other notes'
  };

  return {
    type: "json_schema",
    json_schema: {
      name: "telegram_summary",
      strict: true,
      schema: {
        type: "object",
        properties: {
          main_topics: {
            type: "array",
            items: { type: "string" },
            description: desc.main_topics
          },
          discussion_points: {
            type: "array",
            items: { type: "string" },
            description: desc.discussion_points
          },
          activity_analysis: {
            type: "string",
            description: desc.activity_analysis
          },
          special_events: {
            type: "string",
            description: desc.special_events
          },
          other_notes: {
            type: "string",
            description: desc.other_notes
          }
        },
        required: ["main_topics", "discussion_points", "activity_analysis", "special_events", "other_notes"],
        additionalProperties: false
      }
    }
  };
}


module.exports = {
  buildSystemPrompt,
  buildUserPrompt,
  buildResponseFormat
}; 
