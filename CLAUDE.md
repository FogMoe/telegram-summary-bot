# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

Run the application:
- `npm start` - Start the bot in production mode
- `npm run dev` - Start the bot in development mode

Testing and verification:
- `npm test` - Run the full Jest test suite
- `npm run lint` - Run ESLint
- `VERBOSE_TESTS=1 npm test` - Run tests with full log output (logs are silenced by default)
- `npm run test-ai` - Test AI service connectivity and fallback functionality (hits real APIs)
- `npm run verify` - Verify configuration and environment variables

PM2 process management:
- `npm run pm2:start` - Start with PM2 in production
- `npm run pm2:dev` - Start with PM2 in development
- `npm run pm2:restart` - Restart the PM2 process
- `npm run pm2:logs` - View PM2 logs
- `npm run pm2:status` - Check PM2 status

Database management:
- `npm run clean` - Delete SQLite database
- `npm run reset` - Clean database and restart

CI runs lint + tests on Node 24 (`.github/workflows/ci.yml`).

## Project Layout

All application code lives under `src/` (CommonJS, no build step). `bot.js` at the repo root is the only entry point; Docker/PM2 configs reference it.

- `src/app.js` - Composition root: service init, middleware registration (order matters), command loading, graceful shutdown, process error handlers
- `src/config/index.js` - Centralized env config; modules must NOT read `process.env` directly (standalone scripts in `scripts/` may)
- `src/config/constants.js` - All tunable numbers (limits, TTLs, throttle windows)
- `src/commands/` - One module per command exporting `{ command, description, handler }`; `index.js` holds the explicit registry (keep alphabetical so help output stays stable)
- `src/middleware/` - duplicateGuard, inputValidation, security (rate limit/user validation), commandThrottle, messageListener, logging
- `src/services/` - aiService (+ `ai/` submodules), cacheService, chatPermissionService, messageStore (SQLite), taskQueue
- `src/services/summaryDelivery/` - summary result delivery: `summarySender` (4-level Markdown fallback ladder + segmented sending), `taskQueueHandler` (thin event dispatcher), `errorClassification`, `errorMessages`, `retry`, `textSegmenter`
- `src/telegram/` - Telegraf-facing helpers: commandParser, error identification (`errors.js`), safe send wrappers (`safety.js`, marks send-restricted chats)
- `src/utils/` - logger (supports LOG_LEVEL env), markdown tools, summaryFormatter, validation, admin gate, commandRegistry

Layering: config is imported by everything; utils must not import services; `src/telegram/safety.js` wraps `chatPermissionService` by design (telegram layer sits above services); commands must not import middleware (shared helpers live in `src/utils/validation.js`). Do not introduce utils→services or commands→middleware imports.

## Architecture Overview

**AI Service with fallback**
- Primary → fallback auto-switching with 20s/30s timeouts (`src/services/aiService.js`)
- Pipeline: language detection → token truncation → prompts → strict `json_schema` request → JSON parse with repair fallbacks → Markdown rendering
- Client init in `src/services/ai/clientFactory.js`

**Async task processing**
- `/summary` submits to a serial `TaskQueue` (one summary at a time); results cached, `taskCompleted`/`taskFailed` events consumed by `taskQueueHandler`, which delivers via `summarySender`
- The processing message is edited in place; message linkage kept in cache under `task_message_<id>` (15-min TTL)

**Summary delivery contract (do not break)**
- 4-level Markdown fallback: raw → escaped (`smartEscapeMarkdown`) → `safeMarkdownProcess` → plain text; triggered only by Telegram 400 "can't parse entities" errors
- Responses > 3500 chars are segmented at ~3200 chars; the stats block is separated by splitting on the literal `\n\n📊` emitted by `formatSummaryResponse` — this marker is load-bearing
- First segment edits the original message with a `(1/N)` suffix; later segments are new messages; final fallback is a truncated 3400-char message

**Middleware order** (registered in `src/app.js`): duplicateGuard → requestLogger → inputValidation → userValidator → rateLimiter → summary command throttle → messageStore → groupStatus → chatTypeLogger → messageStats → commandLogger

**Storage**
- SQLite via `sqlite3`: messages table with `UNIQUE(message_id, chat_id)`; retention: >7 days or beyond newest 2000 per chat, cleaned every 6h
- `node-cache` in `services/cacheService.js`: summary (MD5 keys + per-chat index), stats, user/custom caches; per-user-per-chat 5-min summary cooldown

**Intentional behaviors** (full list in docs/KNOWN-ISSUES.md): summary cache invalidated by any new group message; layered rate controls (10 req/min global, 3s /summary throttle, 5-min per-user-per-chat cooldown — refunded automatically when the task fails); usernames stored verbatim and escaped at render time; zh/zh-tw detection is a char-count heuristic.

## Configuration Requirements

Environment variables (documented in `env.example`, parsed once in `src/config/index.js`):
- `BOT_TOKEN` (required), `ADMIN_USER_IDS` (comma-separated; unset = no admins)
- `PRIMARY_API_KEY` / `PRIMARY_API_BASE_URL` / `PRIMARY_MODEL`
- `FALLBACK_API_KEY` / `FALLBACK_API_BASE_URL` / `FALLBACK_MODEL`
- `DATABASE_PATH` (default `storage/messages.db`), `LOG_LEVEL` (debug/info/warn/error)

## Testing Guidelines

- Tests live in `tests/` mirroring `src/`; Jest with node environment
- Pure helpers are tested directly; commands/middleware use `jest.mock` on the singleton service modules
- `messageStore` tests run against a real temp SQLite file
- When fixing a bug, add a regression test; when refactoring, run `npm test` and `npm run lint` before finishing
