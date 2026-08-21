function loadLogger(level) {
  if (level === undefined) {
    delete process.env.LOG_LEVEL;
  } else {
    process.env.LOG_LEVEL = level;
  }
  jest.resetModules();
  return require('../../src/utils/logger');
}

describe('logger LOG_LEVEL 过滤', () => {
  afterEach(() => {
    delete process.env.LOG_LEVEL;
    jest.resetModules();
  });

  it('未设置时输出全部级别', () => {
    const logger = loadLogger(undefined);
    const beforeLog = console.log.mock.calls.length;
    const beforeWarn = console.warn.mock.calls.length;
    const beforeError = console.error.mock.calls.length;

    logger.debug('d');
    logger.info('i');
    logger.success('s');
    logger.warn('w');
    logger.error('e');

    expect(console.log.mock.calls.length).toBe(beforeLog + 3);
    expect(console.warn.mock.calls.length).toBe(beforeWarn + 1);
    expect(console.error.mock.calls.length).toBe(beforeError + 1);
  });

  it('LOG_LEVEL=warn 抑制 info/success/debug，保留 warn/error', () => {
    const logger = loadLogger('warn');
    const beforeLog = console.log.mock.calls.length;
    const beforeWarn = console.warn.mock.calls.length;
    const beforeError = console.error.mock.calls.length;

    logger.debug('d');
    logger.info('i');
    logger.success('s');
    logger.warn('w');
    logger.error('e');

    expect(console.log.mock.calls.length).toBe(beforeLog);
    expect(console.warn.mock.calls.length).toBe(beforeWarn + 1);
    expect(console.error.mock.calls.length).toBe(beforeError + 1);
  });

  it('LOG_LEVEL=error 只保留 error', () => {
    const logger = loadLogger('error');
    const beforeLog = console.log.mock.calls.length;
    const beforeWarn = console.warn.mock.calls.length;

    logger.info('i');
    logger.warn('w');
    logger.error('e');

    expect(console.log.mock.calls.length).toBe(beforeLog);
    expect(console.warn.mock.calls.length).toBe(beforeWarn);
    expect(console.error.mock.calls.length).toBeGreaterThan(0);
  });

  it('非法级别值回退为输出全部', () => {
    const logger = loadLogger('bogus');
    const beforeLog = console.log.mock.calls.length;
    logger.debug('d');
    expect(console.log.mock.calls.length).toBe(beforeLog + 1);
  });

  it('userActivity 受 info 级别控制', () => {
    const logger = loadLogger('error');
    const beforeLog = console.log.mock.calls.length;
    logger.userActivity({ from: { id: 1 }, chat: { id: -100, type: 'group' } }, '测试');
    expect(console.log.mock.calls.length).toBe(beforeLog);
  });
});
