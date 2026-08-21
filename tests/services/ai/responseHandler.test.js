const {
  cleanJsonContent,
  repairTruncatedJson,
  extractSummaryFromFailedJson,
  formatStructuredSummary
} = require('../../../src/services/ai/responseHandler');

describe('cleanJsonContent', () => {
  it('剥离 ```json 代码围栏', () => {
    expect(cleanJsonContent('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('提取文本中包裹的 JSON 对象', () => {
    expect(cleanJsonContent('prefix {"a": 1,} suffix')).toBe('{"a": 1}');
  });

  it('移除数组尾随逗号', () => {
    expect(cleanJsonContent('{"a": [1, 2,]}')).toBe('{"a": [1, 2]}');
  });

  it('压缩换行与多余空白', () => {
    expect(cleanJsonContent('{\n  "a" :  "x"\n}')).toBe('{ "a": "x" }');
  });

  it('截断 JSON（无结束大括号）时触发智能修复，产物为合法 JSON 并补齐默认字段', () => {
    const out = cleanJsonContent('{"main_topics": ["t"');
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out).main_topics).toEqual(['t']);
    expect(JSON.parse(out).other_notes).toBe('请重新尝试获取完整总结');
  });

  it('非字符串输入原样返回', () => {
    expect(cleanJsonContent(null)).toBeNull();
  });
});

describe('repairTruncatedJson', () => {
  it('数组值截断时重建完整数组，产物为合法 JSON', () => {
    const out = repairTruncatedJson('{"main_topics": ["a", "b"');
    expect(() => JSON.parse(out)).not.toThrow();
    const parsed = JSON.parse(out);
    expect(parsed.main_topics).toEqual(['a', 'b']);
    expect(parsed.discussion_points).toEqual(['内容不完整']);
    expect(parsed.activity_analysis).toBe('响应被截断，无法分析');
  });

  it('字符串中间截断时补结束引号', () => {
    const out = repairTruncatedJson('{"activity_analysis": "half done');
    expect(() => JSON.parse(out)).not.toThrow();
    expect(JSON.parse(out).activity_analysis).toBe('half done');
  });

  it('数组中的全部字符串项都被保留', () => {
    const out = repairTruncatedJson('{"discussion_points": ["点1", "点2", "点3"');
    expect(JSON.parse(out).discussion_points).toEqual(['点1', '点2', '点3']);
  });

  it('非 { 开头的输入原样返回', () => {
    expect(repairTruncatedJson('not json')).toBe('not json');
  });
});

describe('extractSummaryFromFailedJson', () => {
  it('从两个字段以上重构中文分节文本', () => {
    const out = extractSummaryFromFailedJson(
      '{"main_topics": ["t1", "t2"], "discussion_points": ["d1"]}'
    );
    expect(out).toBe('主要话题:\n- t1\n- t2\n\n讨论要点:\n- d1');
  });

  it('字符串字段直接放入对应分节', () => {
    const out = extractSummaryFromFailedJson(
      '{"activity_analysis": "very active", "other_notes": "note"}'
    );
    expect(out).toBe('活跃度分析:\nvery active\n\n其他备注:\nnote');
  });

  it('无法提取字段时回退为可见文本提取（需含话题关键词且超过 100 字符）', () => {
    const junk = 'x'.repeat(150) + ' 话题 ' + 'y'.repeat(50);
    const out = extractSummaryFromFailedJson(junk);
    expect(out.startsWith('文本提取内容：')).toBe(true);
    expect(out).toContain('话题');
  });

  it('无法提取任何内容时返回友好错误提示', () => {
    expect(extractSummaryFromFailedJson('short')).toBe(
      '总结解析失败，请稍后重试或尝试减少消息数量。'
    );
  });

  it('空输入返回友好错误提示', () => {
    expect(extractSummaryFromFailedJson('')).toBe('总结生成时遇到格式问题，请重试。');
    expect(extractSummaryFromFailedJson(null)).toBe('总结生成时遇到格式问题，请重试。');
  });
});

describe('formatStructuredSummary', () => {
  const full = {
    main_topics: ['a', 'b'],
    discussion_points: ['c'],
    activity_analysis: 'act',
    special_events: 'evt',
    other_notes: 'note'
  };

  it('zh 使用中文分节标题', () => {
    const out = formatStructuredSummary(full, 'zh');
    expect(out).toContain('*📌 主要话题概述*\n• a\n• b');
    expect(out).toContain('*💬 重要讨论点*\n• c');
    expect(out).toContain('*👥 群组活跃度分析*\nact');
    expect(out).toContain('*⭐ 特殊事件或决定*\nevt');
    expect(out).toContain('*🖊 其他备注*\nnote');
  });

  it('en 及未知语言使用英文分节标题', () => {
    const en = formatStructuredSummary(full, 'en');
    expect(en).toContain('*📌 Main Topics Overview*\n• a\n• b');
    expect(en).toContain('*👥 Group Activity Analysis*\nact');

    const fr = formatStructuredSummary(full, 'fr');
    expect(fr).toContain('*📌 Main Topics Overview*');
  });

  it('zh-tw 使用繁体分节标题', () => {
    const out = formatStructuredSummary(full, 'zh-tw');
    expect(out).toContain('*📌 主要話題概述*\n• a\n• b');
    expect(out).toContain('*💬 重要討論點*\n• c');
    expect(out).toContain('*👥 群組活躍度分析*\nact');
  });

  it('空数组和空字符串分节被省略', () => {
    const out = formatStructuredSummary(
      { main_topics: ['a'], activity_analysis: 'act' },
      'zh'
    );
    expect(out).toBe('*📌 主要话题概述*\n• a\n\n*👥 群组活跃度分析*\nact');
  });

  it('normalizeList 处理字符串、null 与非字符串项', () => {
    const out = formatStructuredSummary(
      { main_topics: 'single', discussion_points: [null, 'ok', 42, '  '] },
      'zh'
    );
    expect(out).toContain('*📌 主要话题概述*\n• single');
    expect(out).toContain('*💬 重要讨论点*\n• ok\n• 42');
  });
});
