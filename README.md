# Telegram Summary Bot

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D16.0.0-brightgreen.svg)](https://nodejs.org/)
[![GitHub Issues](https://img.shields.io/github/issues/FogMoe/telegram-summary-bot.svg)](https://github.com/FogMoe/telegram-summary-bot/issues)

一个智能的 Telegram 群组聊天总结机器人，具备高可用性、多语言支持、异步处理和多层安全防护。

> 🤖 **开源项目** | 🌍 **多语言支持** | 🧠 **AI 驱动** | 🔒 **隐私保护** 

## 🚀 核心功能

- 🤖 智能总结：自动分析群组聊天
- 🔄 AI 高可用：主模型(Gemini)失败时自动切换至备用模型(Azure OpenAI)，详见文档
- ⚡ 异步任务队列：响应迅速不卡顿
- 🌍 多语言自动检测与回复
- 📊 消息与用户分析
- 💾 自动存储与缓存
- 🛡️ 多层安全防护，Markdown安全转义
- 📲 总结结果自动推送
- 🔧 模块化设计，易扩展

## 📝 命令列表

- `/start` - 欢迎信息与说明
- `/help` - 获取帮助
- `/summary [数量]` - 总结群组聊天
- `/status` - 查看机器人和服务状态
- `/admin stats|users|messages|cache|clear` - 管理员数据与缓存管理

## ⏩ 快速上手

1. 克隆项目并安装依赖：
   ```bash
   git clone https://github.com/FogMoe/telegram-summary-bot.git
   cd telegram-summary-bot
   npm install
   ```
2. 配置环境变量：
   ```bash
   cp env.example .env
   # 编辑 .env 文件，填写 Bot Token 和 AI 服务信息
   ```
3. 启动机器人：
   ```bash
   npm start
   # 或开发模式 npm run dev
   ```

> 详细AI模型、部署、生产环境、PM2 管理、环境变量说明请见 [docs/](./docs) 目录。

## 📁 项目结构

```
telegram-summary-bot/
├── bot.js                # 主程序
├── commands/             # 命令模块
├── docs/                 # 项目文档
├── middleware/           # 中间件
├── services/             # 服务层
├── storage/              # 数据存储
├── utils/                # 工具函数
├── .env                  # 环境变量（需自建）
├── package.json          # 配置文件
└── README.md             # 项目说明
```

## 🛠️ 技术栈

- Node.js
- Telegraf.js
- OpenAI Node.js SDK
- SQLite3
- node-cache
- dotenv
- EventEmitter

## 🤝 参与贡献

欢迎 Issue、PR 和建议！请阅读 [docs/CONTRIBUTING.md](./docs/CONTRIBUTING.md) 获取贡献指南。

## 📚 更多文档

- [AI模型自动切换设置指南](./docs/AI-FALLBACK-SETUP.md)
- [详细部署与生产环境](./docs/PM2-DEPLOYMENT.md)
- [贡献指南](./docs/CONTRIBUTING.md)
- [更新日志](./docs/CHANGELOG.md)
- [完整文档目录](./docs/README.md)

## 📄 许可证

本项目基于 [GPL-3.0](LICENSE) 协议开源。