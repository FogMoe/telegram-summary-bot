# 更新日志

本文档记录了 Telegram Summary Bot 的所有重要更改。

版本格式遵循 [语义化版本控制](https://semver.org/lang/zh-CN/)。


## 开发指南

### 版本号规则
- **主版本号 (MAJOR)**: 不兼容的API修改
- **次版本号 (MINOR)**: 向下兼容的功能性新增
- **修订号 (PATCH)**: 向下兼容的问题修正

### 更改类型
- **✨ 新功能** (`feat`): 新增功能
- **🔧 修复** (`fix`): 问题修复
- **⚡ 改进** (`perf`): 性能优化
- **♻️ 重构** (`refactor`): 代码重构
- **📝 文档** (`docs`): 文档更新
- **🎨 样式** (`style`): 代码格式调整
- **✅ 测试** (`test`): 测试相关
- **🔨 构建** (`build`): 构建系统或依赖更新

### 提交格式
```
<type>(<scope>): <description>

[optional body]

[optional footer]
```


## [未发布] - 2026-08-22

### ♻️ 重构（保持用户可见行为不变）

- **目录结构调整**：应用代码统一迁入 `src/`（commands / middleware / services / telegram / utils / config），根目录仅保留入口 `bot.js`、脚本与测试；部署入口与 Docker/PM2 配置不变。
- **新增组装根 `src/app.js`**：原 `bot.js` 中的启动、接线与优雅停止逻辑集中于此；`bot.js` 精简为加载环境变量并启动应用。
- **集中配置 `src/config/index.js`**：环境变量统一解析，业务模块不再直接读取 `process.env`（独立脚本除外）。
- **拆分 849 行的 `services/taskQueueHandler.js`** 为 `src/services/summaryDelivery/`：错误分类（errorClassification）、重试（retry）、文案（errorMessages）、分段器（textSegmenter）、发送器（summarySender）、薄事件分发器（taskQueueHandler）。
- **消除重复的四级 Markdown 降级链**：`/summary` 命令的缓存命中路径与任务完成推送路径统一复用 `summarySender.sendWithMarkdownFallback`（原生 → 转义 → safeMarkdownProcess → 纯文本），两条路径的原有语义（网络错误是否上抛）以参数保留。
- **修复层次违规**：`sanitizeInput`/`validateNumber` 移入 `src/utils/validation.js`（命令不再反向依赖中间件）；`telegramCommand`/`telegramErrors`/`telegramSafety` 移入 `src/telegram/`（utils 不再依赖 services）。
- **命令注册器**：`fs` 目录扫描改为显式命令清单（保持字母序，帮助文案顺序不变）；`start`/`help` 改为处理时延迟引入，消除加载期循环依赖。
- **移除冗余**：删除手写的 botInfo 注入中间件（Telegraf 原生提供 `ctx.botInfo`）；删除纯 no-op 的 contentFilter 中间件（文档同步修正，本项目此前从未实现内容过滤）。
- **死代码清理**：删除 `utils/errorHandler.js`、`utils/text.js` 整个文件，以及 `escapeMarkdownV2`、`diagnoseProblem`、`getRegisteredCommands`、`safeTelegramSendMessage/EditMessageText`、`formatQueryResults` 等未使用导出。

### 🔧 修复

1. **启动时 AI 连接检测结果恒为"正常"**：`testConnection()` 返回对象永远为真值，导致"连接异常"分支不可达；改为判断 `.success`（`app.js` 与 `verify-config.js` 两处）。
2. **`/admin cache clear` 清不掉总结缓存**：总结缓存键为 MD5 哈希、不含原始群组 ID，旧的子串匹配永远漏删且可能误删前缀相近的群组；现维护 chatId→键索引实现精确清除。
3. **用户改名后被重复计数**：`getTopUsers` 的 `GROUP BY` 含可变昵称列，改为仅按 `user_id` 分组。
4. **数据库初始化竞态**：`messageStore.init()` 的连接回调内直接 throw 且建表可能先于连接完成；改为规范化的 Promise 等待连接后再建表。
5. **`LOG_LEVEL` 有文档无实现**：logger 现支持 `error/warn/info/debug` 级别过滤，未设置时输出全部（与旧行为一致）。
6. **`smartEscapeMarkdown` 占位符自毁**：`__TITLE_PLACEHOLDER_N__` 占位符会被自身转义逻辑破坏，导致转义路径触发时 `*标题*` 内容丢失并泄漏占位符；改用哨兵字符保护。
7. **`/admin` 子命令无法使用负数群组 ID**：`validateNumber(args[0])` 默认下限 0，而 Telegram 群组 ID 均为负数，导致帮助文档中的示例（如 `/admin users -1001234567890`）实际不可用；改为允许负值。

### 🔧 修复（行为怪癖清理，见 docs/KNOWN-ISSUES.md）

8. **停止入库改写用户名**：此前存储前会把用户名中的 `_` 替换为 `-`，永久破坏原始数据；现原样存储，Markdown 冲突改由显示侧 `escapeMarkdown`（/admin、/status 的用户名展示）与 AI 提示词侧既有的 `makeSafeUserName` 处理。
9. **任务失败退还冷却**：`/summary` 的 5 分钟冷却此前在提交任务前即消耗，AI 失败也会把用户锁 5 分钟；现任务失败时自动退还（`cacheService.resetApiCooldown`），防刷仍由全局限流兜底。
10. **`/admin messages` 显示全部请求数量**：此前无论请求多少条（1-20）都只渲染最后 5 条；现按请求的数量完整显示（默认 10）。
11. **繁体中文检测可达**：原 `zh-tw` 特征字符集是 CJK 子集，得分永远不超过 `zh`，繁体永远被判为简体；改为基于 54 对繁/简专用字符的计数对比判定，并为 `formatStructuredSummary` 补充繁体分节标题模板。
12. **截断 JSON 修复保证产出合法 JSON**：`repairTruncatedJson` 此前会把截断的数组残片（如 `["a"`）直接拼进结果导致解析必败；现重建完整数组并做 `JSON.parse` 校验，失败时退回应急 JSON。
13. **`isNetworkError` 返回严格布尔值**：`error.response` 缺失时此前返回 `undefined`（falsy），现统一为 `Boolean(...)`。
14. **同秒消息排序稳定**：`getRecentMessages` 与保留清理的 `ORDER BY date` 补充 `id` 作为次级排序，同一秒内的消息按插入顺序确定返回。
15. **`/admin clear <群组ID>` 一并解除发送受限熔断**：权限修复后管理员可立即恢复该群推送（其它群组的熔断标记不受影响）。

### 🔧 修复（代码评审发现）

16. **总结缓存索引随过期清理**：`clearChatCache` 修复引入的键索引此前只写不清（缓存过期与全量清空均不删除索引项），长期运行会缓慢泄漏；改为 键→chatId 映射，并在缓存 `expired`/`del` 事件与 `clearAllCache` 中同步清理。
17. **`/admin messages` 消息正文转义**：正文原样拼入 Markdown 回复，含 `_`/`*`/反引号/`[` 的消息会导致整条列表解析失败（重构前即存在）；同时补齐 `/status` 执行者/当前用户与 `/admin` 拒绝消息中实时用户名的转义。
18. **降级链返回实际发送级别**：`sendWithMarkdownFallback` 返回 raw/escaped/safe/plain，`sendSingleSummary` 恢复"仅原生 Markdown 成功时"记录推送日志的原语义。
19. **任务队列结果清理定时器可回收**：`setTaskResult` 的 10 分钟清理定时器此前不受 `cleanup()` 管理（测试运行与优雅停止时悬挂）；现统一追踪并在 `cleanup()` 中清除。

### ✅ 测试

- 引入 Jest（30 个测试套件、276 个用例）与 ESLint，新增 GitHub Actions CI（Node 24：lint + test）。
- 测试目录 `tests/` 镜像 `src/` 结构：纯函数直测；命令/中间件通过 mock 单例服务测试；`messageStore` 使用真实 SQLite 临时库；`summarySender` 覆盖四级降级链矩阵与分段/截断回退。
- 特征测试先行：重构前先固化既有行为（含 `\n\n📊` 分段标记、用户名 `_`→`-` 改写等关键约定）再动代码。

### 🎹 其他

- `npm run clean` 改为跨平台实现（原 `rm -rf` 在 Windows 不可用）。
- 一处用户不可见的文案差异：网络错误提示模板中一行的尾随空白被移除。
- 新增 `docs/KNOWN-ISSUES.md` 记录保留未改的既有行为怪癖。

