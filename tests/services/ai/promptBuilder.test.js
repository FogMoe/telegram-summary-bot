const {
  buildSystemPrompt,
  buildUserPrompt,
  buildResponseFormat
} = require('../../../src/services/ai/promptBuilder');

describe('buildSystemPrompt', () => {
  it('包含检测语言的英文名称', () => {
    expect(buildSystemPrompt('zh')).toContain('Respond in Simplified Chinese.');
    expect(buildSystemPrompt('fr')).toContain('Respond in French.');
  });

  it('未知语言代码直接使用该代码本身', () => {
    expect(buildSystemPrompt('xx')).toContain('Respond in xx.');
  });

  it('声明 JSON 输出与必需字段', () => {
    const prompt = buildSystemPrompt('zh');
    expect(prompt).toContain('Output valid JSON only');
    expect(prompt).toContain('main_topics, discussion_points, activity_analysis, special_events, other_notes');
  });
});

describe('buildUserPrompt', () => {
  it('包含统计信息、用户信息与聊天记录', () => {
    const stats = { unique_users: 8, earliest_message: 1700000000, latest_message: 1700086400 };
    const prompt = buildUserPrompt('A: hi\nB: hello', stats, 'alice, bob', 100, 'zh');
    expect(prompt).toContain('Respond in Simplified Chinese.');
    expect(prompt).toContain('- Messages analyzed: 100');
    expect(prompt).toContain('- Users: 8');
    expect(prompt).toContain('- Active users: alice, bob');
    expect(prompt).toContain('A: hi\nB: hello');
  });
});

describe('buildResponseFormat', () => {
  it('返回严格 json_schema 定义', () => {
    const fmt = buildResponseFormat('zh');
    expect(fmt.type).toBe('json_schema');
    expect(fmt.json_schema.name).toBe('telegram_summary');
    expect(fmt.json_schema.strict).toBe(true);
    expect(fmt.json_schema.schema.additionalProperties).toBe(false);
    expect(fmt.json_schema.schema.required).toEqual([
      'main_topics',
      'discussion_points',
      'activity_analysis',
      'special_events',
      'other_notes'
    ]);
  });

  it('数组字段与字符串字段类型正确', () => {
    const props = buildResponseFormat('en').json_schema.schema.properties;
    expect(props.main_topics.type).toBe('array');
    expect(props.discussion_points.type).toBe('array');
    expect(props.activity_analysis.type).toBe('string');
    expect(props.special_events.type).toBe('string');
    expect(props.other_notes.type).toBe('string');
  });
});
