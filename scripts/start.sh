#!/bin/bash
# MikoClaw startup script — starts bot, dashboard, and auto-checker
# Used by launchd for auto-start on boot

DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$DIR"

mkdir -p logs

# Start the main bot
npx tsx src/index.ts >> logs/mikoclaw.log 2>&1 &
BOT_PID=$!

# Start the dashboard
npx tsx src/dashboard.ts >> logs/dashboard.log 2>&1 &
DASH_PID=$!

# Start the auto-checker (polls /antigrav queue, types "check" in Antigravity)
bash scripts/auto-checker.sh >> logs/auto-checker.log 2>&1 &
CHECKER_PID=$!

echo "MikoClaw started (bot=$BOT_PID, dashboard=$DASH_PID, checker=$CHECKER_PID)"

# Wait for any to exit
wait $BOT_PID $DASH_PID $CHECKER_PID
