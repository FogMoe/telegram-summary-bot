/**
 * Azure OpenAI 服务模块
 * 提供消息总结和分析功能
 */

const { AzureOpenAI } = require('openai');
const logger = require('../utils/logger');
const textUtils = require('../utils/text');

class AzureOpenAIService {
  constructor() {
    this.client = null;
    this.isInitialized = false;
  }

  /**
   * 初始化 Azure OpenAI 客户端
   */
  async init() {
    try {
      // 验证必要的环境变量
      const requiredEnvVars = [
        'AZURE_OPENAI_API_KEY',
        'AZURE_OPENAI_ENDPOINT',
        'AZURE_OPENAI_DEPLOYMENT_NAME'
      ];

      for (const envVar of requiredEnvVars) {
        if (!process.env[envVar]) {
          throw new Error(`缺少必要的环境变量: ${envVar}`);
        }
      }

      this.client = new AzureOpenAI({
        apiKey: process.env.AZURE_OPENAI_API_KEY,
        endpoint: process.env.AZURE_OPENAI_ENDPOINT,
        apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2024-10-01-preview',
        deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME
      });

      this.isInitialized = true;
      logger.success('Azure OpenAI 服务初始化成功');
      
    } catch (error) {
      logger.error('Azure OpenAI 服务初始化失败', error);
      throw error;
    }
  }

  /**
   * 确保服务已初始化
   */
  ensureInitialized() {
    if (!this.isInitialized) {
      throw new Error('Azure OpenAI 服务未初始化，请先调用 init() 方法');
    }
  }

