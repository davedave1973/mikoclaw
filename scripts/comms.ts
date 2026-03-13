#!/usr/bin/env npx tsx
/**
 * CLI for Antigravity ↔ MikoClaw communication
 * 
 * Usage:
 *   npx tsx scripts/comms.ts send "Hello MikoClaw"    # Send message to MikoClaw
 *   npx tsx scripts/comms.ts read                      # Read messages from MikoClaw/users
 *   npx tsx scripts/comms.ts clear                     # Clear read messages
 */
import fs from 'fs';
import path from 'path';

const PROJECT_DIR = path.resolve(import.meta.dirname, '..');
const TO_ANTIGRAV = path.join(PROJECT_DIR, 'data', 'comms', 'to-antigrav');
const TO_MIKOCLAW = path.join(PROJECT_DIR, 'data', 'comms', 'to-mikoclaw');
const FROM_MIKOCLAW = path.join(PROJECT_DIR, 'data', 'comms', 'from-mikoclaw');

fs.mkdirSync(TO_ANTIGRAV, { recursive: true });
fs.mkdirSync(TO_MIKOCLAW, { recursive: true });
fs.mkdirSync(FROM_MIKOCLAW, { recursive: true });

const [,, action, ...rest] = process.argv;

function readDir(dir: string): any[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .sort()
    .map(f => {
      try { return { file: f, ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) }; }
      catch { return null; }
    })
    .filter(Boolean);
}

if (action === 'send') {
  const message = rest.join(' ');
  if (!message) { console.error('Usage: comms.ts send "message"'); process.exit(1); }
  const filename = `${Date.now()}.json`;
  fs.writeFileSync(path.join(TO_MIKOCLAW, filename), JSON.stringify({
    from: 'antigravity',
    message,
    timestamp: new Date().toISOString(),
  }));
  console.log(`✅ Sent to MikoClaw: "${message}"`);

} else if (action === 'read') {
  console.log('\n📨 Messages for Antigravity:');
  const msgs = readDir(TO_ANTIGRAV);
  if (msgs.length === 0) { console.log('  (none)'); }
  else { msgs.forEach(m => console.log(`  [${m.timestamp}] ${m.from}: ${m.message}`)); }

  console.log('\n📬 Responses from MikoClaw:');
  const responses = readDir(FROM_MIKOCLAW);
  if (responses.length === 0) { console.log('  (none)'); }
  else { responses.forEach(m => console.log(`  [${m.timestamp}] ${m.response}`)); }

} else if (action === 'clear') {
  for (const dir of [TO_ANTIGRAV, FROM_MIKOCLAW]) {
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    files.forEach(f => fs.unlinkSync(path.join(dir, f)));
    console.log(`Cleared ${files.length} files from ${path.basename(dir)}`);
  }

} else {
  console.log(`
Antigravity ↔ MikoClaw Comms CLI

  send <message>   Send message to MikoClaw
  read              Read messages from users & MikoClaw responses  
  clear             Clear read messages

Directories:
  data/comms/to-antigrav/   ← Messages from /antigrav command (for you to read)
  data/comms/to-mikoclaw/   ← Messages you send (MikoClaw picks up)
  data/comms/from-mikoclaw/ ← MikoClaw responses
`);
}
