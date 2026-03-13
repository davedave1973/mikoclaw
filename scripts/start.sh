#!/bin/bash
# MikoClaw startup script — starts both the bot and dashboard
# Used by launchd for auto-start on boot

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

# Start the main bot
npx tsx src/index.ts &
BOT_PID=$!

# Start the dashboard
npx tsx src/dashboard.ts &
DASH_PID=$!

echo "MikoClaw started (bot=$BOT_PID, dashboard=$DASH_PID)"

# Wait for either to exit
wait $BOT_PID $DASH_PID
