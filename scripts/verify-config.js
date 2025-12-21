#!/usr/bin/env node

/**
 * 配置验证脚本
 * 检查环境变量和服务连接
 */

require('dotenv').config();

const logger = {
  info: (msg, data) => console.log(`ℹ️  ${msg}`, data || ''),
  success: (msg, data) => console.log(`✅ ${msg}`, data || ''),
  warn: (msg, data) => console.warn(`⚠️  ${msg}`, data || ''),
  error: (msg, data) => console.error(`❌ ${msg}`, data || '')
};

async function verifyConfiguration() {
  logger.info('开始验证项目配置...\n');

  let errors = 0;

  // 检查必要的环境变量
  logger.info('1. 检查环境变量配置');
  
  const requiredEnvs = ['BOT_TOKEN'];
  const optionalEnvs = [
    'GEMINI_API_KEY',
    'AZURE_OPENAI_API_KEY',
    'AZURE_OPENAI_ENDPOINT',
    'AZURE_OPENAI_DEPLOYMENT_NAME'
  ];

  for (const env of requiredEnvs) {
    if (process.env[env]) {
      logger.success(`${env}: 已配置`);
    } else {
      logger.error(`${env}: 未配置（必需）`);
      errors++;
    }
  }

  for (const env of optionalEnvs) {
    if (process.env[env]) {
      logger.success(`${env}: 已配置`);
    } else {
      logger.warn(`${env}: 未配置（可选）`);
    }
  }

  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY);
  const azureConfigured = Boolean(
    process.env.AZURE_OPENAI_API_KEY &&
    process.env.AZURE_OPENAI_ENDPOINT &&
    process.env.AZURE_OPENAI_DEPLOYMENT_NAME
  );

  if (geminiConfigured && azureConfigured) {
    logger.success('Gemini 与 Azure OpenAI 已配置 - 总结功能可用');
  } else if (geminiConfigured) {
    logger.warn('仅配置 Gemini - 备用模型不可用');
  } else if (azureConfigured) {
    logger.warn('仅配置 Azure OpenAI - 主要模型不可用');
  } else {
    logger.warn('未配置 AI 服务 - 总结功能不可用');
  }

  console.log();

  // 检查项目依赖
  logger.info('2. 检查项目依赖');
  
  const requiredDependencies = [
    'telegraf',
    'openai', 
    'sqlite3',
    'node-cache',
    'dotenv'
  ];

  for (const dep of requiredDependencies) {
    try {
      require(dep);
      logger.success(`${dep}: 已安装`);
    } catch (error) {
      logger.error(`${dep}: 未安装或有问题`);
      errors++;
    }
  }

  console.log();

  // 检查文件结构
  logger.info('3. 检查项目文件结构');
  
  const requiredFiles = [
    'bot.js',
    'commands/index.js',
    'commands/start.js',
    'commands/help.js',
    'commands/summary.js',
    'commands/status.js',
    'middleware/logging.js',
    'middleware/security.js',
    'middleware/messageListener.js',
    'services/aiService.js',
    'services/cacheService.js',
    'storage/messageStore.js',
    'utils/logger.js',
    'utils/text.js'
  ];

  const fs = require('fs');
  const path = require('path');

  for (const file of requiredFiles) {
    const filePath = path.join(process.cwd(), file);
    if (fs.existsSync(filePath)) {
      logger.success(`${file}: 存在`);
    } else {
      logger.error(`${file}: 缺失`);
      errors++;
    }
  }

  console.log();

  // 检查存储目录
  logger.info('4. 检查存储目录');
  
  const storageDir = path.join(process.cwd(), 'storage');
  if (fs.existsSync(storageDir)) {
    logger.success('storage/ 目录存在');
  } else {
    logger.warn('storage/ 目录不存在，运行时会自动创建');
  }

  console.log();

  // 测试 AI 连接（如果配置了）
  if (geminiConfigured || azureConfigured) {
    logger.info('5. 测试 AI 服务连接');
    
    try {
      const aiService = require('../services/aiService');
      await aiService.init();
      const isConnected = await aiService.testConnection();
      
      if (isConnected) {
        logger.success('AI 服务连接测试成功');
      } else {
        logger.error('AI 服务连接测试失败');
        errors++;
      }
    } catch (error) {
      logger.error('AI 服务连接测试出错:', error.message);
      errors++;
    }

    console.log();
  }

  // 验证总结
  logger.info('=== 配置验证结果 ===');
  
  if (errors === 0) {
    logger.success(`配置验证通过！项目已就绪。`);
    logger.info('运行 "npm start" 启动机器人');
  } else {
    logger.error(`发现 ${errors} 个问题，请修复后重试。`);
    process.exit(1);
  }
}

// 运行验证
verifyConfiguration().catch(error => {
  logger.error('验证过程中发生错误:', error.message);
  process.exit(1);
}); 
