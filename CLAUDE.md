# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

Run the application:
- `npm start` - Start the bot in production mode
- `npm run dev` - Start the bot in development mode

Testing and verification:
- `npm run test-ai` - Test AI service connectivity and fallback functionality
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

## Architecture Overview

### Core Design Pattern
This is a Telegram bot with an event-driven, middleware-based architecture featuring:

**Entry Point (`bot.js`)**
- Main application entry with service initialization
- Middleware registration in specific order (security, validation, logging, etc.)
- Graceful shutdown handling with resource cleanup

**AI Service with Fallback System**
The bot implements a resilient AI service pattern:
- **Primary Model**: Gemini (Google's AI)
- **Fallback Model**: Azure OpenAI
- **Auto-switching**: Automatically falls back to Azure OpenAI if Gemini fails
- **Service Class**: `AIService` in `services/aiService.js` manages both clients
- **Client Factory**: `services/ai/clientFactory.js` initializes AI clients

### Key Service Layers

**Asynchronous Task Processing**
- `TaskQueue` class handles long-running AI summarization tasks
- Event-driven architecture with `TaskQueueHandler` for UI updates
- Prevents blocking the main thread during AI processing

**Multi-layered Middleware Stack**
Applied in this order:
1. `duplicateGuard` - Prevents duplicate message processing
2. `inputValidation` - Input sanitization and validation
3. `security` middleware - Rate limiting, user validation, content filtering
4. `commandThrottle` - Command-specific throttling (e.g., /summary)
5. `messageListener` - Message storage, group monitoring, statistics
6. `logging` - Request and command logging

**Command System**
- Auto-loading command modules from `commands/` directory
- Each command exports: `command`, `handler`, and `description`
- Dynamic command registration via `commands/index.js`

### Data Layer
- **Message Storage**: SQLite database via `storage/messageStore.js`
- **Caching**: In-memory caching via `services/cacheService.js`
- **Statistics**: Message and user activity tracking

### AI Processing Pipeline
1. Language detection for appropriate response formatting
2. Token limit management and text truncation
3. System and user prompt building with context
4. Structured JSON response formatting
5. Fallback parsing and error recovery

## Configuration Requirements

### Environment Variables
Required for AI functionality:
- `BOT_TOKEN` - Telegram bot token
- `GEMINI_API_KEY` - Google Gemini API key (primary model)
- `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_DEPLOYMENT_NAME` - Azure OpenAI (fallback)

### PM2 Deployment
- Configuration in `ecosystem.config.js`
- Memory limit: 512MB with automatic restart
- Logging to `logs/` directory
- Supports both development and production environments

## Key Patterns to Follow

**Error Handling**
- All services implement comprehensive error handling with fallback mechanisms
- Graceful degradation when AI services are unavailable
- Structured error reporting with context

**Security**
- Rate limiting (10 requests per minute per user)
- Input validation and sanitization
- Content filtering for inappropriate messages
- Markdown escaping for safe output

**Async Processing**
- Long-running tasks use the TaskQueue system
- Event-driven updates for user feedback
- Non-blocking architecture for responsive bot interaction

**Resource Management**
- Automatic cleanup of expired tasks and cache entries
- Memory limits and monitoring
- Graceful shutdown with proper resource cleanup