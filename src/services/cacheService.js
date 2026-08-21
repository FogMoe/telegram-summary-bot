/**
 * 缓存服务模块
 * 使用内存缓存防止 API 过度请求
 */

const NodeCache = require('node-cache');
const crypto = require('crypto');
const logger = require('../utils/logger');
const { CACHE_TTLS } = require('../config/constants');

class CacheService {
  constructor() {
    // 创建多个缓存实例用于不同类型的数据
    this.summaryCache = new NodeCache({
      stdTTL: CACHE_TTLS.SUMMARY_TTL_SECONDS,
      checkperiod: CACHE_TTLS.SUMMARY_CHECK_PERIOD_SECONDS,
      useClones: false
    });

    this.statsCache = new NodeCache({
      stdTTL: CACHE_TTLS.STATS_TTL_SECONDS,
      checkperiod: CACHE_TTLS.STATS_CHECK_PERIOD_SECONDS,
      useClones: false
    });

    this.userCache = new NodeCache({
      stdTTL: CACHE_TTLS.USER_TTL_SECONDS,
      checkperiod: CACHE_TTLS.USER_CHECK_PERIOD_SECONDS,
      useClones: false
    });

    // summaryCacheKey -> chatId：总结缓存键是 MD5 哈希、不含原始 chatId，
    // 需要靠索引才能按群组精确清除；条目随缓存过期/删除同步清理，避免泄漏
    this.summaryKeyChat = new Map();

    this.setupEventHandlers();
  }

  /**
   * 设置缓存事件处理器
   */
  setupEventHandlers() {
    // 总结缓存事件
    this.summaryCache.on('set', (key, value) => {
      logger.info(`总结缓存已设置: ${key}`);
    });

    this.summaryCache.on('expired', (key, value) => {
      this.summaryKeyChat.delete(key);
      logger.info(`总结缓存已过期: ${key}`);
    });

    this.summaryCache.on('del', (key) => {
      this.summaryKeyChat.delete(key);
    });

    // 统计缓存事件
    this.statsCache.on('set', (key, value) => {
      logger.info(`统计缓存已设置: ${key}`);
    });

    // 用户缓存事件
    this.userCache.on('set', (key, value) => {
      logger.info(`用户缓存已设置: ${key}`);
    });

    logger.success('缓存服务初始化完成');
  }

  /**
   * 生成缓存键
   * @param {string} prefix - 前缀
   * @param {*} data - 数据
   * @returns {string} 缓存键
   */
  generateCacheKey(prefix, data) {
    const hash = crypto
      .createHash('md5')
      .update(JSON.stringify(data))
      .digest('hex');
    return `${prefix}_${hash}`;
  }

  /**
   * 获取总结缓存
   * @param {number} chatId - 群组ID
   * @param {number} messageCount - 消息数量
   * @param {number} latestMessageDate - 最新消息时间
   * @returns {Object|null} 缓存的总结
   */
  getSummaryCache(chatId, messageCount, latestMessageDate) {
    const key = this.generateCacheKey('summary', {
      chatId,
      messageCount,
      latestMessageDate
    });

    logger.debug('查找总结缓存', {
      chatId,
      messageCount,
      latestMessageDate,
      cacheKey: key,
      availableKeys: this.summaryCache.keys()
    });

    const cached = this.summaryCache.get(key);
    if (cached) {
      logger.info(`找到总结缓存: ${chatId} (${messageCount}条消息)`, {
        cacheKey: key,
        cachedAt: cached.cached_at ? new Date(cached.cached_at).toISOString() : 'unknown'
      });
      return {
        ...cached,
        fromCache: true
      };
    }

    logger.info(`未找到总结缓存: ${chatId} (${messageCount}条消息)`, {
      searchKey: key,
      availableKeys: this.summaryCache.keys().length
    });
    return null;
  }

