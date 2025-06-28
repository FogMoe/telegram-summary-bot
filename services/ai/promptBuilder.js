/**
 * 构建系统提示词
 * - 注意：用户名可能包含下划线等特殊字符，在提及用户时要自然表达，避免过度使用下划线和其他格式字符
 * @param {string} detectedLanguage - 检测到的群组主要语言
 */
function buildSystemPrompt(detectedLanguage = 'zh') {
  const languageInstructions = {
    'zh': '使用简体中文回复，注重自然的中文表达习惯，体现中文语境下的文化背景',
    'zh-tw': '使用繁體中文回复，符合繁體中文的表達習慣',
    'en': 'Reply in English with clear, natural expression suitable for international users',
    'ja': '日本語で返答してください。日本語の自然な表現習慣に注意し、適切な敬語を使用してください',
    'ko': '한국어로 답변해주세요',
    'es': 'Responde en español',
    'fr': 'Répondez en français',
    'de': 'Antworten Sie auf Deutsch',
    'ru': 'Отвечайте на русском языке',
    'pt': 'Responda em português',
    'it': 'Rispondi in italiano',
    'ar': 'أجب باللغة العربية',
    'hi': 'हिंदी में उत्तर दें',
    'th': 'ตอบเป็นภาษาไทย',
    'vi': 'Trả lời bằng tiếng Việt',
    'id': 'Jawab dalam bahasa Indonesia',
    'ms': 'Jawab dalam bahasa Melayu',
    'tr': 'Türkçe cevap verin',
    'nl': 'Antwoord in het Nederlands',
    'sv': 'Svara på svenska',
    'da': 'Svar på dansk',
    'no': 'Svar på norsk',
    'fi': 'Vastaa suomeksi',
    'pl': 'Odpowiedz po polsku',
    'cs': 'Odpovězte v češtině',
    'sk': 'Odpovedajte v slovenčine',
    'hu': 'Válaszoljon magyarul',
    'ro': 'Răspundeți în română',
    'bg': 'Отговорете на български',
    'hr': 'Odgovorite na hrvatskom',
    'sr': 'Одговорите на српском',
    'sl': 'Odgovorite v slovenščini',
    'et': 'Vastake eesti keeles',
    'lv': 'Atbildiet latviešu valodā',
    'lt': 'Atsakykite lietuvių kalba',
    'uk': 'Відповідайте українською',
    'be': 'Адказвайце па-беларуску',
    'ka': 'უპასუხეთ ქართულად',
    'am': 'በአማርኛ ይመልሱ',
    'he': 'ענה בעברית',
    'fa': 'به فارسی پاسخ دهید',
    'ur': 'اردو میں جواب دیں'
  };

  const languageInstruction = languageInstructions[detectedLanguage] || languageInstructions['en'];

  return `你是专业的Telegram群组聊天分析助手。请分析聊天记录并生成结构化总结。

要求：
1. ${languageInstruction}
2. 提供客观准确的总结，识别主要话题和讨论重点
3. 分析群组成员互动模式，保护用户隐私
4. 总结简洁明了，突出重点
5. 总结长度不超过4000字符

⚠️ CRITICAL：必须输出完整有效的JSON格式！
• 确保JSON以{开始，以}结束
• 包含所有6个required字段，不能遗漏
• 字符串必须用双引号包围且正确转义
• 如果内容较长请确保在token限制内完成所有字段

formatted_summary使用Telegram Markdown格式：
• *文本* = 粗体，_文本_ = 斜体，\`代码\` = 等宽字体
• 适当使用表情符号🔣增加可读性
• 使用\\n表示换行组织内容结构

required结构：
*📌 主要话题概述* - 核心主题简洁概括
*💬 重要讨论点* - 关键讨论内容和观点  
*👥 群组活跃度分析* - 成员参与度和互动模式
*⭐ 特殊事件或决定* - 重要事件或达成的决定
*🖊 其他备注* - 其他有用信息

确保所有标题用*粗体*标记，格式一致！`
}

/**
 * 格式化时间戳
 */
function formatTimestamp(timestamp) {
  return new Date(timestamp * 1000).toLocaleString('zh-CN', {
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
  // 根据检测到的语言调整提示词
                const prompts = {
     'zh': {
       title: '请总结以下Telegram群组聊天记录：',
       statsTitle: '*群组统计信息*',
       analyzedMessages: '• 分析消息数：',
       participantUsers: '• 参与用户数：',
       timeRange: '• 时间范围：',
       activeUsers: '• 活跃用户：',
       chatRecords: '*聊天记录*',
       instruction: '请基于以上聊天记录生成结构化总结，识别主要话题、重要讨论点和群组互动情况。',
       messageUnit: ' 条',
       userUnit: ' 人',
       timeTo: ' 至 '
     },
     'en': {
       title: 'Please summarize the following Telegram group chat:',
       statsTitle: '*Group Statistics*',
       analyzedMessages: '• Messages analyzed: ',
       participantUsers: '• Users: ',
       timeRange: '• Time range: ',
       activeUsers: '• Active users: ',
       chatRecords: '*Chat Records*',
       instruction: 'Generate structured summary identifying main topics, key discussions, and group interaction patterns.',
       messageUnit: ' messages',
       userUnit: ' users',
       timeTo: ' to '
            },
     'ja': {
       title: '以下のTelegramグループチャットを要約してください：',
       statsTitle: '*グループ統計*',
       analyzedMessages: '• 分析メッセージ数：',
       participantUsers: '• 参加ユーザー数：',
       timeRange: '• 時間範囲：',
       activeUsers: '• アクティブユーザー：',
       chatRecords: '*チャット記録*',
       instruction: '主要なトピック、重要な議論点、グループ交流パターンを特定した構造化要約を生成してください。',
       messageUnit: ' 件',
       userUnit: ' 人',
       timeTo: ' から '
     }
  };

  const prompt = prompts[detectedLanguage] || prompts['en'];

       return `${prompt.title}

${prompt.statsTitle}
${prompt.analyzedMessages}${messageCount}${prompt.messageUnit}
${prompt.participantUsers}${stats.unique_users}${prompt.userUnit}
${prompt.timeRange}${formatTimestamp(stats.earliest_message)}${prompt.timeTo}${formatTimestamp(stats.latest_message)}
${prompt.activeUsers}${userInfo}

${prompt.chatRecords}
${messagesText}

${prompt.instruction}`;
}

/**
 * 构建结构化输出格式定义
 * @param {string} detectedLanguage - 检测到的语言
 */
function buildResponseFormat(detectedLanguage = 'zh') {
  const descriptions = {
    'zh': {
      formatted_summary: '完整的格式化摘要，使用正确的Telegram Markdown格式',
      main_topics: '主要话题列表',
      discussion_points: '重要讨论点列表',
      activity_analysis: '群组活跃度分析',
      special_events: '特殊事件或决定',
      other_notes: '其他备注'
    },
    'en': {
      formatted_summary: 'Complete formatted summary using correct Telegram Markdown format',
      main_topics: 'List of main topics',
      discussion_points: 'List of important discussion points',
      activity_analysis: 'Group activity analysis',
      special_events: 'Special events or decisions',
      other_notes: 'Other notes'
    }
  };

  const desc = descriptions[detectedLanguage] || descriptions['en'];

  return {
    type: "json_schema",
    json_schema: {
      name: "telegram_summary",
      strict: true,
      schema: {
        type: "object",
        properties: {
          formatted_summary: {
            type: "string",
            description: desc.formatted_summary
          },
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
        required: ["formatted_summary", "main_topics", "discussion_points", "activity_analysis", "special_events", "other_notes"],
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