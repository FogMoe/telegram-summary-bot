/**
 * 消息存储模块
 * 使用 SQLite 存储群组消息，支持自动清理
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const logger = require('../utils/logger');

class MessageStore {
  constructor() {
    this.db = null;
    this.maxMessagesPerChat = 2000; // 每个群组最多保留2000条消息
    this.maxMessageAge = 7 * 24 * 60 * 60 * 1000; // 7天
  }

  /**
   * 初始化数据库
   */
  async init() {
    try {
      const dbPath = path.join(process.cwd(), 'storage', 'messages.db');
      
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          logger.error('数据库连接失败', err);
          throw err;
        }
        logger.success('消息数据库连接成功');
      });

      await this.createTables();
      await this.setupCleanupJob();
      
    } catch (error) {
      logger.error('消息存储初始化失败', error);
      throw error;
    }
  }

  /**
   * 创建数据表
   */
  async createTables() {
    return new Promise((resolve, reject) => {
      const sql = `
        CREATE TABLE IF NOT EXISTS messages (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          message_id INTEGER NOT NULL,
          chat_id INTEGER NOT NULL,
          user_id INTEGER NOT NULL,
          username TEXT,
          first_name TEXT,
          last_name TEXT,
          text TEXT,
          date INTEGER NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE(message_id, chat_id)
        );
        
        CREATE INDEX IF NOT EXISTS idx_chat_date ON messages(chat_id, date DESC);
        CREATE INDEX IF NOT EXISTS idx_created_at ON messages(created_at);
      `;

      this.db.exec(sql, (err) => {
        if (err) {
          logger.error('创建数据表失败', err);
          reject(err);
        } else {
          logger.success('数据表创建/验证成功');
          resolve();
        }
      });
    });
  }

  /**
   * 存储消息
   * @param {Object} message - Telegram 消息对象
   * @param {number} botId - Bot的用户ID（可选，用于过滤bot消息）
   */
  async storeMessage(message, botId = null) {
    // 基础过滤条件
    if (!message.text || !message.chat || message.chat.type === 'private') {
      return; // 只存储群组的文本消息
    }

    // 过滤bot自身消息（双重保险）
    if (botId && message.from?.id === botId) {
      logger.debug('MessageStore: 过滤bot自身消息', {
        messageId: message.message_id,
        chatId: message.chat.id,
        botId: botId,
        senderId: message.from.id
      });
      return; // 不存储bot自己的消息
    }

    const sql = `
      INSERT OR IGNORE INTO messages 
      (message_id, chat_id, user_id, username, first_name, last_name, text, date)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const params = [
      message.message_id,
      message.chat.id,
      message.from.id,
      message.from.username || null,
      message.from.first_name || null,
      message.from.last_name || null,
      message.text,
      message.date
    ];

    return new Promise((resolve, reject) => {
      this.db.run(sql, params, function(err) {
        if (err) {
          logger.error('存储消息失败', err);
          reject(err);
        } else {
          // 记录成功存储的消息
          if (this.lastID) {
            logger.debug('消息存储成功', {
              messageId: message.message_id,
              chatId: message.chat.id,
              userId: message.from.id,
              dbId: this.lastID
            });
          }
          resolve(this.lastID);
        }
      });
    });
  }

  /**
   * 获取群组的最近消息
   * @param {number} chatId - 群组ID
   * @param {number} limit - 消息数量限制
   * @returns {Array} 消息列表
   */
  async getRecentMessages(chatId, limit = 100) {
    const sql = `
      SELECT message_id, user_id, username, first_name, last_name, text, date
      FROM messages 
      WHERE chat_id = ? 
      ORDER BY date DESC 
      LIMIT ?
    `;

    return new Promise((resolve, reject) => {
      this.db.all(sql, [chatId, limit], (err, rows) => {
        if (err) {
          logger.error('获取消息失败', err);
          reject(err);
        } else {
          // 按时间正序返回（最早的消息在前）
          resolve(rows.reverse());
        }
      });
    });
  }

  /**
   * 获取群组消息统计信息
   * @param {number} chatId - 群组ID
   * @returns {Object} 统计信息
   */
  async getChatStats(chatId) {
    const sql = `
      SELECT 
        COUNT(*) as total_messages,
        COUNT(DISTINCT user_id) as unique_users,
        MIN(date) as earliest_message,
        MAX(date) as latest_message
      FROM messages 
      WHERE chat_id = ?
    `;

    return new Promise((resolve, reject) => {
      this.db.get(sql, [chatId], (err, row) => {
        if (err) {
          logger.error('获取统计信息失败', err);
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  /**
   * 获取群组中最活跃的用户
   * @param {number} chatId - 群组ID
   * @param {number} limit - 返回用户数量
   * @returns {Array} 用户列表
   */
  async getTopUsers(chatId, limit = 10) {
    const sql = `
      SELECT 
        user_id,
        username,
        first_name,
        last_name,
        COUNT(*) as message_count
      FROM messages 
      WHERE chat_id = ? 
      GROUP BY user_id, username, first_name, last_name
      ORDER BY message_count DESC 
      LIMIT ?
    `;

    return new Promise((resolve, reject) => {
      this.db.all(sql, [chatId, limit], (err, rows) => {
        if (err) {
          logger.error('获取活跃用户失败', err);
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * 删除指定群组的所有消息
   * @param {number} chatId - 群组ID
   * @returns {Object} 删除结果统计
   */
  async deleteChatMessages(chatId) {
    try {
      // 先获取统计信息
      const stats = await this.getChatStats(chatId);
      
      if (!stats || stats.total_messages === 0) {
        return {
          success: true,
          deletedCount: 0,
          message: '该群组没有存储的消息记录'
        };
      }

      // 删除指定群组的所有消息
      const result = await new Promise((resolve, reject) => {
        this.db.run('DELETE FROM messages WHERE chat_id = ?', [chatId], function(err) {
          if (err) {
            reject(err);
          } else {
            resolve({ changes: this.changes });
          }
        });
      });

      // 执行 VACUUM 来回收空间
      await this.executeQuery('VACUUM');

      logger.info(`成功删除群组 ${chatId} 的所有消息`, {
        chatId,
        deletedCount: result.changes,
        originalTotal: stats.total_messages
      });

      return {
        success: true,
        deletedCount: result.changes,
        originalTotal: stats.total_messages,
        message: `成功删除 ${result.changes} 条消息记录`
      };

    } catch (error) {
      logger.error(`删除群组 ${chatId} 的消息失败`, error);
      return {
        success: false,
        deletedCount: 0,
        error: error.message,
        message: '删除操作失败：' + error.message
      };
    }
  }

  /**
   * 清理旧消息
   */
  async cleanupOldMessages() {
    try {
      // 删除超过指定天数的消息
      const cutoffTime = Date.now() - this.maxMessageAge;
      const cutoffTimestamp = Math.floor(cutoffTime / 1000);

      await this.executeQuery(
        'DELETE FROM messages WHERE date < ?',
        [cutoffTimestamp]
      );

      // 为每个群组保留最新的消息，删除超出限制的旧消息
      const chats = await this.executeQuery(
        'SELECT DISTINCT chat_id FROM messages'
      );

      for (const chat of chats) {
        await this.executeQuery(`
          DELETE FROM messages 
          WHERE chat_id = ? AND id NOT IN (
            SELECT id FROM messages 
            WHERE chat_id = ? 
            ORDER BY date DESC 
            LIMIT ?
          )
        `, [chat.chat_id, chat.chat_id, this.maxMessagesPerChat]);
      }

      // 执行 VACUUM 来回收空间
      await this.executeQuery('VACUUM');
      
      logger.info('消息清理完成');
    } catch (error) {
      logger.error('消息清理失败', error);
    }
  }

  /**
   * 执行 SQL 查询的辅助方法
   */
  async executeQuery(sql, params = []) {
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          reject(err);
        } else {
          resolve(rows);
        }
      });
    });
  }

  /**
   * 设置自动清理任务
   */
  async setupCleanupJob() {
    // 每6小时执行一次清理
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldMessages();
    }, 6 * 60 * 60 * 1000);

    // 启动时执行一次清理
    this.initCleanupTimeout = setTimeout(() => {
      this.cleanupOldMessages();
    }, 10000); // 10秒后执行

    logger.info('消息自动清理任务已设置');
  }

  /**
   * 关闭数据库连接
   */
  async close() {
    // 清理定时器防止内存泄漏
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    
    if (this.initCleanupTimeout) {
      clearTimeout(this.initCleanupTimeout);
      this.initCleanupTimeout = null;
    }
    
    if (this.db) {
      return new Promise((resolve) => {
        this.db.close((err) => {
          if (err) {
            logger.error('关闭数据库连接失败', err);
          } else {
            logger.info('数据库连接已关闭');
          }
          resolve();
        });
      });
    }
  }
}

module.exports = new MessageStore(); 