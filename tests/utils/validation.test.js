const {
  sanitizeInput,
  validateNumber
} = require('../../src/utils/validation');

describe('sanitizeInput', () => {
  it('移除尖括号（HTML 标签）', () => {
    expect(sanitizeInput('<b>x</b>')).toBe('bx/b');
  });

  it('移除控制字符', () => {
    expect(sanitizeInput('a\x00b\x07c\x1fd')).toBe('abcd');
  });

  it('去除首尾空白', () => {
    expect(sanitizeInput('  hi  ')).toBe('hi');
  });

  it('超过 1000 字符截断', () => {
    expect(sanitizeInput('x'.repeat(1500))).toHaveLength(1000);
  });

  it('非字符串输入返回空字符串', () => {
    expect(sanitizeInput(123)).toBe('');
    expect(sanitizeInput(null)).toBe('');
    expect(sanitizeInput(undefined)).toBe('');
  });
});

describe('validateNumber', () => {
  it('有效数字返回数值', () => {
    expect(validateNumber('123', 1, 1000)).toBe(123);
    expect(validateNumber('  42 ', 1, 100)).toBe(42);
  });

  it('非数字返回 null', () => {
    expect(validateNumber('abc', 1, 1000)).toBeNull();
    expect(validateNumber(null, 1, 1000)).toBeNull();
    expect(validateNumber('', 1, 1000)).toBeNull();
  });

  it('越界数字返回 null', () => {
    expect(validateNumber('0', 1, 1000)).toBeNull();
    expect(validateNumber('1001', 1, 1000)).toBeNull();
  });

  it('parseInt 宽容性：前缀数字仍然有效', () => {
    expect(validateNumber('12abc', 1, 1000)).toBe(12);
  });

  it('无边界参数时默认允许全部安全整数', () => {
    expect(validateNumber('999999999999999999', 0)).toBeNull();
  });

  it('显式负数下限时接受负值（群组 ID 场景）', () => {
    expect(validateNumber('-1001234567890', -Number.MAX_SAFE_INTEGER)).toBe(-1001234567890);
  });

  it('负数值超出下界返回 null', () => {
    expect(validateNumber('-9007199254740992', -Number.MAX_SAFE_INTEGER)).toBeNull();
  });
});