  /**
   * 检测群组消息的主要语言
   * @param {Array} messages - 消息列表
   * @returns {string} 检测到的语言代码
   */
  detectLanguage(messages) {
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

  /**
   * 总结群组消息
   * @param {Array} messages - 消息列表
   * @param {Object} stats - 群组统计信息
   * @param {Array} topUsers - 活跃用户列表
   * @returns {Object} 总结结果
   */
  async summarizeMessages(messages, stats, topUsers) {
    this.ensureInitialized();

    try {
      logger.info('开始生成消息总结', {
        messagesCount: messages.length,
        topUsersType: typeof topUsers,
        topUsersIsArray: Array.isArray(topUsers),
        topUsersLength: Array.isArray(topUsers) ? topUsers.length : 'N/A'
      });
      
      // 检测群组主要语言
      const detectedLanguage = this.detectLanguage(messages);

      // 准备消息文本
      const messageTexts = messages.map(msg => {
        const userName = msg.first_name || msg.username || `用户${msg.user_id}`;
        return `${userName}: ${msg.text}`;
      });

      const fullText = messageTexts.join('\n');
      
      // 检查消息记录是否过长（超过 50k 字符）
      if (fullText.length > 50000) {
        logger.warn('消息记录超过长度限制', {
          textLength: fullText.length,
          maxLength: 50000,
          messagesCount: messages.length
        });
        
        const error = new Error('消息记录过长，请减少消息数量');
        error.name = 'MessageTooLongError';
        error.textLength = fullText.length;
        error.maxLength = 50000;
        throw error;
      }
      
      // 如果消息太长，进行截断
      const maxTokens = 15000; // 保留足够的空间用于系统提示和回复
      const truncatedText = this.truncateToTokenLimit(fullText, maxTokens);

      // 准备用户信息（确保 topUsers 是数组）
      const validTopUsers = Array.isArray(topUsers) ? topUsers : [];
      const userInfo = validTopUsers.map(user => {
        const name = user.first_name || user.username || `用户${user.user_id}`;
        return `${name} (${user.message_count}条消息)`;
      }).join(', ');

      // 构建提示词（使用检测到的语言）
      const systemPrompt = this.buildSystemPrompt(detectedLanguage);
      const userPrompt = this.buildUserPrompt(truncatedText, stats, userInfo, messages.length, detectedLanguage);

      // 调用 Azure OpenAI
      const response = await this.client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 1500,
        temperature: 0.7,
        top_p: 0.9
      });

      const summary = response.choices[0]?.message?.content;
      
      if (!summary) {
        throw new Error('未获得有效的总结结果');
      }

      logger.info('消息总结生成成功', {
        messagesCount: messages.length,
        tokensUsed: response.usage?.total_tokens
      });

      return {
        summary,
        metadata: {
          messagesAnalyzed: messages.length,
          uniqueUsers: stats.unique_users,
          timeRange: {
            earliest: stats.earliest_message,
            latest: stats.latest_message
          },
          topUsers: validTopUsers.slice(0, 5),
          tokensUsed: response.usage?.total_tokens || 0
        }
      };

    } catch (error) {
      logger.error('消息总结生成失败', error);
      throw error;
    }
  }

  /**
   * 构建系统提示词
   * @param {string} detectedLanguage - 检测到的群组主要语言
   */
  buildSystemPrompt(detectedLanguage = 'zh') {
    const languageInstructions = {
      'zh': '使用简体中文回复',
      'zh-tw': '使用繁體中文回复',
      'en': 'Reply in English',
      'ja': '日本語で返答してください',
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

    return `你是一个专业的群组聊天记录分析助手。你的任务是分析 Telegram 群组的聊天记录并生成简洁、有用的总结。

请遵循以下原则：
1. 提供客观、准确的总结，避免主观判断
2. 识别主要话题和讨论重点
3. 注意群组成员的互动模式
4. 保护用户隐私，不要透露敏感个人信息
5. ${languageInstruction}
6. 总结应该简洁明了，突出重点
7. 根据群组聊天的主要语言来回复，保持语言一致性

格式要求：
- 使用标准 Markdown 格式
- 使用 **文本** 表示粗体
- 使用 *文本* 表示斜体
- 使用 \`代码\` 表示等宽字体
- 使用 [链接文本](URL) 表示链接
- 可以使用 > 引用重要观点
- 不要使用带有 # 的标题（如 # ## ### ####）
- 适当使用表情符号来增加可读性
- 适当使用换行和空行来组织内容结构

总结应包含以下部分：
**主要话题概述**
对群组讨论的核心主题进行概括

**重要讨论点**  
列出关键的讨论内容和观点

**群组活跃度分析**
分析成员参与度和互动模式

**特殊事件或决定**
如有重要事件或达成的决定，请特别说明`;
  }

  /**
   * 构建用户提示词
   * @param {string} messagesText - 消息文本
   * @param {Object} stats - 统计信息
   * @param {string} userInfo - 用户信息
   * @param {number} messageCount - 消息数量
   * @param {string} detectedLanguage - 检测到的语言
   */
  buildUserPrompt(messagesText, stats, userInfo, messageCount, detectedLanguage = 'zh') {
    // 根据检测到的语言调整提示词
         const prompts = {
       'zh': {
         title: '请总结以下 Telegram 群组的聊天记录：',
         statsTitle: '**群组统计信息**',
         analyzedMessages: '• 分析消息数：',
         participantUsers: '• 参与用户数：',
         timeRange: '• 时间范围：',
         activeUsers: '• 活跃用户：',
         chatRecords: '**聊天记录**',
         summaryRequest: '**请提供总结**',
         instruction: '请基于以上聊天记录，生成一个简洁而全面的总结，使用加粗标记各部分标题，包括主要话题、重要讨论点和群组互动情况。',
         messageUnit: ' 条',
         userUnit: ' 人',
         timeTo: ' 至 '
       },
             'zh-tw': {
         title: '請總結以下 Telegram 群組的聊天記錄：',
         statsTitle: '**群組統計資訊**',
         analyzedMessages: '• 分析訊息數：',
         participantUsers: '• 參與用戶數：',
         timeRange: '• 時間範圍：',
         activeUsers: '• 活躍用戶：',
         chatRecords: '**聊天記錄**',
         summaryRequest: '**請提供總結**',
         instruction: '請基於以上聊天記錄，生成一個簡潔而全面的總結，使用加粗標記各部分標題，包括主要話題、重要討論點和群組互動情況。',
         messageUnit: ' 條',
         userUnit: ' 人',
         timeTo: ' 至 '
       },
       'en': {
         title: 'Please summarize the following Telegram group chat records:',
         statsTitle: '**Group Statistics**',
         analyzedMessages: '• Messages analyzed: ',
         participantUsers: '• Participating users: ',
         timeRange: '• Time range: ',
         activeUsers: '• Active users: ',
         chatRecords: '**Chat Records**',
         summaryRequest: '**Please provide a summary**',
         instruction: 'Based on the above chat records, generate a concise and comprehensive summary using bold formatting for section titles, including main topics, important discussion points, and group interaction patterns.',
         messageUnit: ' messages',
         userUnit: ' users',
         timeTo: ' to '
       },
             'ja': {
         title: '以下のTelegramグループチャット記録を要約してください：',
         statsTitle: '**グループ統計情報**',
         analyzedMessages: '• 分析メッセージ数：',
         participantUsers: '• 参加ユーザー数：',
         timeRange: '• 時間範囲：',
         activeUsers: '• アクティブユーザー：',
         chatRecords: '**チャット記録**',
         summaryRequest: '**要約をお願いします**',
         instruction: '上記のチャット記録に基づいて、太字でセクションタイトルをマークして、主要なトピック、重要な議論点、グループの相互作用パターンを含む簡潔で包括的な要約を生成してください。',
         messageUnit: ' 件',
         userUnit: ' 人',
         timeTo: ' から '
       },
       'ko': {
         title: '다음 텔레그램 그룹 채팅 기록을 요약해 주세요:',
         statsTitle: '**그룹 통계 정보**',
         analyzedMessages: '• 분석된 메시지 수: ',
         participantUsers: '• 참여 사용자 수: ',
         timeRange: '• 시간 범위: ',
         activeUsers: '• 활성 사용자: ',
         chatRecords: '**채팅 기록**',
         summaryRequest: '**요약을 제공해 주세요**',
         instruction: '위 채팅 기록을 바탕으로 굵은 글씨로 섹션 제목을 표시하여 주요 주제, 중요한 토론 포인트, 그룹 상호작용 패턴을 포함한 간결하고 포괄적인 요약을 생성해 주세요.',
         messageUnit: ' 개',
         userUnit: ' 명',
         timeTo: ' 부터 '
       },
             'es': {
         title: 'Por favor resume los siguientes registros de chat del grupo de Telegram:',
         statsTitle: '**Estadísticas del Grupo**',
         analyzedMessages: '• Mensajes analizados: ',
         participantUsers: '• Usuarios participantes: ',
         timeRange: '• Rango de tiempo: ',
         activeUsers: '• Usuarios activos: ',
         chatRecords: '**Registros de Chat**',
         summaryRequest: '**Por favor proporciona un resumen**',
         instruction: 'Basado en los registros de chat anteriores, genera un resumen conciso y completo usando formato en negrita para los títulos de sección, que incluya temas principales, puntos de discusión importantes y patrones de interacción del grupo.',
         messageUnit: ' mensajes',
         userUnit: ' usuarios',
         timeTo: ' a '
       },
       'fr': {
         title: 'Veuillez résumer les enregistrements de chat de groupe Telegram suivants:',
         statsTitle: '**Statistiques du Groupe**',
         analyzedMessages: '• Messages analysés: ',
         participantUsers: '• Utilisateurs participants: ',
         timeRange: '• Plage de temps: ',
         activeUsers: '• Utilisateurs actifs: ',
         chatRecords: '**Enregistrements de Chat**',
         summaryRequest: '**Veuillez fournir un résumé**',
         instruction: 'Basé sur les enregistrements de chat ci-dessus, générez un résumé concis et complet en utilisant le format gras pour les titres de section, incluant les sujets principaux, les points de discussion importants et les modèles d\'interaction du groupe.',
         messageUnit: ' messages',
         userUnit: ' utilisateurs',
         timeTo: ' à '
       },
       'de': {
         title: 'Bitte fassen Sie die folgenden Telegram-Gruppenchat-Aufzeichnungen zusammen:',
         statsTitle: '**Gruppenstatistiken**',
         analyzedMessages: '• Analysierte Nachrichten: ',
         participantUsers: '• Teilnehmende Benutzer: ',
         timeRange: '• Zeitraum: ',
         activeUsers: '• Aktive Benutzer: ',
         chatRecords: '**Chat-Aufzeichnungen**',
         summaryRequest: '**Bitte geben Sie eine Zusammenfassung**',
         instruction: 'Basierend auf den obigen Chat-Aufzeichnungen, erstellen Sie eine prägnante und umfassende Zusammenfassung mit fett formatierter Abschnittstitel, mit Hauptthemen, wichtigen Diskussionspunkten und Gruppeninteraktionsmustern.',
         messageUnit: ' Nachrichten',
         userUnit: ' Benutzer',
         timeTo: ' bis '
       },
       'ru': {
         title: 'Пожалуйста, подведите итоги следующих записей группового чата Telegram:',
         statsTitle: '**Статистика Группы**',
         analyzedMessages: '• Проанализированные сообщения: ',
         participantUsers: '• Участвующие пользователи: ',
         timeRange: '• Временной диапазон: ',
         activeUsers: '• Активные пользователи: ',
         chatRecords: '**Записи Чата**',
         summaryRequest: '**Пожалуйста, предоставьте резюме**',
         instruction: 'Основываясь на приведенных выше записях чата, создайте краткое и всестороннее резюме, используя жирный шрифт для заголовков разделов, включающее основные темы, важные моменты обсуждения и модели взаимодействия группы.',
         messageUnit: ' сообщений',
         userUnit: ' пользователей',
         timeTo: ' до '
       }
    };

    const prompt = prompts[detectedLanguage] || prompts['en'];

         return `${prompt.title}

${prompt.statsTitle}
${prompt.analyzedMessages}${messageCount}${prompt.messageUnit}
${prompt.participantUsers}${stats.unique_users}${prompt.userUnit}
${prompt.timeRange}${this.formatTimestamp(stats.earliest_message)}${prompt.timeTo}${this.formatTimestamp(stats.latest_message)}
${prompt.activeUsers}${userInfo}

${prompt.chatRecords}
${messagesText}

${prompt.summaryRequest}
${prompt.instruction}`;
  }

  /**
   * 将文本截断到指定的 token 限制
   */
  truncateToTokenLimit(text, maxTokens) {
    // 简单的 token 估算：约 4 个字符 = 1 个 token
    const estimatedTokens = text.length / 4;
    
    if (estimatedTokens <= maxTokens) {
      return text;
    }

    // 计算需要保留的字符数
    const maxChars = maxTokens * 4;
    
    // 从末尾开始截断，保留最新的消息
    const truncated = text.slice(-maxChars);
    
    // 找到第一个完整的消息行
    const firstNewline = truncated.indexOf('\n');
    if (firstNewline > 0) {
      return truncated.slice(firstNewline + 1);
    }
    
    return truncated;
  }

  /**
   * 格式化时间戳
   */
  formatTimestamp(timestamp) {
    return new Date(timestamp * 1000).toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  /**
   * 测试连接
   */
  async testConnection() {
    this.ensureInitialized();
    
    try {
      const response = await this.client.chat.completions.create({
        model: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
        messages: [
          { role: 'user', content: '请回复"连接测试成功"' }
        ],
        max_tokens: 50
      });

      const content = response.choices[0]?.message?.content;
      logger.success('Azure OpenAI 连接测试成功', { response: content });
      return true;
      
    } catch (error) {
      logger.error('Azure OpenAI 连接测试失败', error);
      return false;
    }
  }

  /**
   * 获取服务状态
   */
  getStatus() {
    return {
      initialized: this.isInitialized,
      endpoint: process.env.AZURE_OPENAI_ENDPOINT,
      deployment: process.env.AZURE_OPENAI_DEPLOYMENT_NAME,
      apiVersion: process.env.AZURE_OPENAI_API_VERSION || '2025-01-01-preview'
    };
  }
}

module.exports = new AzureOpenAIService(); 