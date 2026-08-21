const {
  formatSummaryResponse,
  formatPlainTextResponse
} = require('../../src/utils/summaryFormatter');

const baseResult = {
  summary: '这是总结内容',
  metadata: {
    messagesAnalyzed: 100,
    uniqueUsers: 5,
    timeRange: { earliest: 1700000000, latest: 1700086400 },
    topUsers: [
      { user_id: 1, first_name: 'A*lice' },
      { user_id: 2, username: 'bob' },
      { user_id: 3, first_name: 'C', username: 'carl' },
      { user_id: 4, first_name: 'D' }
    ]
  }
};

describe('formatSummaryResponse', () => {
  it('包含标题、统计块与冷却提示', () => {
    const out = formatSummaryResponse(baseResult);
    expect(out.startsWith('📋 *群组聊天总结*\n\n这是总结内容\n\n')).toBe(true);
    expect(out).toContain('📊 *分析统计*');
    expect(out).toContain('• 分析消息：100 条');
    expect(out).toContain('• 参与用户：5 人');
    expect(out).toContain('• 时间范围：');
    expect(out).toContain('⏰ 下次总结请等待5分钟冷却期');
  });

  it('统计块与正文之间以 \\n\\n📊 分隔（分段发送协议依赖此标记）', () => {
    const out = formatSummaryResponse(baseResult);
    expect(out).toContain('\n\n📊');
  });

  it('活跃用户只取前三位且名字被转义', () => {
    const out = formatSummaryResponse(baseResult);
    expect(out).toContain('• 活跃用户：A\\*lice, bob, C');
  });

  it('topUsers 为空时不输出活跃用户行', () => {
    const out = formatSummaryResponse({ summary: 's', metadata: { messagesAnalyzed: 1, uniqueUsers: 1 } });
    expect(out).not.toContain('活跃用户');
  });

  it('缺失字段以 — 占位', () => {
    const out = formatSummaryResponse({ summary: 's', metadata: {} });
    expect(out).toContain('• 分析消息：— 条');
    expect(out).toContain('• 参与用户：— 人');
  });

  it('fromCache 为 true 时追加缓存徽标', () => {
    const out = formatSummaryResponse(baseResult, { fromCache: true });
    expect(out).toContain('💾 *此结果来自缓存*');
  });

  it('默认无缓存徽标', () => {
    const out = formatSummaryResponse(baseResult);
    expect(out).not.toContain('此结果来自缓存');
  });

  it('escape 选项通过 smartEscapeMarkdown 转义正文', () => {
    const out = formatSummaryResponse(
      { summary: 'plain _text_', metadata: {} },
      { escape: true }
    );
    expect(out).toContain('plain \\_text\\_');
  });
});

describe('formatPlainTextResponse', () => {
  it('去除所有 Markdown 标记', () => {
    const out = formatPlainTextResponse({
      summary: '*bold* _it_',
      metadata: { messagesAnalyzed: 10, uniqueUsers: 2 }
    });
    expect(out).toContain('📋 群组聊天总结');
    expect(out).toContain('bold it');
    expect(out).toContain('📊 分析统计');
    expect(out).toContain('• 分析消息：10 条');
    expect(out).not.toContain('*');
  });

  it('fromCache 徽标不带星号', () => {
    const out = formatPlainTextResponse(baseResult, { fromCache: true });
    expect(out).toContain('💾 此结果来自缓存');
  });

  it('活跃用户名字不转义', () => {
    const out = formatPlainTextResponse(baseResult);
    expect(out).toContain('• 活跃用户：A*lice, bob, C');
  });
});
