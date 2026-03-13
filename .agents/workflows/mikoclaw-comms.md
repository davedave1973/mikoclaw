---
description: How to communicate with WizDudeBot via the dashboard API
---

# 2-Way Communication with WizDudeBot

## Via CLI (file-based, most token-efficient)

### Send a message to MikoClaw
// turbo
```bash
cd /Users/miko/antigravprojects/mikoclaw && npx tsx scripts/comms.ts send "your message here"
```

### Read messages from users (via /antigrav) and MikoClaw responses
// turbo
```bash
cd /Users/miko/antigravprojects/mikoclaw && npx tsx scripts/comms.ts read
```

### Clear read messages
// turbo
```bash
cd /Users/miko/antigravprojects/mikoclaw && npx tsx scripts/comms.ts clear
```

## Via Dashboard API (HTTP)

### Send a message
// turbo
```bash
curl -s -X POST http://localhost:3333/api/send -H "Content-Type: application/json" -d '{"message":"YOUR MESSAGE"}'
```

### Read bot responses
// turbo
```bash
curl -s http://localhost:3333/api/inbox?limit=5
```

### Check/switch model
// turbo
```bash
curl -s http://localhost:3333/api/model
curl -s -X POST http://localhost:3333/api/model -H "Content-Type: application/json" -d '{"model":"deepseek/deepseek-chat-v3-0324"}'
```

## Telegram Triggers (for the user)

- `/antigrav <msg>` — User sends a message for Antigravity to read
- `/mikoclaw <msg>` — User sends a direct message to the AI agent  
- `/model [name]` — Switch model
- `/status` — Show config
- `/help` — Show all commands

## File Directories

| Path | Purpose |
|------|---------|
| `data/comms/to-antigrav/` | Messages from `/antigrav` command (for Antigravity to read) |
| `data/comms/to-mikoclaw/` | Messages from Antigravity → MikoClaw (auto-processed) |
| `data/comms/from-mikoclaw/` | MikoClaw responses to Antigravity |

## Available Models
- `deepseek/deepseek-chat-v3-0324` (default)
- `openai/gpt-4o`
- `anthropic/claude-sonnet-4.5`
- `anthropic/claude-haiku-4.5`
- `google/gemini-2.5-flash`
- `google/gemini-2.5-pro`
- `nvidia/llama-3.3-nemotron-super-49b-v1.5`
- `mistralai/mixtral-8x7b-instruct`
