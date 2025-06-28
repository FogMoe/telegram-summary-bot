# AI 模型自动切换功能设置指南

## 🔄 功能概述

本机器人现已支持AI模型自动切换功能，确保服务的高可用性：

- **主要模型**: Gemini 2.5 Flash （Google AI Studio）
- **备用模型**: Azure OpenAI 
- **自动切换**: 当主要模型不可用时，自动切换到备用模型

## 📋 环境变量配置

### 1. Gemini API 配置（主要模型）

```bash
# 从 Google AI Studio 获取 API 密钥: https://aistudio.google.com/
GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash
```

### 2. Azure OpenAI 配置（备用模型）

```bash
# 从 Azure 门户获取以下信息
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment_name_here
AZURE_OPENAI_API_VERSION=2025-01-01-preview
```

### 3. 基本配置

```bash
# Telegram 机器人配置
BOT_TOKEN=your_telegram_bot_token
ADMIN_USER_IDS=123456789,987654321
```

## 🚀 部署选项

### 选项1: 完整双模型配置（推荐）

配置两个API密钥，享受最高可用性：

```bash
GEMINI_API_KEY=your_gemini_key
AZURE_OPENAI_API_KEY=your_azure_key
AZURE_OPENAI_ENDPOINT=https://your-endpoint.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment
```

### 选项2: 仅主要模型（Gemini）

只配置Gemini API，服务仍可正常运行：

```bash
GEMINI_API_KEY=your_gemini_key
# Azure OpenAI配置留空
```

### 选项3: 仅备用模型（Azure OpenAI）

只配置Azure OpenAI，将作为唯一可用模型：

```bash
# GEMINI_API_KEY留空
AZURE_OPENAI_API_KEY=your_azure_key
AZURE_OPENAI_ENDPOINT=https://your-endpoint.openai.azure.com/
AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment
```

## 🧪 测试配置

运行测试脚本验证配置：

```bash
npm run test-ai
```

测试脚本将：
- ✅ 检查两个模型的连接状态
- 🔄 测试自动切换功能
- 📝 验证消息总结功能
- 📊 显示详细的测试结果

## 🔧 工作原理

### 自动切换逻辑

1. **优先使用主要模型**: 所有请求首先尝试Gemini API
2. **自动故障转移**: 如果Gemini失败，自动切换到Azure OpenAI
3. **错误记录**: 详细记录每次切换的原因和结果
4. **透明处理**: 用户无感知，始终获得AI总结结果

### 错误处理

```javascript
// 示例：自动切换日志
[INFO] 尝试使用主要模型 (Gemini) 生成内容
[WARN] 主要模型 (Gemini) 调用失败，尝试备用模型: API rate limit exceeded
[INFO] 尝试使用备用模型 (Azure OpenAI) 生成内容  
[SUCCESS] 备用模型 (Azure OpenAI) 调用成功
```

### 状态监控

使用 `/status` 命令查看两个模型的状态：

```
AI 服务状态:
✅ 初始化: 成功
🔸 主要模型 (Gemini): 已配置
🔸 备用模型 (Azure OpenAI): 已配置
```

## 💡 最佳实践

### 1. API 密钥管理
- 定期轮换API密钥
- 使用环境变量而非硬编码
- 监控API使用量和配额

### 2. 成本优化
- Gemini API通常更经济实惠
- Azure OpenAI提供企业级稳定性
- 根据使用模式选择合适的配置

### 3. 监控和告警
- 定期检查 `/status` 命令输出
- 关注日志中的切换频率
- 设置API配额告警

## 🆘 故障排除

### 常见问题

**Q: 两个模型都失败了怎么办？**
A: 机器人会返回友好的错误消息，提示用户稍后重试。检查API密钥和网络连接。

**Q: 为什么总是使用备用模型？**
A: 检查Gemini API密钥是否正确配置，或查看日志了解主要模型失败的原因。

**Q: 如何禁用自动切换？**
A: 只配置一个模型的API密钥，系统会自动使用可用的模型。

### 测试命令

```bash
# 验证配置
npm run verify

# 测试AI功能
npm run test-ai

# 查看详细日志
npm start
```

## 📈 版本兼容性

- **最低要求**: Node.js 16+
- **支持的模型**: 
  - Gemini 2.5 Flash 及更高版本
  - Azure OpenAI GPT-4 系列
- **向后兼容**: 现有Azure OpenAI配置无需更改

---

如需更多帮助，请参考 [项目主页](../README.md) 或提交 [Issue](https://github.com/FogMoe/telegram-summary-bot/issues)。 