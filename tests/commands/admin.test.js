jest.mock('../../src/utils/admin', () => ({
  isAdmin: jest.fn()
}));
jest.mock('../../src/services/messageStore', () => ({
  getChatStats: jest.fn(),
  deleteChatMessages: jest.fn(),
  getTopUsers: jest.fn(),
  getRecentMessages: jest.fn()
}));
jest.mock('../../src/services/cacheService', () => ({
  getCacheStats: jest.fn(),
  clearChatCache: jest.fn(),
  clearAllCache: jest.fn()
}));

const { isAdmin } = require('../../src/utils/admin');
const messageStore = require('../../src/services/messageStore');
const cacheService = require('../../src/services/cacheService');
const { handler: adminCommand } = require('../../src/commands/admin');

function makeCtx(payload = '') {
  return {
    chat: { id: -100, type: 'supergroup' },
    from: { id: 1, first_name: 'Admin' },
    payload,
    reply: jest.fn().mockResolvedValue({})
  };
}

describe('admin 命令', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAdmin.mockReturnValue(true);
  });

  it('非管理员被拒绝，用户名转义展示', async () => {
    isAdmin.mockReturnValue(false);
    const ctx = makeCtx('stats');
    ctx.from.first_name = 'A_b';

    await adminCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('访问被拒绝'), expect.anything());
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('A\\_b'), expect.anything());
    expect(messageStore.getChatStats).not.toHaveBeenCalled();
  });

  it('无参数时显示帮助', async () => {
    const ctx = makeCtx('');
    await adminCommand(ctx);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('管理员命令帮助'), expect.anything());
  });

  it('stats 子命令查询当前群组统计', async () => {
    messageStore.getChatStats.mockResolvedValue({
      total_messages: 10,
      unique_users: 3,
      earliest_message: 1700000000,
      latest_message: 1700003600
    });
    const ctx = makeCtx('stats');

    await adminCommand(ctx);

    expect(messageStore.getChatStats).toHaveBeenCalledWith(-100);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('总消息数：10'), expect.anything());
  });

  it('stats 子命令在私聊中必须指定群组 ID', async () => {
    const ctx = makeCtx('stats');
    ctx.chat = { id: 777, type: 'private' };

    await adminCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith('❌ 请指定群组ID或在群组中执行此命令');
  });

  it('cache 子命令显示缓存状态', async () => {
    cacheService.getCacheStats.mockReturnValue({
      summary: { keys: 1, hits: 2, misses: 3 },
      stats: { keys: 0, hits: 0, misses: 0 },
      users: { keys: 0, hits: 0, misses: 0 }
    });
    const ctx = makeCtx('cache');

    await adminCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('缓存状态'), expect.anything());
  });

  it('clear 子命令按群组清除缓存', async () => {
    const ctx = makeCtx('clear -100');

    await adminCommand(ctx);

    expect(cacheService.clearChatCache).toHaveBeenCalledWith(-100);
    expect(cacheService.clearAllCache).not.toHaveBeenCalled();
  });

  it('clear 子命令不带参数清除全部缓存', async () => {
    const ctx = makeCtx('clear');

    await adminCommand(ctx);

    expect(cacheService.clearAllCache).toHaveBeenCalled();
  });

  it('users 子命令中的用户名被转义后展示', async () => {
    messageStore.getTopUsers.mockResolvedValue([
      { user_id: 1, first_name: 'A_b', username: 'x_y', message_count: 3 }
    ]);
    const ctx = makeCtx('users');

    await adminCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('A\\_b'), expect.anything());
  });

  it('messages 子命令显示全部请求的数量条消息且名字与正文转义', async () => {
    messageStore.getRecentMessages.mockResolvedValue(
      Array.from({ length: 8 }, (_, i) => ({
        message_id: i + 1,
        user_id: 1,
        first_name: `用_${i}`,
        username: null,
        text: `消息_${i}`,
        date: 1700000000 + i
      }))
    );
    const ctx = makeCtx('messages -100 8');

    await adminCommand(ctx);

    expect(messageStore.getRecentMessages).toHaveBeenCalledWith(-100, 8);
    const text = ctx.reply.mock.calls[0][0];
    expect((text.match(/用\\\_/g) || []).length).toBe(8);
    expect(text).toContain('消息\\_7');
  });

  it('delete 子命令不带 confirm 只显示预览', async () => {
    messageStore.getChatStats.mockResolvedValue({
      total_messages: 5,
      unique_users: 2,
      earliest_message: 1700000000,
      latest_message: 1700003600
    });
    const ctx = makeCtx('delete');

    await adminCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('危险操作确认'), expect.anything());
    expect(messageStore.deleteChatMessages).not.toHaveBeenCalled();
  });

  it('delete 子命令带 confirm 执行删除并清缓存', async () => {
    messageStore.deleteChatMessages.mockResolvedValue({
      success: true,
      deletedCount: 5,
      originalTotal: 5
    });
    const ctx = makeCtx('delete confirm');

    await adminCommand(ctx);

    expect(messageStore.deleteChatMessages).toHaveBeenCalledWith(-100);
    expect(cacheService.clearChatCache).toHaveBeenCalledWith(-100);
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('删除操作完成'), expect.anything());
  });
});
