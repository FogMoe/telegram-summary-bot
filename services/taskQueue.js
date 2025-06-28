/**
 * 任务队列服务
 * 异步处理耗时任务，避免阻塞主线程
 */

const EventEmitter = require('events');
const logger = require('../utils/logger');

class TaskQueue extends EventEmitter {
  constructor() {
    super();
    this.queue = [];
    this.processing = false;
    this.currentTask = null;
    this.taskResults = new Map(); // 存储任务结果
    this.taskStatus = new Map(); // 存储任务状态
  }

  /**
   * 添加总结任务到队列
   * @param {Object} taskData - 任务数据
   * @returns {string} 任务ID
   */
  addSummaryTask(taskData) {
    const taskId = this.generateTaskId();
    const task = {
      id: taskId,
      type: 'summary',
      data: taskData,
      createdAt: Date.now(),
      status: 'queued'
    };

    this.queue.push(task);
    this.taskStatus.set(taskId, task);
    
    logger.info('总结任务已加入队列', {
      taskId,
      chatId: taskData.chatId,
      userId: taskData.userId,
      messageCount: taskData.messageCount,
      queueLength: this.queue.length
    });

    // 开始处理队列
    this.processQueue();
    
    return taskId;
  }

  /**
   * 处理任务队列
   */
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    while (this.queue.length > 0) {
      const task = this.queue.shift();
      this.currentTask = task;
      
      try {
        await this.processTask(task);
      } catch (error) {
        logger.error('任务处理失败', {
          taskId: task.id,
          error: error.message
        });
        
        this.setTaskResult(task.id, {
          success: false,
          error: error.message,
          timestamp: Date.now()
        });
      }
      
      this.currentTask = null;
    }

    this.processing = false;
  }

  /**
   * 处理单个任务
   * @param {Object} task - 任务对象
   */
  async processTask(task) {
    logger.info('开始处理任务', {
      taskId: task.id,
      type: task.type
    });

    // 更新任务状态
    task.status = 'processing';
    this.taskStatus.set(task.id, task);
    
    // 通知任务开始处理
    this.emit('taskStarted', task);

    if (task.type === 'summary') {
      await this.processSummaryTask(task);
    }
  }

  /**
   * 处理总结任务
   * @param {Object} task - 总结任务
   */
  async processSummaryTask(task) {
    const { chatId, userId, messages, stats, topUsers, messageCount } = task.data;
    
    try {
      // 导入 azureOpenAI 服务
      const azureOpenAI = require('./azureOpenAI');
      
      // 生成总结
      const summaryResult = await azureOpenAI.summarizeMessages(
        messages,
        stats,
        topUsers
      );

      // 保存任务结果
      this.setTaskResult(task.id, {
        success: true,
        data: summaryResult,
        timestamp: Date.now()
      });

      // 缓存结果
      const cacheService = require('./cacheService');
      cacheService.setSummaryCache(
        chatId,
        messageCount,
        stats.latest_message,
        summaryResult
      );

      logger.success('总结任务完成', {
        taskId: task.id,
        chatId,
        messageCount,
        tokensUsed: summaryResult.metadata?.tokensUsed
      });

      // 通知任务完成
      this.emit('taskCompleted', {
        taskId: task.id,
        chatId,
        userId,
        result: summaryResult
      });

    } catch (error) {
      logger.error('总结任务失败', {
        taskId: task.id,
        chatId,
        error: error.message
      });

      this.setTaskResult(task.id, {
        success: false,
        error: error.message,
        timestamp: Date.now()
      });

      // 通知任务失败
      this.emit('taskFailed', {
        taskId: task.id,
        chatId,
        userId,
        error: error.message
      });
    }
  }

  /**
   * 获取任务状态
   * @param {string} taskId - 任务ID
   * @returns {Object|null} 任务状态
   */
  getTaskStatus(taskId) {
    return this.taskStatus.get(taskId) || null;
  }

  /**
   * 获取任务结果
   * @param {string} taskId - 任务ID
   * @returns {Object|null} 任务结果
   */
  getTaskResult(taskId) {
    return this.taskResults.get(taskId) || null;
  }

  /**
   * 设置任务结果
   * @param {string} taskId - 任务ID
   * @param {Object} result - 结果对象
   */
  setTaskResult(taskId, result) {
    this.taskResults.set(taskId, result);
    
    // 更新任务状态
    const task = this.taskStatus.get(taskId);
    if (task) {
      task.status = result.success ? 'completed' : 'failed';
      task.completedAt = Date.now();
      this.taskStatus.set(taskId, task);
    }

    // 10分钟后清理结果
    setTimeout(() => {
      this.taskResults.delete(taskId);
      this.taskStatus.delete(taskId);
    }, 10 * 60 * 1000);
  }

  /**
   * 生成任务ID
   * @returns {string} 唯一任务ID
   */
  generateTaskId() {
    return `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * 获取队列状态
   * @returns {Object} 队列统计信息
   */
  getQueueStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      currentTask: this.currentTask ? {
        id: this.currentTask.id,
        type: this.currentTask.type,
        status: this.currentTask.status,
        createdAt: this.currentTask.createdAt
      } : null,
      totalTasks: this.taskStatus.size
    };
  }

  /**
   * 清理过期任务
   */
  cleanup() {
    const now = Date.now();
    const expireTime = 30 * 60 * 1000; // 30分钟

    for (const [taskId, task] of this.taskStatus.entries()) {
      if (now - task.createdAt > expireTime) {
        this.taskStatus.delete(taskId);
        this.taskResults.delete(taskId);
      }
    }
  }
}

module.exports = new TaskQueue(); 