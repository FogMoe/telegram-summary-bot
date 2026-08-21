jest.mock('../../src/services/messageStore', () => ({
  getChatStats: jest.fn(),
  getRecentMessages: jest.fn(),
  getTopUsers: jest.fn()
}));
jest.mock('../../src/services/cacheService', () => ({
  canMakeAPIRequest: jest.fn(),
  getApiCooldownRemaining: jest.fn(),
  getStatsCache: jest.fn(),
  setStatsCache: jest.fn(),
  getSummaryCache: jest.fn(),
  getUserCache: jest.fn(),
  setUserCache: jest.fn(),
  markAPIRequestStarted: jest.fn(),
  setCustomCache: jest.fn()
}));
jest.mock('../../src/services/taskQueue', () => ({
  addSummaryTask: jest.fn()
}));
jest.mock('../../src/services/chatPermissionService', () => ({
  isChatSendRestricted: jest.fn(() => false),
  markChatSendRestricted: jest.fn()
}));

const messageStore = require('../../src/services/messageStore');
const cacheService = require('../../src/services/cacheService');
const taskQueue = require('../../src/services/taskQueue');
const { handler: summaryCommand } = require('../../src/commands/summary');

const stats = {
  total_messages: 120,
  unique_users: 5,
  earliest_message: 1700000000,
  latest_message: 1700003600
};

function makeCtx({ chatType = 'group', payload = '' } = {}) {
  return {
    chat: { id: -100, type: chatType },
    from: { id: 42, first_name: 'Tester' },
    payload,
    update: { update_id: 1 },
    reply: jest.fn().mockResolvedValue({ message_id: 555 }),
    editMessageText: jest.fn().mockResolvedValue({})
  };
}

describe('summary 命令', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    cacheService.canMakeAPIRequest.mockReturnValue(true);
    cacheService.getStatsCache.mockReturnValue(null);
    cacheService.getSummaryCache.mockReturnValue(null);
    cacheService.getUserCache.mockReturnValue(null);
    taskQueue.addSummaryTask.mockReturnValue('task_1');
  });

  it('私聊中回复使用说明且不做任何处理', async () => {
    const ctx = makeCtx({ chatType: 'private' });
    await summaryCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('Summary 命令使用说明'), expect.anything());
    expect(ctx.editMessageText).not.toHaveBeenCalled();
    expect(taskQueue.addSummaryTask).not.toHaveBeenCalled();
  });

  it('权限受限的群组静默忽略', async () => {
    const chatPermissionService = require('../../src/services/chatPermissionService');
    chatPermissionService.isChatSendRestricted.mockReturnValueOnce(true);

    const ctx = makeCtx();
    await summaryCommand(ctx);

    expect(ctx.reply).not.toHaveBeenCalled();
  });

  it('非法数量参数返回格式说明', async () => {
    const ctx = makeCtx({ payload: 'abc' });
    await summaryCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('参数错误'), expect.anything());
    expect(taskQueue.addSummaryTask).not.toHaveBeenCalled();
  });

  it('数量参数可以正常解析', async () => {
    messageStore.getChatStats.mockResolvedValue(stats);
    messageStore.getRecentMessages.mockResolvedValue([{ text: 'hi' }]);
    messageStore.getTopUsers.mockResolvedValue([]);
    const ctx = makeCtx({ payload: '50' });

    await summaryCommand(ctx);

    expect(taskQueue.addSummaryTask).toHaveBeenCalledWith(
      expect.objectContaining({ messageCount: 50 })
    );
  });

  it('冷却期内回复等待提示', async () => {
    cacheService.canMakeAPIRequest.mockReturnValue(false);
    cacheService.getApiCooldownRemaining.mockReturnValue(3 * 60 * 1000);
    const ctx = makeCtx();

    await summaryCommand(ctx);

    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('等待3分钟'), expect.anything());
    expect(ctx.editMessageText).not.toHaveBeenCalled();
  });

  it('无聊天记录时提示暂无数据', async () => {
    messageStore.getChatStats.mockResolvedValue({ total_messages: 0 });
    const ctx = makeCtx();

    await summaryCommand(ctx);

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('📭 暂无聊天记录'),
      expect.anything()
    );
  });

  it('命中缓存时直接编辑处理中消息并带缓存徽标', async () => {
    messageStore.getChatStats.mockResolvedValue(stats);
    cacheService.getSummaryCache.mockReturnValue({ summary: '缓存总结', metadata: {} });
    const ctx = makeCtx();

    await summaryCommand(ctx);

    expect(taskQueue.addSummaryTask).not.toHaveBeenCalled();
    expect(ctx.editMessageText).toHaveBeenCalledTimes(1);
    const [text, options] = ctx.editMessageText.mock.calls[0];
    expect(text).toContain('缓存总结');
    expect(text).toContain('💾 *此结果来自缓存*');
    expect(options.message_id).toBe(555);
    expect(options.parse_mode).toBe('Markdown');
  });

  it('未命中缓存时提交任务、标记冷却并保存消息关联', async () => {
    messageStore.getChatStats.mockResolvedValue(stats);
    messageStore.getRecentMessages.mockResolvedValue([{ text: 'hi' }]);
    messageStore.getTopUsers.mockResolvedValue([{ user_id: 1, first_name: 'A', message_count: 3 }]);
    const ctx = makeCtx();

    await summaryCommand(ctx);

    expect(cacheService.markAPIRequestStarted).toHaveBeenCalledWith(-100, 42);
    expect(taskQueue.addSummaryTask).toHaveBeenCalledWith(
      expect.objectContaining({ chatId: -100, userId: 42, messageId: 555, messageCount: 100 })
    );
    expect(cacheService.setCustomCache).toHaveBeenCalledWith(
      'task_message_task_1',
      { chatId: -100, messageId: 555, userId: 42 },
      15 * 60
    );
    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('稍后自动更新结果'),
      expect.anything()
    );
  });

  it('消息总数小于请求数量时收敛到实际数量', async () => {
    messageStore.getChatStats.mockResolvedValue({ ...stats, total_messages: 30 });
    messageStore.getRecentMessages.mockResolvedValue([{ text: 'hi' }]);
    messageStore.getTopUsers.mockResolvedValue([]);
    const ctx = makeCtx({ payload: '500' });

    await summaryCommand(ctx);

    expect(taskQueue.addSummaryTask).toHaveBeenCalledWith(
      expect.objectContaining({ messageCount: 30 })
    );
  });

  it('任务提交失败时提示错误', async () => {
    messageStore.getChatStats.mockResolvedValue(stats);
    messageStore.getRecentMessages.mockResolvedValue([{ text: 'hi' }]);
    messageStore.getTopUsers.mockResolvedValue([]);
    taskQueue.addSummaryTask.mockImplementation(() => {
      throw new Error('queue broken');
    });
    const ctx = makeCtx();

    await summaryCommand(ctx);

    expect(ctx.editMessageText).toHaveBeenCalledWith(
      expect.stringContaining('任务提交失败'),
      expect.anything()
    );
  });
});
