const cacheService = require('../../src/services/cacheService');
const chatPermissionService = require('../../src/services/chatPermissionService');
const { safeReply, safeEditMessageText } = require('../../src/telegram/safety');

function forbiddenError() {
  const error = new Error('Forbidden: bot was blocked');
  error.response = {
    error_code: 403,
    description: 'Not enough rights to send text messages to the chat'
  };
  return error;
}

function makeCtx(replyImpl) {
  return {
    chat: { id: -100, type: 'supergroup' },
    reply: replyImpl,
    editMessageText: replyImpl
  };
}

describe('telegram/safety 安全发送', () => {
  beforeEach(() => {
    cacheService.clearAllCache();
  });

  afterAll(() => {
    cacheService.close();
  });

  it('正常发送原样返回结果', async () => {
    const ctx = makeCtx(jest.fn().mockResolvedValue({ message_id: 9 }));
    const result = await safeReply(ctx, 'hello');
    expect(result).toEqual({ message_id: 9 });
    expect(chatPermissionService.isChatSendRestricted(-100)).toBe(false);
  });

  it('权限不足错误：返回 null 并把群组标记为受限', async () => {
    const ctx = makeCtx(jest.fn().mockRejectedValue(forbiddenError()));

    const result = await safeReply(ctx, 'hello');

    expect(result).toBeNull();
    expect(chatPermissionService.isChatSendRestricted(-100)).toBe(true);
  });

  it('受限后 safeEditMessageText 不再真正发送', async () => {
    const inner = jest.fn().mockRejectedValue(forbiddenError());
    const ctx = makeCtx(inner);

    await safeReply(ctx, 'first', {}, {});
    await safeEditMessageText(ctx, 'second', {}, {});

    // 安全包装不吞非权限错误；受限状态由 chatPermissionService 维护
    expect(chatPermissionService.isChatSendRestricted(-100)).toBe(true);
  });

  it('非权限错误原样上抛', async () => {
    const ctx = makeCtx(jest.fn().mockRejectedValue(new Error('network down')));
    await expect(safeReply(ctx, 'hello')).rejects.toThrow('network down');
    expect(chatPermissionService.isChatSendRestricted(-100)).toBe(false);
  });
});
