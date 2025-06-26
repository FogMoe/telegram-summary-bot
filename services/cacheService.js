/**
 * 缓存服务模块
 * 使用内存缓存防止 API 过度请求
 */

const NodeCache = require('node-cache');
const crypto = require('crypto');
const logger = require('../utils/logger');

class CacheService {
  constructor() {
    // 创建多个缓存实例用于不同类型的数据
    this.summaryCache = new NodeCache({
      stdTTL: 30 * 60, // 总结缓存30分钟
      checkperiod: 5 * 60, // 每5分钟检查过期项
      useClones: false
    });

    this.statsCache = new NodeCache({
      stdTTL: 10 * 60, // 统计缓存10分钟
      checkperiod: 2 * 60,
      useClones: false
    });

    this.userCache = new NodeCache({
      stdTTL: 60 * 60, // 用户信息缓存1小时
      checkperiod: 10 * 60,
      useClones: false
    });

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
      logger.info(`总结缓存已过期: ${key}`);
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

    const cached = this.summaryCache.get(key);
    if (cached) {
      logger.info(`找到总结缓存: ${chatId} (${messageCount}条消息)`);
      return {
        ...cached,
        fromCache: true
      };
    }

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
    const cooldownPeriod = 5 * 60 * 1000; // 5分钟冷却期
    
    if (lastRequest && (now - lastRequest) < cooldownPeriod) {
      const remainingTime = Math.ceil((cooldownPeriod - (now - lastRequest)) / 1000 / 60);
      logger.warn(`API 请求过于频繁: 用户${userId} 在群组${chatId}，还需等待${remainingTime}分钟`);
      return false;
    }
    
    // 记录本次请求时间
    this.userCache.set(key, now, 10 * 60); // 10分钟过期
    return true;
  }

  /**
   * 清除特定群组的缓存
   * @param {number} chatId - 群组ID
   */
  clearChatCache(chatId) {
    const keys = [
      ...this.summaryCache.keys().filter(key => key.includes(`${chatId}`)),
      ...this.statsCache.keys().filter(key => key.includes(`${chatId}`)),
      ...this.userCache.keys().filter(key => key.includes(`${chatId}`))
    ];

    keys.forEach(key => {
      if (key.includes('summary')) this.summaryCache.del(key);
      if (key.includes('stats')) this.statsCache.del(key);
      if (key.includes('users') || key.includes('api_limit')) this.userCache.del(key);
    });

    logger.info(`已清除群组 ${chatId} 的所有缓存`);
  }

  /**
   * 清除所有缓存
   */
  clearAllCache() {
    this.summaryCache.flushAll();
    this.statsCache.flushAll();
    this.userCache.flushAll();
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