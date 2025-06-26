# Telegram Summary Bot

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![GitHub Issues](https://img.shields.io/github/issues/FogMoe/telegram-summary-bot.svg)](https://github.com/FogMoe/telegram-summary-bot/issues)

一个智能的 Telegram 群组聊天总结机器人，采用 Azure OpenAI 技术，能够自动分析和总结群组聊天记录。

> 🤖 **开源项目** | 🌍 **多语言支持** | 🧠 **AI 驱动** | 🔒 **隐私保护**

## 🚀 核心功能

- 🤖 **智能总结** - 使用 Azure OpenAI 分析群组聊天记录
- 🌍 **多语言支持** - 自动检测群组语言并使用相应语言回复
- 📊 **消息分析** - 支持 1-1000 条消息的深度分析
- 💾 **自动存储** - 实时监听并存储群组消息
- 🔄 **智能缓存** - 防止 API 过度请求，提升响应速度
- 📈 **用户统计** - 分析活跃用户和参与度
- 🛡️ **安全防护** - 多层安全中间件保护
- 🔧 **模块化设计** - 易于扩展和维护

## 📝 命令列表

- `/start` - 显示欢迎信息和使用说明
- `/help` - 获取详细帮助信息
- `/summary [数量]` - 总结群组最近的聊天记录
- `/status` - 查看机器人和服务状态

## 开始使用

### 1. 克隆项目

```bash
git clone https://github.com/FogMoe/telegram-summary-bot.git
cd telegram-summary-bot
```

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

1. **创建 Telegram 机器人**：
   - 在 Telegram 中找到 [@BotFather](https://t.me/botfather)
   - 发送 `/newbot` 创建新机器人
   - 按照提示设置机器人名称和用户名
   - 获取机器人 Token

2. **配置 Azure OpenAI**：
   - 在 Azure 门户创建 OpenAI 资源
   - 部署 GPT 模型（建议 gpt-4o 或 gpt-4.1）
   - 获取 API 密钥、端点和部署名称

3. **设置环境变量**：
   ```bash
   cp env.example .env
   ```
   编辑 `.env` 文件，配置以下变量：
   ```env
   # Telegram Bot Token
   BOT_TOKEN=your_bot_token_here
   
   # Azure OpenAI 配置
   AZURE_OPENAI_API_KEY=your_azure_openai_api_key
   AZURE_OPENAI_ENDPOINT=https://your-resource.openai.azure.com/
   AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment_name
   AZURE_OPENAI_API_VERSION=2024-10-01-preview
   
   # 管理员用户ID（可以访问 /status 命令）
   ADMIN_USER_IDS=123456789,987654321
   ```
   
   **获取用户ID的方法**：
   - 在任何聊天中发送 `/start` 命令，机器人会显示您的用户ID
   - 多个管理员ID用逗号分隔

### 4. 启动机器人

```bash
npm start
```

或者使用开发模式：

```bash
npm run dev
```

### 🏭 生产环境部署

如需在生产环境中部署，推荐使用 PM2 进程管理器：

**[📖 PM2 部署教程](PM2-DEPLOYMENT.md)** - 完整的生产环境部署指南

快速启动生产环境：

```bash
# 安装 PM2
npm install -g pm2

# 使用 PM2 启动
pm2 start ecosystem.config.js

# 设置开机自启
pm2 startup
pm2 save
```

## 📁 项目结构

```
telegram-summary-bot/
├── bot.js                    # 机器人主文件
├── commands/                 # 命令模块目录
│   ├── index.js             # 命令注册器
│   ├── start.js             # /start 命令
│   ├── help.js              # /help 命令
│   ├── summary.js           # /summary 命令（群组总结）
│   └── status.js            # /status 命令（状态查询）
├── middleware/               # 中间件目录
│   ├── logging.js           # 日志中间件
│   ├── security.js          # 安全中间件
│   └── messageListener.js   # 消息监听中间件
├── services/                 # 服务模块目录
│   ├── azureOpenAI.js       # Azure OpenAI 服务
│   └── cacheService.js      # 缓存服务
├── storage/                  # 存储模块目录
│   ├── messageStore.js      # 消息存储服务
│   └── messages.db          # SQLite 数据库（自动创建）
├── utils/                    # 工具函数目录
│   ├── logger.js            # 日志工具
│   └── text.js              # 文本处理工具
├── .env                      # 环境变量文件（需要自行创建）
├── env.example               # 环境变量示例文件
├── package.json              # 项目配置文件
└── README.md                 # 项目说明文档
```

## 💬 使用说明

### 群组使用

1. **邀请机器人到群组**：
   - 将机器人添加到您的群组
   - 机器人会自动开始监听并存储消息

2. **总结聊天记录**：
   ```
   /summary          # 总结最近100条消息
   /summary 50       # 总结最近50条消息
   /summary 500      # 总结最近500条消息
   ```

3. **查看状态**：
   ```
   /status           # 查看机器人状态和群组统计
   ```

### 私聊使用

- `/start` - 查看使用说明
- `/help` - 获取命令帮助
- `/status` - 查看机器人状态

### 功能特点

- 🔄 **5分钟冷却期** - 防止频繁调用 API
- 💾 **智能缓存** - 相同参数的总结会使用缓存
- 📊 **详细统计** - 显示分析的消息数、用户数等
- 🧠 **AI 驱动** - 使用 Azure OpenAI 提供高质量总结

## 模块化设计

### 命令模块

每个命令都是一个独立的模块，位于 `commands/` 目录下。命令模块需要导出：

```javascript
module.exports = {
  command: 'command_name',      // 命令名称
  description: '命令描述',       // 命令描述
  handler: (ctx) => { ... }    // 命令处理函数
};
```

### 中间件

中间件位于 `middleware/` 目录下，提供：

- **logging.js** - 请求日志记录
- **security.js** - 安全防护（速率限制、用户验证、内容过滤）

### 工具函数

工具函数位于 `utils/` 目录下，提供：

- **logger.js** - 统一的日志记录工具
- **text.js** - 文本处理和分析工具

## 扩展机器人

### 添加新命令

1. 在 `commands/` 目录下创建新的 `.js` 文件
2. 按照命令模块格式编写代码
3. 重启机器人，新命令会自动加载

### 添加新中间件

1. 在 `middleware/` 目录下创建中间件文件
2. 在 `bot.js` 中引入并注册中间件

### 添加新工具函数

1. 在 `utils/` 目录下创建工具函数文件
2. 在需要的模块中引入使用

## 🛠️ 技术栈

- **Node.js** - JavaScript 运行时环境
- **[Telegraf.js](https://telegraf.js.org/)** - 现代化的 Telegram Bot API 框架
- **[OpenAI Node.js SDK](https://github.com/openai/openai-node)** - 官方 OpenAI/Azure OpenAI SDK
- **SQLite3** - 轻量级数据库存储消息
- **node-cache** - 内存缓存服务
- **dotenv** - 环境变量管理

## 🔒 安全特性

- 🚦 **API 限流** - 5分钟冷却期防止过度调用
- 🔒 **用户验证** - 支持黑名单和权限控制
- 🛡️ **内容过滤** - 自动过滤不当内容
- 📝 **详细日志** - 完整的操作和错误日志记录
- 💾 **数据保护** - 自动清理旧数据，保护用户隐私

## 🗄️ 数据管理

- **消息存储** - 每个群组最多保留2000条消息
- **数据清理** - 自动删除7天前的消息
- **缓存机制** - 总结缓存30分钟，统计缓存10分钟
- **数据库优化** - 定期执行 VACUUM 回收存储空间

## ⚠️ 注意事项

### 安全须知
- ❗ **请务必保护好 `.env` 文件**，不要提交到版本控制系统
- 🔑 **Azure OpenAI API 密钥是敏感信息**，请妥善保管
- 📝 **机器人会记录用户活动**，请遵守相关隐私法规

### 部署建议
- 🚀 **生产环境**推荐使用 PM2 等进程管理器 → [查看 PM2 部署教程](PM2-DEPLOYMENT.md)
- 🔄 **定期备份**重要的聊天数据
- 📊 **监控 API 使用量**，避免超出配额

### 限制说明
- 📱 **总结功能仅在群组中可用**
- 🔢 **消息数量限制** 1-1000 条
- 📏 **消息长度限制** 最多50,000字符，超出时自动提示减少消息数量
- ⏰ **每用户每群组5分钟冷却期**
- 💾 **机器人只存储加入后的消息**

## 🌍 多语言支持

机器人具备智能语言检测功能，可以自动识别群组聊天的主要语言并使用相应语言提供总结。

### 支持的语言
- **中文**：简体中文、繁体中文
- **英语**：English
- **日语**：日本語
- **韩语**：한국어
- **西班牙语**：Español
- **法语**：Français
- **德语**：Deutsch
- **俄语**：Русский
- **其他语言**：葡萄牙语、意大利语、阿拉伯语、泰语、越南语、印尼语、马来语、土耳其语、荷兰语、波兰语、匈牙利语等

### 工作原理
1. **自动检测**：分析群组聊天记录中的文字特征
2. **语言识别**：基于字符模式和语言特征识别主要语言
3. **本地化回复**：使用检测到的语言生成总结和提示

## 🤝 贡献

我们欢迎所有形式的贡献！请查看 [贡献指南](CONTRIBUTING.md) 了解如何参与项目开发。

- 🐛 [报告问题](https://github.com/FogMoe/telegram-summary-bot/issues)
- 💡 [提交功能请求](https://github.com/FogMoe/telegram-summary-bot/issues)
- 🔧 [提交代码更改](https://github.com/FogMoe/telegram-summary-bot/pulls)

## 📄 许可证

本项目基于 [GPL-3.0](LICENSE) 许可证开源。