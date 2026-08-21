const cacheService = require('../../src/services/cacheService');
const { loadCommands, getAvailableCommands } = require('../../src/commands/index');

describe('命令注册器', () => {
  afterAll(() => {
    cacheService.close();
  });

  it('加载并注册全部 5 个命令', () => {
    const bot = { command: jest.fn() };
    loadCommands(bot);

    expect(bot.command.mock.calls.map(([name]) => name).sort()).toEqual([
      'admin', 'help', 'start', 'status', 'summary'
    ]);
  });

  it('getAvailableCommands 返回按字母序排列的命令信息', () => {
    const commands = getAvailableCommands();
    expect(commands.map((c) => c.command)).toEqual([
      'admin', 'help', 'start', 'status', 'summary'
    ]);
    for (const command of commands) {
      expect(typeof command.description).toBe('string');
      expect(command.description.length).toBeGreaterThan(0);
    }
  });
});
