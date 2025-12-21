# AI 主备自动切换配置指南（OpenAI 兼容）

## 🔄 功能概述

本机器人支持 OpenAI 兼容 API 的主备自动切换，确保服务高可用：

- **主要 API**: OpenAI 兼容服务（主用）
- **备用 API**: OpenAI 兼容服务（故障转移）
- **自动切换**: 主 API 不可用时自动切换到备用 API

## 📋 环境变量配置

### 1. 主要 API 配置

```bash
PRIMARY_API_KEY=your_primary_api_key_here
# 可选：自定义 BaseURL（默认 OpenAI 官方）
PRIMARY_API_BASE_URL=https://api.openai.com/v1
PRIMARY_MODEL=gpt-4o-mini
```

### 2. 备用 API 配置

```bash
FALLBACK_API_KEY=your_fallback_api_key_here
# 可选：自定义 BaseURL
FALLBACK_API_BASE_URL=https://api.openai.com/v1
FALLBACK_MODEL=gpt-4o-mini
```

### 3. 基本配置

```bash
# Telegram 机器人配置
BOT_TOKEN=your_telegram_bot_token
ADMIN_USER_IDS=123456789,987654321
```

## 🚀 部署选项

### 选项1: 主备双 API（推荐）

同时配置主/备 API，获得最高可用性：

```bash
PRIMARY_API_KEY=your_primary_key
PRIMARY_API_BASE_URL=https://api.openai.com/v1
PRIMARY_MODEL=gpt-4o-mini

FALLBACK_API_KEY=your_fallback_key
FALLBACK_API_BASE_URL=https://api.openai.com/v1
FALLBACK_MODEL=gpt-4o-mini
```

### 选项2: 仅主要 API

只配置主要 API，服务仍可正常运行：

```bash
PRIMARY_API_KEY=your_primary_key
PRIMARY_MODEL=gpt-4o-mini
# 备用 API 留空
```

### 选项3: 仅备用 API

只配置备用 API，将作为唯一可用 API：

```bash
FALLBACK_API_KEY=your_fallback_key
FALLBACK_MODEL=gpt-4o-mini
# 主要 API 留空
```

## 🧪 测试配置

运行测试脚本验证配置：

```bash
npm run test-ai
```

测试脚本将：
- ✅ 检查主备 API 的连接状态
- 🔄 测试自动切换功能
- 📝 验证消息总结功能
- 📊 显示详细的测试结果

## 🔧 工作原理

### 自动切换逻辑

1. **优先使用主要 API**: 所有请求先尝试主 API
2. **自动故障转移**: 主 API 失败时切换到备用 API
3. **错误记录**: 详细记录切换原因和结果
4. **透明处理**: 用户无感知，持续获取总结结果

### 错误处理示例

```text
[INFO] 尝试使用主要 API 生成内容
[WARN] 主要 API 调用失败，尝试备用 API: API rate limit exceeded
[INFO] 尝试使用备用 API 生成内容
[SUCCESS] 备用 API 调用成功
```

### 状态监控

使用 `/status` 查看主备 API 状态：

```text
AI 服务状态:
✅ 初始化: 成功
🔸 主要 API: 已配置
🔸 备用 API: 已配置
```

## 💡 最佳实践

### 1. API 密钥管理
- 定期轮换 API 密钥
- 使用环境变量而非硬编码
- 监控 API 使用量和配额

### 2. 成本优化
- 主/备 API 可选不同计费策略
- 按需配置模型大小与成本

### 3. 监控和告警
- 定期检查 `/status` 输出
- 关注日志中的切换频率
- 设置 API 配额告警

## 🆘 故障排除

### 常见问题

**Q: 主备 API 都失败了怎么办？**
A: 机器人会返回友好的错误消息，提示用户稍后重试。检查 API 密钥与网络连接。

**Q: 为什么总是使用备用 API？**
A: 检查主 API 的密钥、BaseURL 与模型配置，或查看日志了解失败原因。

**Q: 如何禁用自动切换？**
A: 只配置一个 API，系统会自动使用可用的 API。

### 测试命令

```bash
# 验证配置
npm run verify

# 测试 AI 功能
npm run test-ai

# 查看详细日志
npm start
```

---

如需更多帮助，请参考 [项目主页](../README.md) 或提交 [Issue](https://github.com/FogMoe/telegram-summary-bot/issues)。
