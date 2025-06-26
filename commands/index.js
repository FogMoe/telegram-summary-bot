/**
 * 命令注册器
 * 自动加载并注册所有命令模块
 */

const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

/**
 * 自动加载命令模块
 * @param {Telegraf} bot - Telegraf 机器人实例
 */
function loadCommands(bot) {
  const commandsDir = __dirname;
  const commandFiles = fs.readdirSync(commandsDir)
    .filter(file => file.endsWith('.js') && file !== 'index.js');
  
  logger.info('正在加载命令模块...');
  
  commandFiles.forEach(file => {
    try {
      const commandModule = require(path.join(commandsDir, file));
      
      if (commandModule.command && commandModule.handler) {
        // 注册命令
        bot.command(commandModule.command, commandModule.handler);
        logger.success(`已加载命令: /${commandModule.command} - ${commandModule.description || '无描述'}`);
      } else {
        logger.warn(`跳过无效的命令模块: ${file}`);
      }
    } catch (error) {
      logger.error(`加载命令模块失败: ${file}`, error);
    }
  });
  
  logger.success('命令模块加载完成！');
}

/**
 * 获取所有可用命令的信息
 * @returns {Array} 命令信息数组
 */
function getAvailableCommands() {
  const commandsDir = __dirname;
  const commandFiles = fs.readdirSync(commandsDir)
    .filter(file => file.endsWith('.js') && file !== 'index.js');
  
  const commands = [];
  
  commandFiles.forEach(file => {
    try {
      const commandModule = require(path.join(commandsDir, file));
      
      if (commandModule.command && commandModule.handler) {
        commands.push({
          command: commandModule.command,
          description: commandModule.description || '无描述'
        });
      }
    } catch (error) {
      logger.error(`获取命令信息失败: ${file}`, error);
    }
  });
  
  return commands;
}

module.exports = {
  loadCommands,
  getAvailableCommands
}; 