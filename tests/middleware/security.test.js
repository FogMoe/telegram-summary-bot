const { rateLimiter, userValidator } = require('../../src/middleware/security');
const { registerCommand } = require('../../src/utils/commandRegistry');

function makeCommandCtx(userId) {
  return {
    message: {
      text: '/summary',
      entities: [{ type: 'bot_command', offset: 0, length: 8 }]
    },
    from: { id: userId },
    chat: { id: -100 },
    reply: jest.fn().mockResolvedValue({})
  };
}

describe('rateLimiter 速率限制', () => {
  beforeAll(() => {
    registerCommand('summary');
  });

  afterAll(() => {
    rateLimiter.cleanup();
  });

  it('窗口内前 10 次命令放行，第 11 次被拒绝', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1700000000000);
    try {
      for (let i = 0; i < 10; i++) {
        const next = jest.fn();
        rateLimiter(makeCommandCtx(1001), next);
        expect(next).toHaveBeenCalledTimes(1);
      }

      const ctx = makeCommandCtx(1001);
      const next = jest.fn();
      rateLimiter(ctx, next);
      expect(next).not.toHaveBeenCalled();
      expect(ctx.reply).toHaveBeenCalledWith('⚠️ 您的请求过于频繁，请稍后再试。');
    } finally {
      jest.useRealTimers();
    }
  });

  it('时间窗口过后计数重置', () => {
    jest.useFakeTimers();
    jest.setSystemTime(1700000000000);
    try {
      for (let i = 0; i < 10; i++) {
        rateLimiter(makeCommandCtx(1002), jest.fn());
      }
      const blocked = makeCommandCtx(1002);
      rateLimiter(blocked, jest.fn());
      expect(blocked.reply).toHaveBeenCalledWith('⚠️ 您的请求过于频繁，请稍后再试。');

      jest.setSystemTime(1700000000000 + 61 * 1000);
      const next = jest.fn();
      rateLimiter(makeCommandCtx(1002), next);
      expect(next).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('不同用户互不影响', () => {
    const nextA = jest.fn();
    const nextB = jest.fn();
    rateLimiter(makeCommandCtx(2001), nextA);
    rateLimiter(makeCommandCtx(2002), nextB);
    expect(nextA).toHaveBeenCalledTimes(1);
    expect(nextB).toHaveBeenCalledTimes(1);
  });

  it('普通消息（非命令）不计数直接放行', () => {
    const next = jest.fn();
    rateLimiter({ message: { text: 'hi', entities: [] }, from: { id: 3001 }, chat: { id: 1 } }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('无用户 ID 放行', () => {
    const next = jest.fn();
    rateLimiter({ message: { text: 'hi' }, chat: { id: 1 } }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('userValidator', () => {
  it('记录用户访问并放行', () => {
    const next = jest.fn();
    userValidator({ from: { id: 1, first_name: 'A', username: 'a' }, chat: { id: -100 } }, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('无用户信息也放行', () => {
    const next = jest.fn();
    userValidator({}, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
