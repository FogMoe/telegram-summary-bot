const { splitTextIntoSegments } = require('../../../src/services/summaryDelivery/textSegmenter');

describe('splitTextIntoSegments', () => {
  it('不超过上限的文本不分割', () => {
    expect(splitTextIntoSegments('a'.repeat(100), 200)).toEqual(['a'.repeat(100)]);
  });

  it('长文本在换行断点处分割且每段不超上限', () => {
    const paras = Array.from({ length: 10 }, (_, i) => `P${i} ${'x'.repeat(100)}`);
    const text = paras.join('\n\n');
    const segments = splitTextIntoSegments(text, 500);
    expect(segments).toHaveLength(3);
    expect(segments.every((s) => s.length <= 500)).toBe(true);
    expect(segments[0].endsWith('\n\n')).toBe(true);
  });

  it('无断点的连续文本按上限硬切', () => {
    const segments = splitTextIntoSegments('y'.repeat(1200), 500);
    expect(segments.map((s) => s.length)).toEqual([500, 500, 200]);
  });

  it('默认上限为 3500', () => {
    expect(splitTextIntoSegments('a'.repeat(3500))).toEqual(['a'.repeat(3500)]);
    expect(splitTextIntoSegments('a'.repeat(3501))).toHaveLength(2);
  });
});
