const {
  isNetworkError,
  isContentFilterError,
  isMarkdownParseError
} = require('../../../src/services/summaryDelivery/errorClassification');

describe('isNetworkError', () => {
  const cases = [
    [Object.assign(new Error('boom'), { code: 'ETIMEDOUT' }), true],
    [Object.assign(new Error('boom'), { code: 'ECONNREFUSED' }), true],
    [new Error('connect ETIMEDOUT to host'), true],
    [Object.assign(new Error('x'), { type: 'system' }), true],
    [Object.assign(new Error('x'), { response: { error_code: 429 } }), true],
    [new Error('plain failure'), false],
    [Object.assign(new Error('x'), { code: 'EINVAL' }), false],
    [null, false]
  ];

  it.each(cases)('%s -> %s', (error, expected) => {
    expect(isNetworkError(error)).toBe(expected);
  });
});

describe('isContentFilterError', () => {
  const cases = [
    [Object.assign(new Error('request rejected by content filtering'), { status: 400 }), true],
    [Object.assign(new Error('Azure content management policy'), { status: 400 }), true],
    [Object.assign(new Error('content filtering'), { status: 500 }), false],
    [Object.assign(new Error('whatever'), { code: 'content_filter' }), true],
    [new Error('normal error'), false],
    [null, false]
  ];

  it.each(cases)('%s -> %s', (error, expected) => {
    expect(isContentFilterError(error)).toBe(expected);
  });
});

describe('isMarkdownParseError', () => {
  const parseError = (description) => ({
    response: { error_code: 400, description }
  });

  it('识别 Telegram 的 can\'t parse entities 错误', () => {
    expect(isMarkdownParseError(parseError("Bad Request: can't parse entities: ..."))).toBe(true);
  });

  it('其它 400 错误不识别', () => {
    expect(isMarkdownParseError(parseError('Bad Request: message is not modified'))).toBe(false);
  });

  it('非 400 错误与空输入不识别', () => {
    expect(isMarkdownParseError({ response: { error_code: 403, description: "can't parse entities" } })).toBe(false);
    expect(isMarkdownParseError(new Error('boom'))).toBe(false);
    expect(isMarkdownParseError(null)).toBe(false);
  });
});
