---
description: How to communicate with WizDudeBot via the dashboard API
---

# 2-Way Communication with WizDudeBot

The dashboard at `localhost:3333` provides API endpoints for bidirectional communication.

## Send a message to WizDudeBot
// turbo
```bash
curl -s -X POST http://localhost:3333/api/send -H "Content-Type: application/json" -d '{"message":"YOUR MESSAGE HERE"}'
```

## Read recent bot responses
// turbo
```bash
curl -s http://localhost:3333/api/inbox?limit=5
```

## Check current model
// turbo
```bash
curl -s http://localhost:3333/api/model
```

## Switch model
// turbo
```bash
curl -s -X POST http://localhost:3333/api/model -H "Content-Type: application/json" -d '{"model":"deepseek/deepseek-chat-v3-0324"}'
```

## Read all recent messages (user + bot)
// turbo
```bash
curl -s http://localhost:3333/api/messages | python3 -m json.tool
```

## Available model shortcuts
- `deepseek/deepseek-chat-v3-0324` (default)
- `openai/gpt-4o`
- `openai/gpt-4o-mini`
- `anthropic/claude-3.5-sonnet`
- `google/gemini-2.0-flash`
- `meta-llama/llama-3.1-70b-instruct`
- `mistralai/mixtral-8x7b-instruct`
