const { detectLanguage } = require('../../../src/services/ai/languageDetector');

const detect = (text) => detectLanguage([{ text }]);

describe('detectLanguage', () => {
  it('简体中文文本检测为 zh', () => {
    expect(detect('你好世界你好')).toBe('zh');
  });

  it('繁体专用字符占优时检测为 zh-tw', () => {
    expect(detect('繁體中文測試繁體')).toBe('zh-tw');
    expect(detect('今天天氣很好，我們一起去吃飯')).toBe('zh-tw');
  });

  it('简体专用字符占优时检测为 zh', () => {
    expect(detect('今天天气很好，我们一起去吃饭')).toBe('zh');
  });

  it('英文文本通过 ASCII 占比加成检测为 en', () => {
    expect(detect('hello world this is a test')).toBe('en');
  });

  it('日文假名占优时检测为 ja', () => {
    expect(detect('こんにちはこんにちは今日は')).toBe('ja');
  });

  it('俄文检测为 ru', () => {
    expect(detect('Привет мир как дела')).toBe('ru');
  });

  it('中英混合文本以 zh 为主要语言', () => {
    expect(detect('hello 你好 mixed text here')).toBe('zh');
  });

  it('空文本回退到 en', () => {
    expect(detect('')).toBe('en');
  });

  it('无语言特征的文本回退到 en', () => {
    expect(detect('12345 !!!')).toBe('en');
  });
});
