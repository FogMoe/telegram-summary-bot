# Telegram Summary Bot

[![License: GPL v3](https://img.shields.io/badge/License-GPLv3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D24.0.0-brightgreen.svg)](https://nodejs.org/)
[![GitHub Issues](https://img.shields.io/github/issues/FogMoe/telegram-summary-bot.svg)](https://github.com/FogMoe/telegram-summary-bot/issues)

一个智能的 Telegram 群组聊天总结机器人，具备高可用性、多语言支持、异步处理和多层安全防护。

> 🤖 **开源项目** | 🌍 **多语言支持** | 🧠 **AI 驱动** | 🔒 **隐私保护** 

## 🚀 核心功能

- 🤖 智能总结：自动分析群组聊天
- 🔄 AI 高可用：主 API 失败时自动切换至备用 API（OpenAI 兼容），详见文档
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

### Docker Compose 一键部署

1. 准备环境变量：
   ```bash
   cp env.example .env
   # 编辑 .env，填写 BOT_TOKEN、AI API Key、模型等配置
   ```
2. 启动容器：
   ```bash
   docker compose up -d --build
   ```
3. 查看日志：
   ```bash
   docker compose logs -f telegram-summary-bot
   ```
4. 停止服务：
   ```bash
   docker compose down
   ```

Docker Compose 会使用名为 `bot_data` 的 Docker volume 持久化 `/app/data`，SQLite 消息数据库会保留在该 volume 中，不会因容器重建丢失。

### 本地运行

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
├── bot.js                # 程序入口（加载环境变量并启动应用）
├── src/
│   ├── app.js            # 应用组装根：服务初始化、中间件注册、优雅停止
│   ├── config/           # 集中配置（环境变量）与常量
│   ├── commands/         # 命令模块（/start /help /summary /status /admin）
│   ├── middleware/       # 中间件（防重复、输入校验、限流、节流、消息监听等）
│   ├── services/         # 服务层（AI、缓存、消息存储、任务队列）
│   │   └── summaryDelivery/  # 总结结果推送（Markdown 降级链、分段发送、错误分类）
│   ├── telegram/         # Telegram API 辅助（命令解析、错误识别、安全发送）
│   └── utils/            # 工具函数（日志、Markdown、格式化、校验）
├── tests/                # Jest 测试（目录结构镜像 src/）
├── scripts/              # 辅助脚本（配置校验、AI 连接测试、PM2 部署）
├── docs/                 # 项目文档
├── .env                  # 环境变量（需自建）
├── package.json          # 配置文件
└── README.md             # 项目说明
```

## 🧪 开发与测试

```bash
npm test          # 运行全部单元测试（Jest）
npm run lint      # 代码静态检查（ESLint）
VERBOSE_TESTS=1 npm test   # 测试时查看完整日志输出
```

测试目录 `tests/` 与 `src/` 结构一一对应；贡献代码时请保证 `npm test` 与 `npm run lint` 通过（CI 会自动执行）。

## 🛠️ 技术栈

- Node.js
- Telegraf.js
- OpenAI 兼容 API（OpenAI Node.js SDK）
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
