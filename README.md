# MikoClaw — Personal AI Assistant on Telegram

Built on [NanoClaw](https://github.com/qwibitai/nanoclaw). Runs DeepSeek (or any model) via OpenRouter, with Telegram as the chat interface.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  macOS (miko's MacBook Pro)                         │
│                                                     │
│  ┌──────────────┐  ┌────────────┐  ┌─────────────┐  │
│  │ MikoClaw Bot │  │ Dashboard  │  │ Auto-Checker │  │
│  │ (port 3001)  │  │ (port 3333)│  │ (AppleScript)│  │
│  └──────┬───────┘  └──────┬─────┘  └──────┬──────┘  │
│         │                 │               │         │
│  ┌──────┴─────────────────┴───────────────┴──────┐  │
│  │            SQLite DB (store/messages.db)       │  │
│  │    + File Queue (data/comms/*)                 │  │
│  └───────────────────────┬───────────────────────┘  │
│                          │                          │
│  ┌───────────────────────┴───────────────────────┐  │
│  │  Docker Containers (agent-runner)              │  │
│  │  → OpenRouter API (DeepSeek/GPT-4o/Gemini)    │  │
│  │  → Brave Search (function calling)             │  │
│  └───────────────────────────────────────────────┘  │
│                                                     │
│  ┌───────────────────────────────────────────────┐  │
│  │  Antigravity (IDE-based coding assistant)      │  │
│  │  → Reads /antigrav messages from file queue    │  │
│  │  → Replies directly via Telegram Bot API       │  │
│  │  → Stores replies in DB (MikoClaw aware)       │  │
│  └───────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
          │
          │ Telegram Bot API
          ▼
┌─────────────────┐
│   Telegram       │
│   @WizDudeBot    │
└─────────────────┘
```

## Quick Start

```bash
# 1. Clone
git clone https://github.com/davedave1973/mikoclaw.git
cd mikoclaw

# 2. Install deps
npm install

# 3. Create .env (see .env.example)
cp .env.example .env
# Edit .env with your API keys

# 4. Build container
bash container/build.sh

# 5. Run
npm run dev          # Bot only
npm run dashboard    # Dashboard on localhost:3333

# Or run everything:
bash scripts/start.sh
```

## Environment Variables (.env)

| Variable | Description | Required |
|----------|-------------|----------|
| `OPENROUTER_API_KEY` | OpenRouter API key (sk-or-v1-...) | ✅ |
| `ASSISTANT_NAME` | Bot display name (e.g. WizDudeBot) | ✅ |
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | ✅ |
| `BRAVE_API_KEY` | Brave Search API key | Optional |

## Telegram Commands

| Command | Description |
|---------|-------------|
| `/model [name]` | Switch AI model (or show current + list) |
| `/status` | Show current config |
| `/antigrav <msg>` | Send message to Antigravity coding assistant |
| `/mikoclaw <msg>` | Send direct message to AI agent |
| `/help` | Show all commands |

### Available Model Shortcuts

| Shortcut | Full OpenRouter Model ID |
|----------|--------------------------|
| `deepseek` | `deepseek/deepseek-chat-v3-0324` (default) |
| `gpt-4o` | `openai/gpt-4o` |
| `claude` | `anthropic/claude-sonnet-4.5` |
| `haiku` | `anthropic/claude-haiku-4.5` |
| `gemini` | `google/gemini-2.5-flash` |
| `gemini-pro` | `google/gemini-2.5-pro` |
| `llama` | `nvidia/llama-3.3-nemotron-super-49b-v1.5` |
| `mixtral` | `mistralai/mixtral-8x7b-instruct` |

Or use any OpenRouter model ID directly: `/model openai/gpt-4o-mini`

## 2-Way Communication System

### For Humans (via Telegram)

- `/antigrav <msg>` → Message is queued for Antigravity
- Antigravity reads the queue, does the work, and replies directly to Telegram
- MikoClaw sees the reply in conversation history (0 tokens burned)

### For AI Agents (via CLI)

```bash
# Read messages from /antigrav queue
npx tsx scripts/comms.ts read

# Reply directly to Telegram (0 tokens, stored in DB)
npx tsx scripts/comms.ts reply "your answer here"

# Send to MikoClaw AI for processing (burns tokens)
npx tsx scripts/comms.ts send "process this"

# Clear processed messages
npx tsx scripts/comms.ts clear
```

### File Queue Directories

| Directory | Purpose |
|-----------|---------|
| `data/comms/to-antigrav/` | Messages from `/antigrav` command → Antigravity reads |
| `data/comms/to-mikoclaw/` | Messages from Antigravity → MikoClaw AI processes |
| `data/comms/processed/` | Messages that have been read by the auto-checker |
| `data/comms/from-mikoclaw/` | MikoClaw responses (unused, replies go direct to TG) |

### Communication Flow

```
User ──/antigrav msg──→ data/comms/to-antigrav/ ──→ Auto-checker detects
                                                      ──→ Types "check" in Antigravity
                                                      ──→ Antigravity reads & processes
                                                      ──→ comms.ts reply "answer"
                                                           ├→ Telegram Bot API (direct)
                                                           └→ SQLite DB (MikoClaw aware)
```

## Dashboard (localhost:3333)

Web UI for monitoring:
- Message count, groups, log files
- Recent chat messages
- Live log streaming (SSE)
- Clickable log file browser

### Dashboard API

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/messages` | GET | Recent messages |
| `/api/inbox?limit=N` | GET | Recent bot responses |
| `/api/model` | GET | Current model |
| `/api/model` | POST | Set model `{"model":"..."}` |
| `/api/send` | POST | Queue message for MikoClaw `{"message":"..."}` |
| `/api/groups` | GET | Registered groups |
| `/api/logs` | GET | Log file list |
| `/api/log/<filename>` | GET | Log file contents |
| `/api/stream` | GET | SSE live log stream |

## Auto-Start on Boot

MikoClaw uses macOS launchd to auto-start on login:

```bash
# Install (one-time)
cp com.mikoclaw.agent.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.mikoclaw.agent.plist

# Manage
launchctl unload ~/Library/LaunchAgents/com.mikoclaw.agent.plist  # Stop
launchctl load ~/Library/LaunchAgents/com.mikoclaw.agent.plist    # Start
launchctl list | grep mikoclaw                                    # Status
```

### What starts on boot

1. **MikoClaw Bot** (`npm run dev`) — Telegram bot + credential proxy on port 3001
2. **Dashboard** (`npm run dashboard`) — Web UI on port 3333
3. **Auto-Checker** (`scripts/auto-checker.sh`) — Polls `/antigrav` queue every 20s

### Auto-Checker Requirements

The auto-checker uses AppleScript to type in the Antigravity IDE. It needs:
- **Accessibility access**: System Settings → Privacy & Security → Accessibility
- Grant access to **iTerm.app** (or whichever terminal runs the script)
- The Antigravity app must be open

## Project Structure

```
mikoclaw/
├── .env                    # API keys (gitignored)
├── .env.example            # Template for .env
├── .agents/workflows/      # Workflow definitions
│   └── mikoclaw-comms.md   # 2-way comms workflow
├── container/
│   ├── agent-runner/       # Container-side agent code
│   │   └── src/index.ts    # Direct OpenRouter API + Brave Search
│   ├── build.sh            # Docker build script
│   └── Dockerfile
├── scripts/
│   ├── auto-checker.sh     # Polls /antigrav, types "check" in Antigravity
│   ├── comms.ts            # CLI for Antigravity ↔ MikoClaw comms
│   ├── register-telegram.ts # Register Telegram chat
│   └── start.sh            # Startup script (bot + dashboard + checker)
├── src/
│   ├── channels/
│   │   ├── telegram.ts     # Telegram channel + /antigrav, /mikoclaw commands
│   │   └── registry.ts     # Channel registration
│   ├── container-runner.ts # Docker container management
│   ├── credential-proxy.ts # API key proxy (containers never see secrets)
│   ├── dashboard.ts        # Web dashboard + API
│   ├── db.ts               # SQLite database
│   └── index.ts            # Main entry point + comms watcher
├── store/
│   └── messages.db         # SQLite database (gitignored)
├── data/
│   └── comms/              # File-based communication queues
├── groups/
│   └── telegram_main/      # Telegram group config + logs
├── com.mikoclaw.agent.plist # macOS launchd config
├── RESTORE.md              # Full restore instructions
└── README.md               # This file
```

## Features

- **Multi-model**: Switch between DeepSeek, GPT-4o, Claude, Gemini, Llama, Mixtral via `/model`
- **Web Search**: Brave Search via function calling (automatic when asking about current events)
- **Persistent Memory**: Last 20 messages (24hrs) loaded as context per session
- **2-Way Comms**: `/antigrav` command routes messages to Antigravity IDE
- **Direct Reply**: Antigravity responds via Telegram Bot API (0 tokens, MikoClaw aware)
- **Auto-Start**: launchd service starts everything on boot
- **Dashboard**: localhost:3333 for monitoring
- **Secure**: Containers never see API keys (credential proxy)

## For AI Agents Rebuilding This

If you are an AI agent tasked with rebuilding or restoring this system:

1. Clone the repo and `npm install`
2. Copy `.env.example` to `.env` and fill in the API keys
3. Run `bash container/build.sh` to build the Docker image
4. Register the Telegram chat: `npx tsx scripts/register-telegram.ts`
5. Start with `bash scripts/start.sh`
6. Install launchd: `cp com.mikoclaw.agent.plist ~/Library/LaunchAgents/ && launchctl load ~/Library/LaunchAgents/com.mikoclaw.agent.plist`
7. Grant Accessibility access for the auto-checker

### Key Technical Notes

- The credential proxy on port 3001 injects the OpenRouter API key into container requests
- Containers use the `openai` npm package talking to `http://host:3001/v1`
- The agent-runner supports function calling for web search (Brave)
- Model selection is stored in `router_state` table with key `model:<chatJid>`
- Conversation history is loaded from `messages` table (last 20 messages within 24hrs)
- The auto-checker uses `com.google.antigravity` bundle ID with Quartz mouse clicks
- Direct replies use `is_from_me=1, is_bot_message=1` so MikoClaw treats them as its own messages