  /**
   * 设置总结缓存
   * @param {number} chatId - 群组ID
   * @param {number} messageCount - 消息数量
   * @param {number} latestMessageDate - 最新消息时间
   * @param {Object} summary - 总结结果
   */
  setSummaryCache(chatId, messageCount, latestMessageDate, summary) {
    const key = this.generateCacheKey('summary', {
      chatId,
      messageCount,
      latestMessageDate
    });

    // 添加缓存时间戳
    const cacheData = {
      ...summary,
      cached_at: Date.now(),
      cache_key: key
    };

    this.summaryCache.set(key, cacheData);
    this.summaryKeyChat.set(key, chatId);

    logger.success(`总结缓存已保存: ${chatId} (${messageCount}条消息)`);
  }

  /**
   * 获取统计信息缓存
   * @param {number} chatId - 群组ID
   * @returns {Object|null} 缓存的统计信息
   */
  getStatsCache(chatId) {
    const key = `stats_${chatId}`;
    const cached = this.statsCache.get(key);
    
    if (cached) {
      logger.info(`找到统计缓存: ${chatId}`);
      return cached;
    }
    
    return null;
  }

  /**
   * 设置统计信息缓存
   * @param {number} chatId - 群组ID
   * @param {Object} stats - 统计信息
   */
  setStatsCache(chatId, stats) {
    const key = `stats_${chatId}`;
    this.statsCache.set(key, {
      ...stats,
      cached_at: Date.now()
    });
    logger.success(`统计缓存已保存: ${chatId}`);
  }

  /**
   * 获取用户信息缓存
   * @param {number} chatId - 群组ID
   * @param {number} limit - 用户数量限制
   * @returns {Object|null} 缓存的用户数据 - { users: Array, cached_at: number }
   */
  getUserCache(chatId, limit = 10) {
    const key = `users_${chatId}_${limit}`;
    const cached = this.userCache.get(key);
    
    if (cached) {
      logger.info(`找到用户缓存: ${chatId} (top ${limit}, ${cached.users?.length || 0} 个用户)`);
      return cached;
    }
    
    return null;
  }

  /**
   * 设置用户信息缓存
   * @param {number} chatId - 群组ID
   * @param {number} limit - 用户数量限制
   * @param {Array} users - 用户数组
   */
  setUserCache(chatId, limit, users) {
    const key = `users_${chatId}_${limit}`;
    
    // 确保 users 是数组
    const userArray = Array.isArray(users) ? users : [];
    
    this.userCache.set(key, {
      users: userArray,
      cached_at: Date.now()
    });
    logger.success(`用户缓存已保存: ${chatId} (top ${limit}, ${userArray.length} 个用户)`);
  }

  /**
   * 检查是否可以进行 API 请求（防止过于频繁的请求）
   * @param {number} chatId - 群组ID
   * @param {number} userId - 用户ID
   * @returns {boolean} 是否可以进行请求
   */
  canMakeAPIRequest(chatId, userId) {
    const key = `api_limit_${chatId}_${userId}`;
    const lastRequest = this.userCache.get(key);
    
    const now = Date.now();
    const cooldownPeriod = CACHE_TTLS.API_COOLDOWN_MS;
    
    if (lastRequest && (now - lastRequest) < cooldownPeriod) {
    const remainingTime = Math.ceil((cooldownPeriod - (now - lastRequest)) / 1000 / 60);
    logger.warn(`API 请求过于频繁: 用户${userId} 在群组${chatId}，还需等待${remainingTime}分钟`);
    return false;
  }
    
    logger.info(`API 请求频率检查通过: 用户${userId} 在群组${chatId}`);
    return true;
  }

  /**
   * 标记API请求开始（只有在真正开始处理时才调用）
   * @param {number} chatId - 群组ID
   * @param {number} userId - 用户ID
   */
  markAPIRequestStarted(chatId, userId) {
    const key = `api_limit_${chatId}_${userId}`;
    const now = Date.now();
    this.userCache.set(key, now, CACHE_TTLS.API_LIMIT_TTL_SECONDS);
    logger.info(`API 请求已标记开始: 用户${userId} 在群组${chatId}`);
  }

