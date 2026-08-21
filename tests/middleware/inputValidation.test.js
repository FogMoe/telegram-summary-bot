const { inputValidation } = require('../../src/middleware/inputValidation');
const { registerCommand } = require('../../src/utils/commandRegistry');

function makeCtx(text, { userId = 1, chatId = -100, entities } = {}) {
  return {
    message: text === undefined ? undefined : {
      text,
      entities: entities !== undefined
        ? entities
        : (text && text.startsWith('/')
          ? [{ type: 'bot_command', offset: 0, length: text.split(' ')[0].length }]
          : [])
    },
    from: { id: userId },
    chat: { id: chatId },
    reply: jest.fn().mockResolvedValue({})
  };
}

describe('inputValidation 中间件', () => {
  beforeAll(() => {
    registerCommand('summary');
  });

  it('普通文本消息放行', async () => {
    const next = jest.fn();
    await inputValidation(makeCtx('hello'), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('超长消息拒绝且不继续', async () => {
    const ctx = makeCtx('x'.repeat(10001));
    const next = jest.fn();
    await inputValidation(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith('⚠️ 消息过长，请发送较短的内容。');
    expect(next).not.toHaveBeenCalled();
  });

  it('未注册的命令不做参数校验直接放行', async () => {
    const next = jest.fn();
    await inputValidation(makeCtx('/unknown <script>'), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('畸形的未注册命令跳过参数校验直接放行（格式校验分支对其不可达）', async () => {
    const ctx = makeCtx('/sum!mary', {
      entities: [{ type: 'bot_command', offset: 0, length: '/sum!mary'.length }]
    });
    const next = jest.fn();
    await inputValidation(ctx, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('已注册命令参数包含危险字符被拒绝', async () => {
    const ctx = makeCtx('/summary <script>');
    const next = jest.fn();
    await inputValidation(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith('⚠️ 参数包含不允许的字符。');
    expect(next).not.toHaveBeenCalled();
  });

  it('已注册命令参数过长被拒绝', async () => {
    const ctx = makeCtx(`/summary ${'a'.repeat(1001)}`);
    const next = jest.fn();
    await inputValidation(ctx, next);
    expect(ctx.reply).toHaveBeenCalledWith('⚠️ 命令参数过长。');
    expect(next).not.toHaveBeenCalled();
  });

  it('合法的已注册命令放行', async () => {
    const next = jest.fn();
    await inputValidation(makeCtx('/summary 100'), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('非法用户 ID 静默丢弃（无回复、不继续）', async () => {
    const ctx = makeCtx('hi', { userId: -5 });
    const next = jest.fn();
    await inputValidation(ctx, next);
    expect(ctx.reply).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('非法聊天 ID 静默丢弃', async () => {
    const ctx = makeCtx('hi', { chatId: Number.MAX_SAFE_INTEGER + 1 });
    const next = jest.fn();
    await inputValidation(ctx, next);
    expect(next).not.toHaveBeenCalled();
  });

  it('无消息的更新放行', async () => {
    const next = jest.fn();
    await inputValidation({ from: { id: 1 }, chat: { id: 1 }, reply: jest.fn() }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
