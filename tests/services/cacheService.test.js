const cacheService = require('../../src/services/cacheService');

const summaryPayload = { summary: 's', metadata: { messagesAnalyzed: 10 } };

describe('cacheService', () => {
  beforeEach(() => {
    cacheService.clearAllCache();
  });

  afterAll(() => {
    cacheService.close();
  });

  describe('generateCacheKey', () => {
    it('相同输入生成相同的 MD5 键', () => {
      expect(cacheService.generateCacheKey('summary', { chatId: 1, messageCount: 2 })).toBe(
        cacheService.generateCacheKey('summary', { chatId: 1, messageCount: 2 })
      );
    });

    it('不同输入生成不同键', () => {
      expect(cacheService.generateCacheKey('summary', { chatId: 1 })).not.toBe(
        cacheService.generateCacheKey('summary', { chatId: 2 })
      );
    });

    it('键以给定前缀开头', () => {
      expect(cacheService.generateCacheKey('summary', {})).toMatch(/^summary_[0-9a-f]{32}$/);
    });
  });

  describe('总结缓存', () => {
    it('设置后可按相同参数取回，并附带 fromCache 标记与时间戳', () => {
      cacheService.setSummaryCache(100, 50, 1700000000, summaryPayload);
      const cached = cacheService.getSummaryCache(100, 50, 1700000000);
      expect(cached).not.toBeNull();
      expect(cached.fromCache).toBe(true);
      expect(cached.summary).toBe('s');
      expect(typeof cached.cached_at).toBe('number');
      expect(cached.cache_key).toMatch(/^summary_/);
    });

    it('最新消息时间变化（群里有新消息）后缓存失效', () => {
      cacheService.setSummaryCache(100, 50, 1700000000, summaryPayload);
      expect(cacheService.getSummaryCache(100, 50, 1700000001)).toBeNull();
    });

    it('消息数量变化后缓存失效', () => {
      cacheService.setSummaryCache(100, 50, 1700000000, summaryPayload);
      expect(cacheService.getSummaryCache(100, 60, 1700000000)).toBeNull();
    });

    it('不同群组的缓存互不影响', () => {
      cacheService.setSummaryCache(100, 50, 1700000000, summaryPayload);
      expect(cacheService.getSummaryCache(200, 50, 1700000000)).toBeNull();
    });
  });

  describe('统计与用户缓存', () => {
    it('统计缓存按 chatId 存取', () => {
      cacheService.setStatsCache(100, { total_messages: 5 });
      expect(cacheService.getStatsCache(100)).toEqual({ total_messages: 5, cached_at: expect.any(Number) });
      expect(cacheService.getStatsCache(200)).toBeNull();
    });

    it('用户缓存按 chatId+limit 存取并包装为数组', () => {
      cacheService.setUserCache(100, 10, [{ user_id: 1 }]);
      const cached = cacheService.getUserCache(100, 10);
      expect(cached.users).toEqual([{ user_id: 1 }]);
      expect(cacheService.getUserCache(100, 5)).toBeNull();
    });

    it('setUserCache 对非数组输入包装为空数组', () => {
      cacheService.setUserCache(100, 10, 'not-array');
      expect(cacheService.getUserCache(100, 10).users).toEqual([]);
    });
  });

  describe('API 冷却', () => {
    it('初始状态允许请求', () => {
      expect(cacheService.canMakeAPIRequest(100, 1)).toBe(true);
    });

    it('标记开始后 5 分钟内同群同用户被拒绝', () => {
      cacheService.markAPIRequestStarted(100, 1);
      expect(cacheService.canMakeAPIRequest(100, 1)).toBe(false);
      expect(cacheService.canMakeAPIRequest(100, 2)).toBe(true);
      expect(cacheService.canMakeAPIRequest(200, 1)).toBe(true);
    });

    it('剩余冷却时间为正且不超过上限', () => {
      const before = Date.now();
      cacheService.markAPIRequestStarted(100, 1);
      const remaining = cacheService.getApiCooldownRemaining(100, 1);
      expect(remaining).toBeGreaterThan(0);
      expect(remaining).toBeLessThanOrEqual(5 * 60 * 1000);
      expect(remaining).toBeGreaterThanOrEqual(5 * 60 * 1000 - (Date.now() - before) - 5);
    });

    it('未标记过冷却时剩余时间为 0', () => {
      expect(cacheService.getApiCooldownRemaining(100, 9)).toBe(0);
    });

    it('resetApiCooldown 退还冷却后可立即再次请求', () => {
      cacheService.markAPIRequestStarted(100, 5);
      expect(cacheService.canMakeAPIRequest(100, 5)).toBe(false);
      cacheService.resetApiCooldown(100, 5);
      expect(cacheService.canMakeAPIRequest(100, 5)).toBe(true);
      expect(cacheService.getApiCooldownRemaining(100, 5)).toBe(0);
    });
  });

  describe('自定义缓存', () => {
    it('按字面键存取任意值', () => {
      cacheService.setCustomCache('task_message_t1', { chatId: 1 }, 60);
      expect(cacheService.getCustomCache('task_message_t1')).toEqual({ chatId: 1 });
      expect(cacheService.getCustomCache('task_message_t2')).toBeUndefined();
    });
  });

  describe('clearChatCache（按群组精确清除）', () => {
    it('能清除该群组的 summary 缓存（MD5 键通过索引定位）', () => {
      cacheService.setSummaryCache(100, 50, 1700000000, summaryPayload);
      expect(cacheService.getSummaryCache(100, 50, 1700000000)).not.toBeNull();
      cacheService.clearChatCache(100);
      expect(cacheService.getSummaryCache(100, 50, 1700000000)).toBeNull();
    });

    it('不影响其它群组的 summary 缓存', () => {
      cacheService.setSummaryCache(100, 50, 1700000000, summaryPayload);
      cacheService.setSummaryCache(200, 50, 1700000000, summaryPayload);
      cacheService.clearChatCache(100);
      expect(cacheService.getSummaryCache(100, 50, 1700000000)).toBeNull();
      expect(cacheService.getSummaryCache(200, 50, 1700000000)).not.toBeNull();
    });

    it('前缀相近的群组 ID 不会被误删（如 100 与 1001）', () => {
      cacheService.setStatsCache(100, { total_messages: 1 });
      cacheService.setStatsCache(1001, { total_messages: 2 });
      cacheService.setUserCache(100, 10, []);
      cacheService.setUserCache(1001, 10, []);
      cacheService.markAPIRequestStarted(1001, 7);

      cacheService.clearChatCache(100);

      expect(cacheService.getStatsCache(100)).toBeNull();
      expect(cacheService.getStatsCache(1001)).not.toBeNull();
      expect(cacheService.getUserCache(100, 10)).toBeNull();
      expect(cacheService.getUserCache(1001, 10)).not.toBeNull();
      expect(cacheService.canMakeAPIRequest(1001, 7)).toBe(false);
    });

    it('一并清除该群组的发送受限熔断标记（其它群组不受影响）', () => {
      cacheService.setCustomCache('chat_send_restricted_100', { restricted: true }, 3600);
      cacheService.setCustomCache('chat_send_restricted_200', { restricted: true }, 3600);

      cacheService.clearChatCache(100);

      expect(cacheService.getCustomCache('chat_send_restricted_100')).toBeUndefined();
      expect(cacheService.getCustomCache('chat_send_restricted_200')).toBeDefined();
    });

    it('清除后键→群组索引同步清理（不残留死键）', () => {
      cacheService.setSummaryCache(100, 50, 1700000000, summaryPayload);
      expect(cacheService.summaryKeyChat.size).toBe(1);
      cacheService.clearChatCache(100);
      expect(cacheService.summaryKeyChat.size).toBe(0);
    });
  });

  describe('总结缓存索引维护', () => {
    it('缓存过期事件触发索引清理', () => {
      cacheService.setSummaryCache(300, 50, 1700000000, summaryPayload);
      expect(cacheService.summaryKeyChat.size).toBe(1);
      const key = cacheService.summaryKeyChat.keys().next().value;

      cacheService.summaryCache.emit('expired', key, null);

      expect(cacheService.summaryKeyChat.size).toBe(0);
    });

    it('缓存删除事件触发索引清理', () => {
      cacheService.setSummaryCache(300, 50, 1700000000, summaryPayload);
      const key = cacheService.summaryKeyChat.keys().next().value;

      cacheService.summaryCache.del(key);

      expect(cacheService.summaryKeyChat.size).toBe(0);
    });

    it('clearAllCache 清空索引', () => {
      cacheService.setSummaryCache(300, 50, 1700000000, summaryPayload);
      cacheService.setSummaryCache(400, 50, 1700000000, summaryPayload);
      expect(cacheService.summaryKeyChat.size).toBe(2);

      cacheService.clearAllCache();

      expect(cacheService.summaryKeyChat.size).toBe(0);
    });
  });

  describe('缓存统计', () => {
    it('返回三类缓存的键数与命中统计', () => {
      cacheService.setStatsCache(100, {});
      const stats = cacheService.getCacheStats();
      expect(stats).toHaveProperty('summary.keys');
      expect(stats).toHaveProperty('stats.keys', 1);
      expect(stats).toHaveProperty('users.keys');
      expect(stats).toHaveProperty('summary.hits');
    });
  });
});