  /**
   * 获取 API 冷却剩余时间（毫秒）
   * @param {number} chatId - 群组ID
   * @param {number} userId - 用户ID
   * @returns {number} 剩余时间（毫秒）
   */
  getApiCooldownRemaining(chatId, userId) {
    const key = `api_limit_${chatId}_${userId}`;
    const lastRequest = this.userCache.get(key);

    if (!lastRequest) {
      return 0;
    }

    const elapsed = Date.now() - lastRequest;
    const remaining = CACHE_TTLS.API_COOLDOWN_MS - elapsed;
    return remaining > 0 ? remaining : 0;
  }

  /**
   * 重置 API 冷却（任务失败时退还，用户可立即重试）
   * @param {number} chatId - 群组ID
   * @param {number} userId - 用户ID
   */
  resetApiCooldown(chatId, userId) {
    const key = `api_limit_${chatId}_${userId}`;
    this.userCache.del(key);
    logger.info(`API 请求冷却已退还: 用户${userId} 在群组${chatId}`);
  }

  /**
   * 清除特定群组的缓存
   * @param {number} chatId - 群组ID
   */
  clearChatCache(chatId) {
    // 总结缓存键为 MD5 哈希，通过索引精确清除该群组的所有键
    for (const [key, ownerChatId] of this.summaryKeyChat) {
      if (ownerChatId === chatId) {
        this.summaryCache.del(key); // 触发 'del' 事件同步清理索引
        this.summaryKeyChat.delete(key);
      }
    }

    // 统计缓存键唯一，直接删除
    this.statsCache.del(`stats_${chatId}`);

    // 用户缓存按 "前缀_chatId_" 精确匹配，避免 chatId 前缀相同的其它群组被误删
    const userKeys = this.userCache.keys().filter(
      (key) => key.startsWith(`users_${chatId}_`) || key.startsWith(`api_limit_${chatId}_`)
    );
    userKeys.forEach((key) => this.userCache.del(key));

    // 一并清除该群组的发送受限熔断标记（管理员显式覆盖，权限修复后可立即恢复推送）
    this.userCache.del(`chat_send_restricted_${chatId}`);

    logger.info(`已清除群组 ${chatId} 的所有缓存`);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    this.summaryCache.flushAll();
    this.statsCache.flushAll();
    this.userCache.flushAll();
    this.summaryKeyChat.clear();
    logger.info('已清除所有缓存');
  }

  /**
   * 获取缓存统计信息
   * @returns {Object} 缓存统计
   */
  getCacheStats() {
    return {
      summary: {
        keys: this.summaryCache.keys().length,
        hits: this.summaryCache.getStats().hits,
        misses: this.summaryCache.getStats().misses
      },
      stats: {
        keys: this.statsCache.keys().length,
        hits: this.statsCache.getStats().hits,
        misses: this.statsCache.getStats().misses
      },
      users: {
        keys: this.userCache.keys().length,
        hits: this.userCache.getStats().hits,
        misses: this.userCache.getStats().misses
      }
    };
  }

  /**
   * 设置自定义缓存
   * @param {string} key - 缓存键
   * @param {*} value - 缓存值
   * @param {number} ttl - 生存时间（秒）
   */
  setCustomCache(key, value, ttl = 300) {
    this.userCache.set(key, value, ttl);
    logger.info(`自定义缓存已设置: ${key} (TTL: ${ttl}s)`);
  }

  /**
   * 获取自定义缓存
   * @param {string} key - 缓存键
   * @returns {*} 缓存值
   */
  getCustomCache(key) {
    return this.userCache.get(key);
  }

  /**
   * 关闭缓存服务
   */
  close() {
    this.summaryCache.close();
    this.statsCache.close();
    this.userCache.close();
    logger.info('缓存服务已关闭');
  }
}

module.exports = new CacheService(); 
