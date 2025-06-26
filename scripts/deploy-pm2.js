#!/usr/bin/env node

/**
 * PM2 部署自动化脚本
 * 帮助快速部署 Telegram Summary Bot 到生产环境
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// 颜色输出工具
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

function error(message) {
  log(`❌ ${message}`, 'red');
}

function success(message) {
  log(`✅ ${message}`, 'green');
}

function warn(message) {
  log(`⚠️  ${message}`, 'yellow');
}

function info(message) {
  log(`ℹ️  ${message}`, 'blue');
}

function exec(command, options = {}) {
  try {
    const result = execSync(command, { 
      encoding: 'utf8', 
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options 
    });
    return result;
  } catch (err) {
    if (!options.silent) {
      error(`命令执行失败: ${command}`);
      error(err.message);
    }
    throw err;
  }
}

async function checkPrerequisites() {
  info('检查部署环境...');
  
  // 检查 Node.js
  try {
    const nodeVersion = exec('node --version', { silent: true }).trim();
    success(`Node.js 版本: ${nodeVersion}`);
  } catch (err) {
    error('未安装 Node.js，请先安装 Node.js >= 16.0.0');
    process.exit(1);
  }
  
  // 检查 PM2
  try {
    const pm2Version = exec('pm2 --version', { silent: true }).trim();
    success(`PM2 版本: ${pm2Version}`);
  } catch (err) {
    warn('未安装 PM2，正在安装...');
    try {
      exec('npm install -g pm2');
      success('PM2 安装成功');
    } catch (installErr) {
      error('PM2 安装失败，请手动安装: npm install -g pm2');
      process.exit(1);
    }
  }
  
  // 检查环境变量文件
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    error('未找到 .env 文件，请先配置环境变量');
    info('请复制 env.example 为 .env 并配置相关变量');
    process.exit(1);
  }
  success('环境变量文件存在');
  
  // 检查配置文件
  const configPath = path.join(process.cwd(), 'ecosystem.config.js');
  if (!fs.existsSync(configPath)) {
    error('未找到 ecosystem.config.js 文件');
    process.exit(1);
  }
  success('PM2 配置文件存在');
}

async function setupLogs() {
  info('创建日志目录...');
  const logsDir = path.join(process.cwd(), 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
    success('日志目录创建成功');
  } else {
    success('日志目录已存在');
  }
}

async function installDependencies() {
  info('安装生产环境依赖...');
  exec('npm install --production');
  success('依赖安装完成');
}

async function deployApp() {
  info('部署应用到 PM2...');
  
  try {
    // 检查是否已经有运行的实例
    exec('pm2 describe telegram-summary-bot', { silent: true });
    warn('发现已运行的实例，正在重启...');
    exec('pm2 restart telegram-summary-bot');
    success('应用重启成功');
  } catch (err) {
    // 没有运行实例，启动新的
    info('启动新的应用实例...');
    exec('pm2 start ecosystem.config.js --env production');
    success('应用启动成功');
  }
}

async function setupStartup() {
  info('配置开机自启动...');
  
  try {
    // 检查是否已配置自启动
    const startupInfo = exec('pm2 startup', { silent: true });
    if (startupInfo.includes('already')) {
      success('开机自启动已配置');
    } else {
      warn('请按照提示执行 sudo 命令来配置开机自启动');
      log(startupInfo);
    }
    
    // 保存当前进程列表
    exec('pm2 save');
    success('进程列表已保存');
    
  } catch (err) {
    warn('自启动配置失败，请手动执行: pm2 startup && pm2 save');
  }
}

async function showStatus() {
  info('应用状态信息:');
  exec('pm2 status');
  
  info('实时日志 (按 Ctrl+C 退出):');
  warn('如需查看日志，请运行: pm2 logs telegram-summary-bot');
  
  success('部署完成！');
  info('常用命令:');
  log('  pm2 status                    - 查看应用状态', 'cyan');
  log('  pm2 logs telegram-summary-bot - 查看实时日志', 'cyan');
  log('  pm2 restart telegram-summary-bot - 重启应用', 'cyan');
  log('  pm2 stop telegram-summary-bot - 停止应用', 'cyan');
  log('  pm2 monit                     - 监控面板', 'cyan');
}

async function main() {
  try {
    log('🚀 开始部署 Telegram Summary Bot', 'magenta');
    log('=====================================', 'magenta');
    
    await checkPrerequisites();
    await setupLogs();
    await installDependencies();
    await deployApp();
    await setupStartup();
    await showStatus();
    
    log('=====================================', 'magenta');
    log('🎉 部署成功！', 'magenta');
    
  } catch (err) {
    error('部署失败');
    error(err.message);
    process.exit(1);
  }
}

// 处理命令行参数
const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  log('PM2 部署脚本使用说明:', 'cyan');
  log('  node scripts/deploy-pm2.js    - 执行完整部署流程', 'cyan');
  log('  node scripts/deploy-pm2.js -h - 显示帮助信息', 'cyan');
  process.exit(0);
}

// 执行主函数
main(); 