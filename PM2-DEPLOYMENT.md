# PM2 部署教程

本文档详细介绍如何使用 PM2 进程管理器在生产环境中部署 Telegram Summary Bot。

## 🚀 什么是 PM2？

PM2 是一个功能强大的 Node.js 进程管理器，具有以下特性：

- ✅ **进程守护** - 自动重启崩溃的应用程序
- ✅ **负载均衡** - 支持集群模式，充分利用多核CPU
- ✅ **日志管理** - 自动日志轮转和管理
- ✅ **监控面板** - 实时监控应用性能和状态
- ✅ **零停机重启** - 不中断服务的情况下更新应用
- ✅ **开机自启** - 系统重启后自动启动应用

## 📋 部署前准备

### 系统要求

- **Node.js** >= 16.0.0
- **npm** 或 **yarn**
- **Linux/macOS/Windows** 服务器
- **足够的内存** (建议至少 512MB)

### 检查环境

```bash
# 检查 Node.js 版本
node --version

# 检查 npm 版本
npm --version

# 检查当前目录
pwd
```

## 🔧 安装 PM2

### 全局安装 PM2

```bash
# 使用 npm 安装
npm install -g pm2

# 或使用 yarn 安装
yarn global add pm2

# 验证安装
pm2 --version
```

### 更新 PM2

```bash
# 更新到最新版本
npm install -g pm2@latest

# 更新 PM2 运行时
pm2 update
```

## ⚙️ 配置 PM2

### 创建 PM2 配置文件

在项目根目录创建 `ecosystem.config.js` 文件：

```javascript
module.exports = {
  apps: [{
    // 应用基本配置
    name: 'telegram-summary-bot',
    script: './bot.js',
    
    // 运行环境
    node_args: '--max-old-space-size=512',
    
    // 实例配置
    instances: 1,
    exec_mode: 'fork',
    
    // 自动重启配置
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    
    // 环境变量
    env: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    
    // 日志配置
    log_file: './logs/combined.log',
    out_file: './logs/out.log',
    error_file: './logs/error.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // 其他配置
    kill_timeout: 5000,
    restart_delay: 1000,
    max_restarts: 10,
    min_uptime: '10s'
  }]
};
```

### 开发环境配置示例

```javascript
module.exports = {
  apps: [{
    name: 'telegram-bot-dev',
    script: './bot.js',
    instances: 1,
    exec_mode: 'fork',
    watch: ['bot.js', 'commands/', 'middleware/', 'services/', 'utils/'],
    ignore_watch: ['node_modules', 'logs', '*.log'],
    env: {
      NODE_ENV: 'development'
    }
  }]
};
```

## 🚀 部署步骤

### 1. 准备项目文件

```bash
# 克隆项目（如果还没有）
git clone https://github.com/FogMoe/telegram-summary-bot
cd telegram-summary-bot

# 安装依赖
npm install --production

# 创建日志目录
mkdir -p logs

# 配置环境变量
cp env.example .env
# 编辑 .env 文件，填入正确的配置
```

### 2. 启动应用

```bash
# 方式1: 使用自动化部署脚本（推荐）
npm run pm2:deploy

# 方式2: 使用配置文件启动
pm2 start ecosystem.config.js --env production

# 方式3: 使用 npm 脚本启动
npm run pm2:start

# 方式4: 直接启动
pm2 start bot.js --name "telegram-summary-bot"
```

### 3. 验证部署

```bash
# 查看应用状态
pm2 status

# 查看应用详情
pm2 show telegram-summary-bot

# 查看实时日志
pm2 logs telegram-summary-bot
```

## 📊 PM2 常用命令

### NPM 脚本命令（推荐）

项目已预配置了 PM2 相关的 npm 脚本，使用更加方便：

```bash
# 自动化部署（推荐）
npm run pm2:deploy

# 应用管理
npm run pm2:start    # 启动生产环境
npm run pm2:dev      # 启动开发环境
npm run pm2:stop     # 停止应用
npm run pm2:restart  # 重启应用
npm run pm2:delete   # 删除应用

# 监控和日志
npm run pm2:status   # 查看状态
npm run pm2:logs     # 查看日志
npm run pm2:monit    # 监控面板
```

### 原生 PM2 命令

```bash
# 启动应用
pm2 start ecosystem.config.js --env production
pm2 start bot.js --name "my-bot"

# 停止应用
pm2 stop telegram-summary-bot
pm2 stop all

# 重启应用
pm2 restart telegram-summary-bot
pm2 restart all

# 重新加载应用（零停机）
pm2 reload telegram-summary-bot

# 删除应用
pm2 delete telegram-summary-bot
pm2 delete all
```

### 监控命令

```bash
# 查看应用列表
pm2 list
pm2 ls

# 查看应用状态
pm2 status

# 实时监控面板
pm2 monit

# 查看应用详情
pm2 show <app-name>
pm2 describe <app-id>
```

### 日志管理

```bash
# 查看所有日志
pm2 logs

# 查看特定应用日志
pm2 logs telegram-summary-bot

# 清空日志
pm2 flush

# 重新加载日志
pm2 reloadLogs
```

### 进程管理

```bash
# 保存当前进程列表
pm2 save

# 从保存的列表恢复进程
pm2 resurrect

# 清空进程列表
pm2 kill
```

## 🔄 自动启动配置

### 设置开机自启

