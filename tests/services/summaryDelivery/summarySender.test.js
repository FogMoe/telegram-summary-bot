const {
  sendWithMarkdownFallback,
  sendSegmentedSummary
} = require('../../../src/services/summaryDelivery/summarySender');

const summaryResult = {
  summary: '这是总结正文',
  metadata: { messagesAnalyzed: 10, uniqueUsers: 3 }
};

function makeParseError() {
  const error = new Error("Bad Request: can't parse entities: ...");
  error.response = {
    error_code: 400,
    description: "Bad Request: can't parse entities: character '*' is not allowed at byte offset 5"
  };
  return error;
}

function makeNetworkError() {
  const error = new Error('connect ETIMEDOUT 1.2.3.4:443');
  error.code = 'ETIMEDOUT';
  return error;
}

describe('sendWithMarkdownFallback 降级链', () => {
  it('原生 Markdown 成功时只发送一次', async () => {
    const sends = [];
    const level = await sendWithMarkdownFallback({
      summaryResult,
      send: async (text, options) => sends.push({ text, options })
    });

    expect(level).toBe('raw');
    expect(sends).toHaveLength(1);
    expect(sends[0].options.parse_mode).toBe('Markdown');
    expect(sends[0].text).toContain('📋 *群组聊天总结*');
    expect(sends[0].text).toContain('这是总结正文');
  });

  it('逐级降级：原生→转义→安全处理器→纯文本', async () => {
    const sends = [];
    let attempt = 0;

    const level = await sendWithMarkdownFallback({
      summaryResult,
      send: async (text, options) => {
        attempt++;
        if (options.parse_mode) {
          throw makeParseError();
        }
        sends.push({ text, options });
      }
    });

    expect(level).toBe('plain');
    expect(attempt).toBe(4);
    expect(sends).toHaveLength(1);
    expect(sends[0].options.parse_mode).toBeUndefined();
    expect(sends[0].text).toContain('📋 群组聊天总结');
    expect(sends[0].text).not.toContain('*');
  });

  it('转义级成功即在第二级停止', async () => {
    let attempt = 0;
    const level = await sendWithMarkdownFallback({
      summaryResult,
      send: async (text, options) => {
        attempt++;
        if (attempt === 1) {
          throw makeParseError();
        }
      }
    });
    expect(level).toBe('escaped');
    expect(attempt).toBe(2);
  });

  it('安全处理器级成功即在第三级停止', async () => {
    let attempt = 0;
    const level = await sendWithMarkdownFallback({
      summaryResult,
      send: async (text, options) => {
        attempt++;
        if (attempt <= 2) {
          throw makeParseError();
        }
      }
    });
    expect(level).toBe('safe');
    expect(attempt).toBe(3);
  });

  it('非解析错误直接上抛', async () => {
    let attempt = 0;
    await expect(sendWithMarkdownFallback({
      summaryResult,
      send: async () => {
        attempt++;
        throw new Error('message is not modified');
      }
    })).rejects.toThrow('message is not modified');
    expect(attempt).toBe(1);
  });

  it('rethrowNetworkErrors=true 时网络错误上抛（触发外层网络分支）', async () => {
    let attempt = 0;
    await expect(sendWithMarkdownFallback({
      summaryResult,
      rethrowNetworkErrors: true,
      send: async () => {
        attempt++;
        throw makeNetworkError();
      }
    })).rejects.toThrow('ETIMEDOUT');
    expect(attempt).toBe(1);
  });

  it('rethrowNetworkErrors=false 时：第一级非解析错误（含网络错误）仍上抛（ctx 路径语义）', async () => {
    let attempt = 0;
    await expect(sendWithMarkdownFallback({
      summaryResult,
      rethrowNetworkErrors: false,
      send: async () => {
        attempt++;
        throw makeNetworkError();
      }
    })).rejects.toThrow('ETIMEDOUT');
    expect(attempt).toBe(1);
  });

  it('rethrowNetworkErrors=false 时：第二级网络错误降级为纯文本（ctx 路径语义）', async () => {
    const sends = [];
    let attempt = 0;

    await sendWithMarkdownFallback({
      summaryResult,
      rethrowNetworkErrors: false,
      send: async (text, options) => {
        attempt++;
        if (attempt === 1) {
          throw makeParseError();
        }
        if (options.parse_mode) {
          throw makeNetworkError();
        }
        sends.push({ text, options });
      }
    });

    expect(attempt).toBe(3);
    expect(sends[0].options.parse_mode).toBeUndefined();
  });

  it('fromCache 透传给格式化器（显示缓存徽标）', async () => {
    const sends = [];
    await sendWithMarkdownFallback({
      summaryResult,
      fromCache: true,
      send: async (text) => sends.push({ text })
    });
    expect(sends[0].text).toContain('💾 *此结果来自缓存*');
  });
});

describe('sendSegmentedSummary 分段发送', () => {
  function makeBot() {
    return {
      telegram: {
        editMessageText: jest.fn().mockResolvedValue({}),
        sendMessage: jest.fn().mockResolvedValue({})
      }
    };
  }

  function makeLongResponse(summaryLength) {
    const paragraphs = [];
    for (let i = 0; i < 30; i++) {
      paragraphs.push(`段落${i} ${'内容'.repeat(80)}`);
    }
    const summary = paragraphs.join('\n\n').slice(0, summaryLength);
    return require('../../../src/utils/summaryFormatter').formatSummaryResponse({
      summary,
      metadata: { messagesAnalyzed: 500, uniqueUsers: 20 }
    });
  }

  it('超长内容分段：首段编辑原消息并带 (1/N) 后缀，统计块最后单独发送', async () => {
    const bot = makeBot();
    const fullResponse = makeLongResponse(5000);
    expect(fullResponse.length).toBeGreaterThan(3500);

    await sendSegmentedSummary(bot, -100, 555, fullResponse, 'task_1');

    const edits = bot.telegram.editMessageText.mock.calls;
    expect(edits).toHaveLength(1);
    expect(edits[0][0]).toBe(-100);
    expect(edits[0][1]).toBe(555);
    expect(edits[0][3]).toContain('(1/');
    expect(edits[0][4].parse_mode).toBe('Markdown');

    const sends = bot.telegram.sendMessage.mock.calls;
    expect(sends.length).toBeGreaterThanOrEqual(2);
    const lastText = sends[sends.length - 1][1];
    expect(lastText.startsWith('\n\n📊')).toBe(true);
    expect(lastText).toContain('分析统计');
  });

  it('分段发送失败时回退为 3400 字符截断消息', async () => {
    const bot = makeBot();
    bot.telegram.editMessageText.mockRejectedValueOnce(new Error('edit failed'));
    bot.telegram.sendMessage.mockRejectedValue(new Error('send failed'));

    const fullResponse = makeLongResponse(5000);

    await sendSegmentedSummary(bot, -100, 555, fullResponse, 'task_1');

    const edits = bot.telegram.editMessageText.mock.calls;
    expect(edits).toHaveLength(2);
    const fallbackText = edits[1][3];
    expect(fallbackText.endsWith('...(内容过长，发送时遇到问题)')).toBe(true);
    expect(fallbackText.length).toBeLessThanOrEqual(3500);
  });
});
