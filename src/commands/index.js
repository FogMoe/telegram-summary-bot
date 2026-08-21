/**
 * 命令注册器
 * 显式声明命令模块列表并统一注册
 * 注意：保持字母序，与帮助信息中的命令列表顺序一致
 */

const logger = require('../utils/logger');
const { registerCommand } = require('../utils/commandRegistry');

// 显式命令模块清单（按字母序排列）
const COMMAND_MODULE_PATHS = [
  './admin',
  './help',
  './start',
  './status',
  './summary'
];

function requireCommandModules() {
  return COMMAND_MODULE_PATHS.map((modulePath) => {
    try {
      return require(modulePath);
    } catch (error) {
      logger.error(`加载命令模块失败: ${modulePath}`, error);
      return null;
    }
  }).filter((module) => module && module.command && module.handler);
}

/**
 * 加载并注册所有命令模块
 * @param {Telegraf} bot - Telegraf 机器人实例
 */
function loadCommands(bot) {
  logger.info('正在加载命令模块...');

  for (const commandModule of requireCommandModules()) {
    bot.command(commandModule.command, commandModule.handler);
    registerCommand(commandModule.command);
    logger.success(`已加载命令: /${commandModule.command} - ${commandModule.description || '无描述'}`);
  }

  logger.success('命令模块加载完成！');
}

/**
 * 获取所有可用命令的信息
 * @returns {Array} 命令信息数组
 */
function getAvailableCommands() {
  return requireCommandModules().map((module) => ({
    command: module.command,
    description: module.description || '无描述'
  }));
}

module.exports = {
  loadCommands,
  getAvailableCommands
};
