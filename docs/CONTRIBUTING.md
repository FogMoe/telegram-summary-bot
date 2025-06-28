# 贡献指南

感谢您对 Telegram 群组聊天总结机器人项目的关注！我们欢迎所有形式的贡献。

## 🤝 如何贡献

### 报告问题
- 在提交新问题之前，请先搜索现有的 [Issues](https://github.com/FogMoe/telegram-summary-bot/issues)
- 使用清晰的标题和详细的描述
- 包含复现步骤、期望行为和实际行为
- 提供相关的日志信息和环境详情

### 提交功能请求
- 详细描述您希望添加的功能
- 解释为什么这个功能是有用的
- 提供可能的实现思路（可选）

### 提交代码更改

1. **Fork 项目**
   ```bash
   git clone https://github.com/FogMoe/telegram-summary-bot.git
   cd telegram-summary-bot
   ```

2. **创建功能分支**
   ```bash
   git checkout -b feature/your-feature-name
   ```

3. **进行开发**
   - 遵循现有的代码风格
   - 添加必要的注释
   - 确保代码能够正常运行

4. **测试更改**
   ```bash
   npm test
   npm run verify
   npm run test-ai
   ```

5. **提交更改**
   ```bash
   git add .
   git commit -m "feat: 添加新功能描述"
   ```

6. **推送分支**
   ```bash
   git push origin feature/your-feature-name
   ```

7. **创建 Pull Request**
   - 提供清晰的标题和描述
   - 说明更改的内容和原因
   - 关联相关的 Issues

## 📝 代码规范

### 提交信息格式
使用 [Conventional Commits](https://www.conventionalcommits.org/) 格式：
- `feat:` 新功能
- `fix:` 修复问题
- `docs:` 文档更新
- `style:` 代码格式调整
- `refactor:` 代码重构
- `test:` 测试相关
- `chore:` 构建过程或辅助工具的变动

### 代码风格
- 使用 2 个空格缩进
- 使用有意义的变量和函数名
- 添加适当的注释
- 保持函数简洁，单一职责

### 目录结构
```
commands/     - 命令处理器
middleware/   - 中间件
services/     - 服务层
storage/      - 数据存储
utils/        - 工具函数
```

## 🔒 安全问题

如果您发现安全漏洞，请不要在公共 Issues 中报告。请直接联系项目维护者：
- 邮箱：i@scarletkc.com

## 📜 许可证

通过贡献代码，您同意您的贡献将在 GPL-3.0 许可证下分发。

## ❓ 需要帮助？

如果您在贡献过程中遇到问题：
- 查看现有的 [Issues](https://github.com/FogMoe/telegram-summary-bot/issues)
- 在 GitHub 上创建新的 Issue
- 联系项目维护者 [@ScarletKc](https://github.com/scarletkc)

感谢您的贡献！🎉 