jest.mock('../../../src/services/cacheService', () => ({
  getCustomCache: jest.fn()
}));
jest.mock('../../../src/services/chatPermissionService', () => ({
  isChatSendRestricted: jest.fn(() => false),
  markChatSendRestricted: jest.fn()
}));

const cacheService = require('../../../src/services/cacheService');
const chatPermissionService = require('../../../src/services/chatPermissionService');
const TaskQueueHandler = require('../../../src/services/summaryDelivery/taskQueueHandler');

function makeBot() {
  return {
    telegram: {
      editMessageText: jest.fn().mockResolvedValue({}),
      sendMessage: jest.fn().mockResolvedValue({})
    }
  };
}

function makeHandler() {
  return new TaskQueueHandler(makeBot());
}

describe('TaskQueueHandler 事件处理', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    chatPermissionService.isChatSendRestricted.mockReturnValue(false);
  });

  describe('handleTaskFailed', () => {
    it('编辑原消息推送错误提示', async () => {
      cacheService.getCustomCache.mockReturnValue({ chatId: -100, messageId: 555, userId: 42 });
      const handler = makeHandler();

      await handler.handleTaskFailed({
        taskId: 't1',
        chatId: -100,
        userId: 42,
        error: new Error('AI 服务不可用')
      });

      const call = handler.bot.telegram.editMessageText.mock.calls[0];
      expect(call[0]).toBe(-100);
      expect(call[1]).toBe(555);
      expect(call[3]).toContain('❌ 总结生成失败');
      expect(call[3]).toContain('AI 服务不可用');
    });

    it('找不到关联消息时静默返回', async () => {
      cacheService.getCustomCache.mockReturnValue(undefined);
      const handler = makeHandler();

      await handler.handleTaskFailed({ taskId: 't1', chatId: -100, userId: 42, error: new Error('x') });

      expect(handler.bot.telegram.editMessageText).not.toHaveBeenCalled();
    });

    it('发送权限受限的群组被跳过', async () => {
      chatPermissionService.isChatSendRestricted.mockReturnValue(true);
      const handler = makeHandler();

      await handler.handleTaskFailed({ taskId: 't1', chatId: -100, userId: 42, error: new Error('x') });

      expect(handler.bot.telegram.editMessageText).not.toHaveBeenCalled();
    });

    it('内容过滤错误推送专门文案', async () => {
      cacheService.getCustomCache.mockReturnValue({ chatId: -100, messageId: 555 });
      const handler = makeHandler();

      await handler.handleTaskFailed({
        taskId: 't1',
        chatId: -100,
        userId: 42,
        error: Object.assign(new Error('filtered due to the prompt'), { status: 400 })
      });

      const text = handler.bot.telegram.editMessageText.mock.calls[0][3];
      expect(text).toContain('🤖 内容安全提醒');
    });
  });

  describe('handleTaskCompleted', () => {
    const result = {
      summary: '总结正文',
      metadata: { messagesAnalyzed: 10, uniqueUsers: 2 }
    };

    it('以 Markdown 编辑原消息推送总结', async () => {
      cacheService.getCustomCache.mockReturnValue({ chatId: -100, messageId: 555, userId: 42 });
      const handler = makeHandler();

      await handler.handleTaskCompleted({ taskId: 't1', chatId: -100, userId: 42, result });

      expect(handler.bot.telegram.editMessageText).toHaveBeenCalledTimes(1);
      const call = handler.bot.telegram.editMessageText.mock.calls[0];
      expect(call[0]).toBe(-100);
      expect(call[1]).toBe(555);
      expect(call[3]).toContain('总结正文');
      expect(call[3]).toContain('📊 *分析统计*');
      expect(call[4].parse_mode).toBe('Markdown');
    });

    it('找不到关联消息时静默返回', async () => {
      cacheService.getCustomCache.mockReturnValue(undefined);
      const handler = makeHandler();

      await handler.handleTaskCompleted({ taskId: 't1', chatId: -100, userId: 42, result });

      expect(handler.bot.telegram.editMessageText).not.toHaveBeenCalled();
      expect(handler.bot.telegram.sendMessage).not.toHaveBeenCalled();
    });

    it('总结超长时分段发送（首段编辑 + 后续新消息）', async () => {
      cacheService.getCustomCache.mockReturnValue({ chatId: -100, messageId: 555 });
      const handler = makeHandler();
      const longResult = {
        summary: Array.from({ length: 120 }, (_, i) => `段落${i} ${'内容'.repeat(60)}`).join('\n\n'),
        metadata: { messagesAnalyzed: 500, uniqueUsers: 9 }
      };

      await handler.handleTaskCompleted({ taskId: 't1', chatId: -100, userId: 42, result: longResult });

      expect(handler.bot.telegram.editMessageText).toHaveBeenCalledTimes(1);
      expect(handler.bot.telegram.editMessageText.mock.calls[0][3]).toContain('(1/');
      expect(handler.bot.telegram.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(2);
    });
  });
});
