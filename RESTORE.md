# MikoClaw Restore Guide

Complete instructions for restoring MikoClaw from scratch on a fresh macOS machine.

## Prerequisites

- macOS (tested on Sonoma)
- Node.js 22+ (`brew install node`)
- Docker Desktop (`brew install --cask docker`)
- Git (`brew install git`)

## Step 1: Clone

```bash
cd ~/antigravprojects
git clone https://github.com/davedave1973/mikoclaw.git
cd mikoclaw
npm install
```

## Step 2: Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in:
- `OPENROUTER_API_KEY` — from https://openrouter.ai/keys
- `TELEGRAM_BOT_TOKEN` — from Telegram @BotFather
- `ASSISTANT_NAME` — e.g. `WizDudeBot`
- `BRAVE_API_KEY` — from https://api.search.brave.com/app/keys (optional)

## Step 3: Build Container

```bash
bash container/build.sh
```

This builds the Docker image `nanoclaw-agent:latest` with:
- Node.js 22
- Chromium (for potential browser tasks)
- The agent-runner (OpenRouter API + Brave Search function calling)

## Step 4: Register Telegram Chat

```bash
npx tsx scripts/register-telegram.ts
```

Then send a message to @WizDudeBot on Telegram. The script will detect the chat and register it.

## Step 5: Test

```bash
npm run dev
```

Send a message to @WizDudeBot on Telegram. You should get a response from DeepSeek.

## Step 6: Start Dashboard

```bash
npx tsx src/dashboard.ts
```

Open http://localhost:3333 to see the dashboard.

## Step 7: Auto-Start on Boot

```bash
# Copy launchd config
cp com.mikoclaw.agent.plist ~/Library/LaunchAgents/

# Load (starts immediately + on every reboot)
launchctl load ~/Library/LaunchAgents/com.mikoclaw.agent.plist

# Verify
launchctl list | grep mikoclaw
```

This starts 3 processes on boot:
1. **MikoClaw Bot** — Telegram bot + credential proxy (port 3001)
2. **Dashboard** — Web UI (port 3333)
3. **Auto-Checker** — Polls /antigrav queue every 20s

## Step 8: Grant Accessibility (for Auto-Checker)

The auto-checker uses AppleScript to type "check" in the Antigravity IDE when a `/antigrav` message arrives.

1. Open **System Settings → Privacy & Security → Accessibility**
2. Add and enable **iTerm.app** (or Terminal.app)
3. Add and enable **Antigravity.app** (should already be there)

## Step 9: Verify Everything

```bash
# Check bot is running
curl -s http://localhost:3333/api/model
# Should return: {"model":"deepseek/deepseek-chat-v3-0324"}

# Check dashboard
open http://localhost:3333

# Test comms
npx tsx scripts/comms.ts reply "Hello from restore test!"
# Should appear in Telegram
```

## Troubleshooting

### Bot not responding
- Check `.env` has valid OPENROUTER_API_KEY
- Check Docker Desktop is running
- Check port 3001 is free: `lsof -ti:3001`

### Web search not working
- Check `.env` has valid BRAVE_API_KEY
- Test directly: `curl -s "https://api.search.brave.com/res/v1/web/search?q=test&count=1" -H "X-Subscription-Token: YOUR_KEY"`

### Auto-checker not typing
- Check Accessibility permissions in System Settings
- Check the Antigravity app is open
- Check process name: `osascript -e 'tell application "System Events" to get name of every process whose frontmost is true'`
- The app bundle ID should be `com.google.antigravity`

### Model errors
- Check model IDs at https://openrouter.ai/models
- Use `/model` in Telegram to see available presets
- Use `/model deepseek` to switch back to default

## Important Paths

| Path | Purpose |
|------|---------|
| `.env` | API keys (NEVER commit) |
| `store/messages.db` | SQLite database |
| `data/comms/` | File-based communication queues |
| `groups/telegram_main/` | Telegram group config + logs |
| `container/agent-runner/src/index.ts` | LLM agent code |
| `src/channels/telegram.ts` | Telegram commands |
| `src/dashboard.ts` | Dashboard + API |
| `scripts/comms.ts` | CLI for 2-way comms |
| `scripts/auto-checker.sh` | Auto-checker daemon |
| `scripts/start.sh` | Startup script |
