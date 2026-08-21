const {
  getTelegramErrorDescription,
  isSendMessageForbiddenError
} = require('../../src/telegram/errors');

describe('getTelegramErrorDescription', () => {
  it('优先取 response.description', () => {
    const err = { response: { description: 'resp desc' }, description: 'desc', message: 'msg' };
    expect(getTelegramErrorDescription(err)).toBe('resp desc');
  });

  it('依次回退到 description、message', () => {
    expect(getTelegramErrorDescription({ description: 'desc', message: 'msg' })).toBe('desc');
    expect(getTelegramErrorDescription({ message: 'msg' })).toBe('msg');
  });

  it('空输入返回空字符串', () => {
    expect(getTelegramErrorDescription(null)).toBe('');
    expect(getTelegramErrorDescription({})).toBe('');
  });
});

describe('isSendMessageForbiddenError', () => {
  const restricted = (description, error_code) => ({
    response: { description, error_code }
  });

  it('识别已知的权限不足描述', () => {
    expect(
      isSendMessageForbiddenError(restricted('Not enough rights to send text messages to the chat', 403))
    ).toBe(true);
    expect(
      isSendMessageForbiddenError(restricted('have no rights to send a message', 400))
    ).toBe(true);
    expect(isSendMessageForbiddenError(restricted('chat write forbidden', 403))).toBe(true);
  });

  it('描述不含关键词时不识别', () => {
    expect(isSendMessageForbiddenError(restricted('bot was blocked by the user', 403))).toBe(false);
  });

  it('error_code 不在 400/403 时不识别', () => {
    expect(
      isSendMessageForbiddenError(restricted('Not enough rights to send text messages to the chat', 500))
    ).toBe(false);
  });

  it('无描述时不识别', () => {
    expect(isSendMessageForbiddenError(new Error('boom'))).toBe(false);
  });
});
