const {
  truncateToTokenLimit,
  makeSafeUserName
} = require('../../../src/services/ai/utils');

describe('truncateToTokenLimit', () => {
  it('未超限文本原样返回', () => {
    expect(truncateToTokenLimit('short', 100)).toBe('short');
  });

  it('超限文本从尾部保留（保留最新消息）并从完整行开始', () => {
    const long = Array.from({ length: 300 }, (_, i) => `line${i}`).join('\n');
    const out = truncateToTokenLimit(long, 100);
    expect(out.length).toBe(175);
    expect(out.startsWith('line278')).toBe(true);
    expect(out.endsWith('line299')).toBe(true);
    expect(out).not.toContain('line0\n');
  });

  it('截断窗口内没有换行时直接返回截断片段', () => {
    const solid = 'x'.repeat(400);
    const out = truncateToTokenLimit(solid, 100);
    expect(out).toBe('x'.repeat(180));
  });
});

describe('makeSafeUserName', () => {
  it('替换与 Markdown 冲突的字符', () => {
    expect(makeSafeUserName('a_b*c`d[e]f')).toBe("a-b·c'd(e)f");
  });

  it('空值原样返回', () => {
    expect(makeSafeUserName(null)).toBeNull();
    expect(makeSafeUserName(undefined)).toBeUndefined();
  });
});
