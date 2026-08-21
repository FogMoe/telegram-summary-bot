jest.mock('../../src/services/messageStore', () => ({
  storeMessage: jest.fn().mockResolvedValue(1)
}));

const messageStore = require('../../src/services/messageStore');
const {
  messageStoreMiddleware,
  groupStatusMiddleware
} = require('../../src/middleware/messageListener');

const flush = () => new Promise((resolve) => setImmediate(() => resolve()));

function makeMessageCtx(overrides = {}) {
  return Object.assign({
    message: {
      message_id: 1,
      text: '群消息',
      from: { id: 42, username: 'user_name', first_name: 'First_Name' },
      chat: { id: -100, type: 'supergroup' }
    },
    botInfo: { id: 999 },
    reply: jest.fn().mockResolvedValue({})
  }, overrides);
}

describe('messageStoreMiddleware', () => {
  beforeEach(() => {
    messageStore.storeMessage.mockClear();
  });

  it('异步存储群组文本消息，用户名原样保留（显示侧负责转义）', async () => {
    const next = jest.fn();
    const ctx = makeMessageCtx();

    await messageStoreMiddleware(ctx, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(messageStore.storeMessage).toHaveBeenCalledTimes(1);
    const stored = messageStore.storeMessage.mock.calls[0][0];
    expect(stored.from.username).toBe('user_name');
    expect(stored.from.first_name).toBe('First_Name');
  });

  it('过滤 bot 自身的消息（不存储但继续后续中间件）', async () => {
    const next = jest.fn();
    const ctx = makeMessageCtx();
    ctx.message.from.id = 999;

    await messageStoreMiddleware(ctx, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(messageStore.storeMessage).not.toHaveBeenCalled();
  });

  it('无文本的消息不存储', async () => {
    const next = jest.fn();
    const ctx = makeMessageCtx({ message: { message_id: 2, chat: { id: -100 }, from: { id: 42 } } });

    await messageStoreMiddleware(ctx, next);
    await flush();

    expect(next).toHaveBeenCalledTimes(1);
    expect(messageStore.storeMessage).not.toHaveBeenCalled();
  });

  it('存储失败只记录日志不中断', async () => {
    messageStore.storeMessage.mockRejectedValueOnce(new Error('db down'));
    const next = jest.fn();
    const ctx = makeMessageCtx();

    await expect(messageStoreMiddleware(ctx, next)).resolves.not.toThrow();
    await flush();
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('groupStatusMiddleware', () => {
  it('bot 被加入群组时发送欢迎消息', async () => {
    const ctx = makeMessageCtx({
      message: { new_chat_members: [{ id: 999, first_name: 'Bot' }] },
      chat: { id: -100, title: '测试群' }
    });
    const next = jest.fn();

    await groupStatusMiddleware(ctx, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('感谢邀请我加入群组'));
  });

  it('其他成员加入不发欢迎消息', async () => {
    const ctx = makeMessageCtx({
      message: { new_chat_members: [{ id: 777 }] },
      chat: { id: -100, title: '测试群' }
    });
    const next = jest.fn();

    await groupStatusMiddleware(ctx, next);

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('bot 被移出群组时仅记录（保留数据）', async () => {
    const ctx = makeMessageCtx({
      message: { left_chat_member: { id: 999 } },
      chat: { id: -100, title: '测试群' }
    });
    const next = jest.fn();

    await groupStatusMiddleware(ctx, next);

    expect(ctx.reply).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
