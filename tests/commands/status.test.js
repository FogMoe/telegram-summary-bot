jest.mock('../../src/utils/admin', () => ({
  isAdmin: jest.fn()
}));
jest.mock('../../src/services/messageStore', () => ({
  getChatStats: jest.fn(),
  getTopUsers: jest.fn()
}));
jest.mock('../../src/services/aiService', () => ({
  getStatus: jest.fn(() => ({
    initialized: true,
    primary: { configured: true, apiKey: '已配置', baseUrl: '默认(OpenAI)', modelName: 'gpt-4o-mini' },
    fallback: { configured: false }
  }))
}));
jest.mock('../../src/services/cacheService', () => ({
  getCacheStats: jest.fn(() => ({
    summary: { keys: 0, hits: 0, misses: 0 },
    stats: { keys: 0, hits: 0, misses: 0 },
    users: { keys: 0, hits: 0, misses: 0 }
  }))
}));
jest.mock('../../src/services/taskQueue', () => ({
  getQueueStatus: jest.fn(() => ({
    queueLength: 0,
    processing: false,
    totalTasks: 0,
    currentTask: null
  }))
}));

const { isAdmin } = require('../../src/utils/admin');
const messageStore = require('../../src/services/messageStore');
const { handler: statusCommand } = require('../../src/commands/status');

function makeCtx() {
  return {
    from: { id: 1, first_name: 'A_b', username: 'x_y' },
    chat: { id: -100, type: 'supergroup', title: '测试群' },
    botInfo: { id: 9, username: 'summary_bot', first_name: 'SummaryBot' },
    reply: jest.fn().mockResolvedValue({})
  };
}

describe('status 命令', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    isAdmin.mockReturnValue(true);
    messageStore.getChatStats.mockResolvedValue({
      total_messages: 10,
      unique_users: 3,
      earliest_message: 1700000000,
      latest_message: 1700003600
    });
    messageStore.getTopUsers.mockResolvedValue([]);
  });

  it('非管理员被拒绝，用户名转义展示', async () => {
    isAdmin.mockReturnValue(false);
    const ctx = makeCtx();

    await statusCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('访问被拒绝'), expect.anything());
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('A\\_b'), expect.anything());
  });

  it('管理员查询返回状态报告，执行者名字转义', async () => {
    const ctx = makeCtx();

    await statusCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('机器人状态报告'), expect.anything());
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('执行者*：A\\_b'), expect.anything());
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('群组数据统计'), expect.anything());
  });

  it('活跃用户名字转义展示', async () => {
    messageStore.getTopUsers.mockResolvedValue([
      { user_id: 2, first_name: 'B_c', username: null, message_count: 5 }
    ]);
    const ctx = makeCtx();

    await statusCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('B\\_c(5)'), expect.anything());
  });
});
