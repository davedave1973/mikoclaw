#!/bin/bash
# MikoClaw Auto-Checker v3
# Polls for /antigrav messages, activates Antigravity, clicks input field, types "check"
# Uses Python Quartz for mouse clicks (built into macOS, no install needed)

INTERVAL=20
QUEUE_DIR="/Users/miko/antigravprojects/mikoclaw/data/comms/to-antigrav"
PROCESSED_DIR="/Users/miko/antigravprojects/mikoclaw/data/comms/processed"
mkdir -p "$PROCESSED_DIR"

echo "🤖 Auto-checker v3 started (every ${INTERVAL}s)"
echo "   Press Ctrl+C to stop."
echo ""

while true; do
  FILES=$(find "$QUEUE_DIR" -name "*.json" 2>/dev/null)
  
  if [ -n "$FILES" ]; then
    echo "[$(date +%H:%M:%S)] 📨 New message detected!"
    
    # FIRST: Move files so we never re-trigger
    for f in $FILES; do
      mv "$f" "$PROCESSED_DIR/" 2>/dev/null
    done
    echo "[$(date +%H:%M:%S)] 📁 Queue cleared"
    
    # Activate Antigravity app
    osascript -e 'tell application id "com.google.antigravity" to activate'
    sleep 2
    
    # Use Python Quartz to click the input field at bottom of window
    python3 -c "
import Quartz
import time
import subprocess

# Get frontmost window bounds via AppleScript
result = subprocess.run(['osascript', '-e', 
    'tell application \"System Events\" to tell process \"Electron\" to get {position, size} of front window'],
    capture_output=True, text=True)
parts = result.stdout.strip().split(', ')
if len(parts) == 4:
    wx, wy, ww, wh = int(parts[0]), int(parts[1]), int(parts[2]), int(parts[3])
    # Click center-x, 50px from bottom (where input field is)
    cx, cy = wx + ww // 2, wy + wh - 50
    pos = Quartz.CGPointMake(cx, cy)
    # Move mouse
    move = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventMouseMoved, pos, 0)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, move)
    time.sleep(0.1)
    # Click
    down = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseDown, pos, 0)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, down)
    time.sleep(0.05)
    up = Quartz.CGEventCreateMouseEvent(None, Quartz.kCGEventLeftMouseUp, pos, 0)
    Quartz.CGEventPost(Quartz.kCGHIDEventTap, up)
    print(f'Clicked at ({cx}, {cy})')
else:
    print('Could not get window bounds')
"
    sleep 0.5
    
    # Now type "check" and press Enter
    osascript -e '
      tell application "System Events"
        keystroke "check"
        delay 0.3
        keystroke return
      end tell
    '
    
    echo "[$(date +%H:%M:%S)] ✅ Done"
  fi
  
  sleep $INTERVAL
done
