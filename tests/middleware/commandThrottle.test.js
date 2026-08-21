const { commandThrottle, createCommandThrottle } = require('../../src/middleware/commandThrottle');

function makeCommandCtx(command, userId = 1, chatId = 100) {
  return {
    message: {
      text: `/${command}`,
      entities: [{ type: 'bot_command', offset: 0, length: `/${command}`.length }]
    },
    from: { id: userId },
    chat: { id: chatId },
    reply: jest.fn()
  };
}

describe('CommandThrottle 实例', () => {
  afterEach(() => {
    commandThrottle.cleanup();
  });

  it('首次执行放行并记录', () => {
    expect(commandThrottle.canExecuteCommand(1, 100, 'summary', 3000)).toBe(true);
    expect(commandThrottle.getCommandStats(1, 100, 'summary').count).toBe(1);
  });

  it('窗口期内重复执行被拒绝', () => {
    commandThrottle.canExecuteCommand(2, 100, 'summary', 3000);
    expect(commandThrottle.canExecuteCommand(2, 100, 'summary', 3000)).toBe(false);
  });

  it('不同用户/群组/命令互不影响', () => {
    commandThrottle.canExecuteCommand(3, 100, 'summary', 3000);
    expect(commandThrottle.canExecuteCommand(4, 100, 'summary', 3000)).toBe(true);
    expect(commandThrottle.canExecuteCommand(3, 200, 'summary', 3000)).toBe(true);
    expect(commandThrottle.canExecuteCommand(3, 100, 'status', 3000)).toBe(true);
  });

  it('窗口期过后放行且计数累加', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1700000000000);
    try {
      commandThrottle.canExecuteCommand(5, 100, 'summary', 3000);
      expect(commandThrottle.canExecuteCommand(5, 100, 'summary', 3000)).toBe(false);
      jest.setSystemTime(1700000000000 + 3100);
      expect(commandThrottle.canExecuteCommand(5, 100, 'summary', 3000)).toBe(true);
      expect(commandThrottle.getCommandStats(5, 100, 'summary').count).toBe(2);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('createCommandThrottle 中间件', () => {
  afterEach(() => {
    commandThrottle.cleanup();
  });

  it('非目标命令直接放行', async () => {
    const middleware = createCommandThrottle('summary', 3000);
    const next = jest.fn();
    await middleware(makeCommandCtx('start'), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('目标命令首次执行放行', async () => {
    const middleware = createCommandThrottle('summary', 3000);
    const next = jest.fn();
    await middleware(makeCommandCtx('summary', 77), next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('窗口期内目标命令被拒绝并回复提示', async () => {
    const middleware = createCommandThrottle('summary', 3000);
    await middleware(makeCommandCtx('summary', 88), jest.fn());
    const ctx = makeCommandCtx('summary', 88);
    const next = jest.fn();
    await middleware(ctx, next);
    expect(next).not.toHaveBeenCalled();
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining('请勿重复发送命令'));
  });

  it('缺少用户或聊天 ID 时放行', async () => {
    const middleware = createCommandThrottle('summary', 3000);
    const next = jest.fn();
    await middleware({ message: { text: '/summary' }, chat: { id: 1 } }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
