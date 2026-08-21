function loadConfig(env) {
  const saved = {};
  const keys = [
    'BOT_TOKEN', 'ADMIN_USER_IDS', 'DATABASE_PATH', 'LOG_LEVEL',
    'PRIMARY_API_KEY', 'PRIMARY_API_BASE_URL', 'PRIMARY_MODEL',
    'FALLBACK_API_KEY', 'FALLBACK_API_BASE_URL', 'FALLBACK_MODEL'
  ];
  for (const key of keys) {
    saved[key] = process.env[key];
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  jest.resetModules();
  const config = require('../../src/config');
  for (const key of keys) {
    if (saved[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = saved[key];
    }
  }
  return config;
}

describe('集中配置', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('默认值：空 token/管理员、默认模型、storage 数据库路径', () => {
    const config = loadConfig({});
    expect(config.botToken).toBe('');
    expect(config.adminUserIds).toEqual([]);
    expect(config.ai.primary.model).toBe('gpt-4o-mini');
    expect(config.ai.fallback.model).toBe('gpt-4o-mini');
    expect(config.databasePath).toContain('storage');
    expect(config.logLevel).toBe('');
  });

  it('ADMIN_USER_IDS 解析逗号分隔 ID 并过滤非法项', () => {
    const config = loadConfig({ ADMIN_USER_IDS: '111, 222 ,abc,333' });
    expect(config.adminUserIds).toEqual([111, 222, 333]);
  });

  it('备用模型默认继承主模型', () => {
    const config = loadConfig({ PRIMARY_MODEL: 'gemini-2.5-flash' });
    expect(config.ai.primary.model).toBe('gemini-2.5-flash');
    expect(config.ai.fallback.model).toBe('gemini-2.5-flash');
  });

  it('备用模型显式配置优先', () => {
    const config = loadConfig({ PRIMARY_MODEL: 'a', FALLBACK_MODEL: 'b' });
    expect(config.ai.fallback.model).toBe('b');
  });

  it('DATABASE_PATH 解析为绝对路径', () => {
    const config = loadConfig({ DATABASE_PATH: 'data/custom.db' });
    expect(require('path').isAbsolute(config.databasePath)).toBe(true);
    expect(config.databasePath).toContain('custom.db');
  });

  it('LOG_LEVEL 归一化为小写', () => {
    expect(loadConfig({ LOG_LEVEL: 'WARN' }).logLevel).toBe('warn');
  });

  it('API 配置逐项读取', () => {
    const config = loadConfig({
      PRIMARY_API_KEY: 'pk',
      PRIMARY_API_BASE_URL: 'https://a.example/v1',
      FALLBACK_API_KEY: 'fk'
    });
    expect(config.ai.primary.apiKey).toBe('pk');
    expect(config.ai.primary.baseURL).toBe('https://a.example/v1');
    expect(config.ai.fallback.apiKey).toBe('fk');
    expect(config.ai.fallback.baseURL).toBe('');
  });
});
