const {
  escapeMarkdown,
  stripMarkdown,
  safeMarkdownProcess,
  preProcessMarkdown,
  smartEscapeMarkdown
} = require('../../src/utils/markdown');

describe('escapeMarkdown', () => {
  it('转义 Telegram Markdown V1 的特殊字符', () => {
    expect(escapeMarkdown('a*b_c`d[e')).toBe('a\\*b\\_c\\`d\\[e');
  });

  it('反斜杠最先转义（成对）', () => {
    expect(escapeMarkdown('a\\b')).toBe('a\\\\b');
  });

  it('右方括号和圆括号不转义', () => {
    expect(escapeMarkdown('a[b]c(d)')).toBe('a\\[b]c(d)');
  });

  it('空字符串与非字符串输入原样返回', () => {
    expect(escapeMarkdown('')).toBe('');
    expect(escapeMarkdown(null)).toBe(null);
    expect(escapeMarkdown(undefined)).toBe(undefined);
  });
});

describe('stripMarkdown', () => {
  it('移除星号、下划线、反引号', () => {
    expect(stripMarkdown('*bold* _it_ `code`')).toBe('bold it code');
  });

  it('链接只保留文字部分', () => {
    expect(stripMarkdown('[link](http://x)')).toBe('link');
  });

  it('移除三级与四级标题标记', () => {
    expect(stripMarkdown('### Head')).toBe('Head');
    expect(stripMarkdown('#### Deep')).toBe('Deep');
  });

  it('移除引用标记', () => {
    expect(stripMarkdown('> quote')).toBe(' quote');
  });

  it('非字符串输入原样返回', () => {
    expect(stripMarkdown(null)).toBe(null);
  });
});

describe('safeMarkdownProcess', () => {
  it('纯文本保持不变', () => {
    expect(safeMarkdownProcess('plain text')).toBe('plain text');
  });

  it('成对的星号被转义（最终输出全部转义）', () => {
    expect(safeMarkdownProcess('hello *bold* world')).toBe('hello \\*bold\\* world');
  });

  it('已转义的星号收敛为同样的转义输出', () => {
    expect(safeMarkdownProcess('already \\* escaped')).toBe('already \\* escaped');
  });

  it('转义孤立的方括号', () => {
    expect(safeMarkdownProcess('a[b]c')).toBe('a\\[b]c');
  });

  it('空与非字符串输入返回空字符串或原值', () => {
    expect(safeMarkdownProcess('')).toBe('');
    expect(safeMarkdownProcess(null)).toBe('');
    expect(safeMarkdownProcess(undefined)).toBe('');
  });
});

describe('preProcessMarkdown', () => {
  it('转义单词内部的下划线', () => {
    expect(preProcessMarkdown('snake_case_word')).toBe('snake\\_case\\_word');
  });

  it('转义未配对的星号', () => {
    expect(preProcessMarkdown('hello * world')).toBe('hello \\* world');
  });

  it('转义未配对的下划线', () => {
    expect(preProcessMarkdown('a _ b')).toBe('a \\_ b');
  });

  it('成对实体保持不变', () => {
    expect(preProcessMarkdown('ok *a* _b_ `c`')).toBe('ok *a* _b_ `c`');
  });

  it('列表星号不被视为未配对', () => {
    expect(preProcessMarkdown('* item bullet')).toBe('* item bullet');
  });

  it('嵌套格式 *`code`* 解包为 `code`', () => {
    expect(preProcessMarkdown('*`code`*')).toBe('`code`');
  });

  it('修复未闭合的链接括号', () => {
    expect(preProcessMarkdown('[broken link')).toBe('[broken link]');
  });

  it('非字符串输入原样返回', () => {
    expect(preProcessMarkdown(null)).toBe(null);
  });
});

describe('smartEscapeMarkdown', () => {
  it('普通文本中的下划线被转义', () => {
    expect(smartEscapeMarkdown('plain _text_')).toBe('plain \\_text\\_');
  });

  it('非 *标题* 文本中方括号被转义', () => {
    expect(smartEscapeMarkdown('[x] y')).toBe('\\[x] y');
  });

  it('*标题* 区块完整保留且标题内的下划线被转义', () => {
    expect(smartEscapeMarkdown('*标题* 内 _italic_')).toBe('*标题* 内 \\_italic\\_');
    expect(smartEscapeMarkdown('*a* mid *b_name*')).toBe('*a* mid *b\\_name*');
  });

  it('标题外的反引号与方括号仍被转义', () => {
    expect(smartEscapeMarkdown('*t* `c` [l]')).toBe('*t* \\`c\\` \\[l]');
  });
});
