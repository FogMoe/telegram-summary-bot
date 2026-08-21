jest.mock('../../src/services/aiService', () => ({
  summarizeMessages: jest.fn()
}));
jest.mock('../../src/services/cacheService', () => ({
  setSummaryCache: jest.fn(),
  resetApiCooldown: jest.fn()
}));

const aiService = require('../../src/services/aiService');
const cacheService = require('../../src/services/cacheService');
const taskQueue = require('../../src/services/taskQueue');

const messages = [{ text: 'hello', user_id: 1, first_name: 'A', date: 1700000000 }];
const stats = { unique_users: 1, earliest_message: 1700000000, latest_message: 1700000001 };
const topUsers = [{ user_id: 1, first_name: 'A', message_count: 1 }];
const summaryResult = {
  summary: '总结',
  metadata: { messagesAnalyzed: 1, uniqueUsers: 1 }
};

function waitForEvent(event) {
  return new Promise((resolve) => taskQueue.once(event, resolve));
}

describe('taskQueue', () => {
  beforeEach(() => {
    taskQueue.queue.length = 0;
    taskQueue.processing = false;
    taskQueue.currentTask = null;
    taskQueue.taskResults.clear();
    taskQueue.taskStatus.clear();
    jest.clearAllMocks();
  });

  afterAll(() => {
    taskQueue.cleanup();
  });

  it('任务成功：调用 AI、写缓存并发出 taskCompleted 事件', async () => {
    aiService.summarizeMessages.mockResolvedValue(summaryResult);
    const completed = waitForEvent('taskCompleted');

    const taskId = taskQueue.addSummaryTask({
      chatId: -100,
      userId: 42,
      messageId: 1,
      messages,
      stats,
      topUsers,
      messageCount: 100
    });

    const event = await completed;
    expect(event.taskId).toBe(taskId);
    expect(event.chatId).toBe(-100);
    expect(event.result).toEqual(summaryResult);
    expect(aiService.summarizeMessages).toHaveBeenCalledWith(messages, stats, topUsers);
    expect(cacheService.setSummaryCache).toHaveBeenCalledWith(
      -100, 100, stats.latest_message, summaryResult
    );

    const result = taskQueue.getTaskResult(taskId);
    expect(result.success).toBe(true);
    expect(taskQueue.getTaskStatus(taskId).status).toBe('completed');
  });

  it('任务失败：发出 taskFailed 事件并携带完整错误对象', async () => {
    const error = Object.assign(new Error('AI 挂了'), { code: 'ETIMEDOUT' });
    aiService.summarizeMessages.mockRejectedValue(error);
    const failed = waitForEvent('taskFailed');

    const taskId = taskQueue.addSummaryTask({
      chatId: -100,
      userId: 42,
      messages,
      stats,
      topUsers,
      messageCount: 100
    });

    const event = await failed;
    expect(event.taskId).toBe(taskId);
    expect(event.error).toBe(error);
    expect(cacheService.resetApiCooldown).toHaveBeenCalledWith(-100, 42);
    expect(taskQueue.getTaskResult(taskId).success).toBe(false);
    expect(taskQueue.getTaskStatus(taskId).status).toBe('failed');
  });

  it('任务成功时不退还冷却', async () => {
    aiService.summarizeMessages.mockResolvedValue(summaryResult);
    const completed = waitForEvent('taskCompleted');
    taskQueue.addSummaryTask({ chatId: -100, userId: 42, messages, stats, topUsers, messageCount: 1 });
    await completed;

    expect(cacheService.resetApiCooldown).not.toHaveBeenCalled();
  });

  it('串行处理：多个任务依次执行，不并发', async () => {
    const order = [];
    aiService.summarizeMessages.mockImplementation(async () => {
      order.push('start');
      await new Promise((resolve) => setTimeout(resolve, 20));
      order.push('end');
      return summaryResult;
    });

    const allDone = new Promise((resolve) => {
      let finished = 0;
      taskQueue.on('taskCompleted', () => {
        finished++;
        if (finished === 3) resolve();
      });
    });

    for (let i = 0; i < 3; i++) {
      taskQueue.addSummaryTask({
        chatId: -100,
        userId: i,
        messages,
        stats,
        topUsers,
        messageCount: 1
      });
    }

    await allDone;
    expect(order).toEqual(['start', 'end', 'start', 'end', 'start', 'end']);
  });

  it('getQueueStatus 反映队列状态', async () => {
    aiService.summarizeMessages.mockResolvedValue(summaryResult);
    const completed = waitForEvent('taskCompleted');
    taskQueue.addSummaryTask({ chatId: 1, userId: 1, messages, stats, topUsers, messageCount: 1 });
    await completed;
    await new Promise((resolve) => setImmediate(resolve));

    const status = taskQueue.getQueueStatus();
    expect(status.queueLength).toBe(0);
    expect(status.processing).toBe(false);
    expect(status.totalTasks).toBe(1);
  });

  it('任务 ID 全局唯一', () => {
    const id1 = taskQueue.generateTaskId();
    const id2 = taskQueue.generateTaskId();
    expect(id1).not.toBe(id2);
    expect(id1).toMatch(/^task_\d+_/);
  });
});
