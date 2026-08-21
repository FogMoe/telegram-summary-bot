const {
  getCommandInfo,
  isCommandForBot,
  isCommandMatch
} = require('../../src/telegram/commandParser');

function makeCtx(text, entities, botUsername) {
  return {
    message: { text, entities },
    botInfo: botUsername ? { username: botUsername } : undefined
  };
}

describe('getCommandInfo', () => {
  it('解析带 @提及 的命令', () => {
    const ctx = makeCtx('/start@mybot hello', [
      { type: 'bot_command', offset: 0, length: '/start@mybot'.length }
    ]);
    expect(getCommandInfo(ctx)).toEqual({
      raw: '/start@mybot',
      command: 'start',
      mention: 'mybot'
    });
  });

  it('解析不带提及的命令', () => {
    const ctx = makeCtx('/summary 100', [
      { type: 'bot_command', offset: 0, length: '/summary'.length }
    ]);
    expect(getCommandInfo(ctx)).toEqual({
      raw: '/summary',
      command: 'summary',
      mention: undefined
    });
  });

  it('非命令实体或非零偏移返回 null', () => {
    expect(getCommandInfo(makeCtx('hello', []))).toBeNull();
    expect(
      getCommandInfo(makeCtx('hi /cmd', [{ type: 'bot_command', offset: 3, length: 4 }]))
    ).toBeNull();
    expect(getCommandInfo({ message: {} })).toBeNull();
    expect(getCommandInfo({})).toBeNull();
  });
});

describe('isCommandForBot', () => {
  it('无提及时视为发给自己', () => {
    const ctx = makeCtx('/start', [{ type: 'bot_command', offset: 0, length: 6 }]);
    expect(isCommandForBot(ctx)).toBe(true);
  });

  it('提及匹配自己（大小写不敏感）', () => {
    const ctx = makeCtx(
      '/start@MyBot',
      [{ type: 'bot_command', offset: 0, length: '/start@MyBot'.length }],
      'mybot'
    );
    expect(isCommandForBot(ctx)).toBe(true);
  });

  it('提及别的机器人时返回 false', () => {
    const ctx = makeCtx(
      '/start@otherbot',
      [{ type: 'bot_command', offset: 0, length: '/start@otherbot'.length }],
      'mybot'
    );
    expect(isCommandForBot(ctx)).toBe(false);
  });

  it('有提及但上下文缺少 botInfo 时返回 false', () => {
    const ctx = makeCtx('/start@mybot', [
      { type: 'bot_command', offset: 0, length: '/start@mybot'.length }
    ]);
    expect(isCommandForBot(ctx)).toBe(false);
  });

  it('非命令返回 false', () => {
    expect(isCommandForBot(makeCtx('hello', []))).toBe(false);
  });
});

describe('isCommandMatch', () => {
  it('匹配命令名（大小写不敏感）', () => {
    const ctx = makeCtx('/summary', [{ type: 'bot_command', offset: 0, length: 8 }]);
    expect(isCommandMatch(ctx, 'summary')).toBe(true);
    expect(isCommandMatch(ctx, 'SUMMARY')).toBe(true);
  });

  it('命令名不同返回 false', () => {
    const ctx = makeCtx('/summary', [{ type: 'bot_command', offset: 0, length: 8 }]);
    expect(isCommandMatch(ctx, 'start')).toBe(false);
  });

  it('发给别人机器人的命令不算匹配', () => {
    const ctx = makeCtx(
      '/summary@other',
      [{ type: 'bot_command', offset: 0, length: '/summary@other'.length }],
      'mybot'
    );
    expect(isCommandMatch(ctx, 'summary')).toBe(false);
  });

  it('无命令名参数返回 false', () => {
    const ctx = makeCtx('/summary', [{ type: 'bot_command', offset: 0, length: 8 }]);
    expect(isCommandMatch(ctx)).toBe(false);
  });
});
