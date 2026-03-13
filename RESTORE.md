# MikoClaw Restore Guide

> Fork of [qwibitai/nanoclaw](https://github.com/qwibitai/nanoclaw) modified to use **OpenRouter** (DeepSeek model) instead of Claude, with **Telegram** as the messaging channel.

## What Was Changed From Original NanoClaw

| File | Change |
|------|--------|
| `container/agent-runner/src/index.ts` | Rewrote to use `openai` npm package directly (chat completions API) instead of Claude Agent SDK |
| `container/agent-runner/package.json` | Replaced `@anthropic-ai/claude-agent-sdk` with `openai` |
| `container/agent-runner/tsconfig.json` | Excluded `ipc-mcp-stdio.ts` (not used with direct API) |
| `src/credential-proxy.ts` | Changed from Anthropic to OpenRouter (Bearer auth, `openrouter.ai/api` upstream) |
| `src/container-runner.ts` | Changed env vars from `ANTHROPIC_*` to `OPENAI_*`, passes OpenRouter key directly |
| `src/channels/telegram.ts` | **NEW** — Telegram channel using `node-telegram-bot-api` |
| `src/channels/index.ts` | Added Telegram import |

## How to Restore From Scratch

### 1. Clone
```bash
git clone https://github.com/davedave1973/mikoclaw.git
cd mikoclaw
```

### 2. Install Dependencies
```bash
npm install
npm install node-telegram-bot-api @types/node-telegram-bot-api
```

### 3. Create `.env`
```bash
cp .env.example .env
# Edit .env and fill in:
#   OPENROUTER_API_KEY  — from https://openrouter.ai/keys
#   TELEGRAM_BOT_TOKEN  — from @BotFather on Telegram
#   ASSISTANT_NAME      — whatever you want the bot called
```

### 4. Build Container
```bash
bash container/build.sh
```

### 5. Register Your Telegram Chat
```bash
# Replace CHAT_ID with your Telegram chat ID
npx tsx scripts/register-telegram.ts YOUR_CHAT_ID
```

To find your chat ID: send any message to the bot, then check the MikoClaw logs — it'll show `tg:XXXXXXXX`.

### 6. Run
```bash
npm run dev
```

### 7. Test
Send a message to your bot on Telegram. It should respond via DeepSeek on OpenRouter.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENROUTER_API_KEY` | ✅ | Your OpenRouter API key |
| `TELEGRAM_BOT_TOKEN` | ✅ | Telegram bot token from @BotFather |
| `ASSISTANT_NAME` | ❌ | Bot display name (default: "Assistant") |

## Key Info

- **Model**: `deepseek/deepseek-chat-v3-0324` (configurable in `container/agent-runner/src/index.ts`)
- **Telegram chat ID**: `tg:8146835535` (Frank's DM)
- **Registered group folder**: `telegram_main`
- **Container image**: `nanoclaw-agent:latest`