```bash
# 生成启动脚本
pm2 startup

# 按照提示执行相应的命令（通常需要 sudo）
# 例如：sudo env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u username --hp /home/username

# 保存当前进程列表
pm2 save

# 禁用自启动
pm2 unstartup systemd
```

### Windows 系统自启动

```bash
# 安装 pm2-windows-startup
npm install -g pm2-windows-startup

# 设置自启动
pm2-startup install

# 保存配置
pm2 save
```

## 📈 监控和维护

### 性能监控

```bash
# 实时监控面板
pm2 monit

# 查看CPU和内存使用情况
pm2 list

# Web 监控面板（可选）
pm2 web
```

### 内存监控配置

在 `ecosystem.config.js` 中配置内存限制：

```javascript
{
  max_memory_restart: '512M',  // 超过512MB自动重启
  min_uptime: '10s',           // 最小运行时间
  max_restarts: 10,            // 最大重启次数
}
```

### 日志轮转配置

安装 PM2 日志轮转模块：

```bash
# 安装日志轮转模块
pm2 install pm2-logrotate

# 配置日志轮转
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 30
pm2 set pm2-logrotate:compress true
```

## 🔧 高级配置

### 集群模式（可选）

如果需要更高的性能，可以启用集群模式：

```javascript
module.exports = {
  apps: [{
    name: 'telegram-summary-bot',
    script: './bot.js',
    instances: 'max',  // 或指定数量如 2
    exec_mode: 'cluster',
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

### 多环境配置

```javascript
module.exports = {
  apps: [{
    name: 'telegram-summary-bot',
    script: './bot.js',
    instances: 1,
    env: {
      NODE_ENV: 'development'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000
    },
    env_staging: {
      NODE_ENV: 'staging',
      PORT: 3001
    }
  }]
};
```

启动特定环境：

```bash
# 启动生产环境
pm2 start ecosystem.config.js --env production

# 启动测试环境
pm2 start ecosystem.config.js --env staging
```

## 🛠️ 故障排除

### 常见问题

1. **应用无法启动**
   ```bash
   # 检查应用日志
   pm2 logs telegram-summary-bot
   
   # 检查配置文件语法
   node -c ecosystem.config.js
   ```

2. **内存泄漏**
   ```bash
   # 检查内存使用
   pm2 monit
   
   # 设置内存限制
   pm2 restart telegram-summary-bot --max-memory-restart 512M
   ```

3. **端口占用**
   ```bash
   # 检查端口使用情况
   netstat -tlnp | grep :3000
   
   # 杀死占用端口的进程
   pm2 delete telegram-summary-bot
   ```

### 调试模式

```bash
# 启用调试模式
pm2 start bot.js --name "debug-bot" -- --inspect

# 查看调试信息
pm2 logs debug-bot
```

## 📊 性能优化

### 内存优化

```javascript
{
  node_args: [
    '--max-old-space-size=512',  // 设置最大堆内存
    '--gc-interval=100'          // GC 间隔
  ]
}
```

### CPU 优化

```javascript
{
  instances: 'max',        // 使用所有CPU核心
  exec_mode: 'cluster'     // 集群模式
}
```

## 🔐 安全建议

1. **文件权限**
   ```bash
   # 设置适当的文件权限
   chmod 600 .env
   chmod 755 bot.js
   ```

2. **用户权限**
   ```bash
   # 创建专用用户
   sudo useradd -m -s /bin/bash botuser
   sudo su - botuser
   ```

3. **防火墙配置**
   ```bash
   # 只开放必要端口
   sudo ufw allow ssh
   sudo ufw enable
   ```

## 📚 参考资源

- [PM2 官方文档](https://pm2.keymetrics.io/)
- [PM2 生态系统文档](https://pm2.keymetrics.io/docs/usage/application-declaration/)
- [Node.js 性能优化指南](https://nodejs.org/en/docs/guides/simple-profiling/)

## 💡 最佳实践

1. **定期备份**
   ```bash
   # 备份配置
   pm2 save
   cp ecosystem.config.js ecosystem.config.js.backup
   ```

2. **监控告警**
   - 设置内存使用限制
   - 配置重启次数限制
   - 启用日志轮转

3. **版本控制**
   ```bash
   # 标记部署版本
   git tag v1.0.0
   pm2 restart telegram-summary-bot
   ```

4. **渐进式部署**
   ```bash
   # 测试新版本
   pm2 start ecosystem.config.js --env staging
   # 验证无误后部署生产
   pm2 restart telegram-summary-bot --env production
   ```

## 🔥 快速参考

### 首次部署

```bash
# 1. 安装依赖
npm install --production

# 2. 配置环境变量
cp env.example .env
# 编辑 .env 文件

# 3. 一键部署（推荐）
npm run pm2:deploy
```

### 日常管理

```bash
# 查看状态
npm run pm2:status

# 查看日志
npm run pm2:logs

# 重启应用
npm run pm2:restart

# 监控面板
npm run pm2:monit
```

### 故障排除

```bash
# 停止并删除应用
npm run pm2:delete

# 重新部署
npm run pm2:deploy

# 查看详细错误信息
pm2 logs telegram-summary-bot --lines 100
```

---

🎉 **恭喜！** 通过以上配置，您的 Telegram Summary Bot 将在生产环境中稳定运行，具备自动重启、日志管理、性能监控等企业级特性。 