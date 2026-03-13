#!/usr/bin/env npx tsx
/**
 * Antigravity ↔ MikoClaw Comms CLI
 * 
 * Commands:
 *   reply <message>   Send directly to Telegram + store in DB (no AI tokens burned)
 *   send <message>    Send to MikoClaw AI for processing (burns tokens)  
 *   read              Read /antigrav messages from Telegram
 *   clear             Clear read messages
 */
import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const PROJECT_DIR = path.resolve(import.meta.dirname, '..');
const TO_ANTIGRAV = path.join(PROJECT_DIR, 'data', 'comms', 'to-antigrav');
const PROCESSED = path.join(PROJECT_DIR, 'data', 'comms', 'processed');
const TO_MIKOCLAW = path.join(PROJECT_DIR, 'data', 'comms', 'to-mikoclaw');
const DB_PATH = path.join(PROJECT_DIR, 'store', 'messages.db');
const ENV_PATH = path.join(PROJECT_DIR, '.env');

for (const d of [TO_ANTIGRAV, PROCESSED, TO_MIKOCLAW]) fs.mkdirSync(d, { recursive: true });

const [,, action, ...rest] = process.argv;

function loadEnv(): Record<string, string> {
  if (!fs.existsSync(ENV_PATH)) return {};
  const env: Record<string, string> = {};
  for (const line of fs.readFileSync(ENV_PATH, 'utf-8').split('\n')) {
    const [k, ...v] = line.split('=');
    if (k && v.length) env[k.trim()] = v.join('=').trim();
  }
  return env;
}

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

if (action === 'reply') {
  // Direct send: Telegram Bot API + store in DB — no AI tokens burned
  const message = rest.join(' ');
  if (!message) { console.error('Usage: comms.ts reply "message"'); process.exit(1); }
  
  const env = loadEnv();
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) { console.error('❌ No TELEGRAM_BOT_TOKEN in .env'); process.exit(1); }
  
  // Find chat ID from DB
  const db = new Database(DB_PATH);
  const group = db.prepare('SELECT jid FROM registered_groups LIMIT 1').get() as any;
  const chatJid = group?.jid || 'tg:8146835535';
  const chatId = chatJid.replace('tg:', '');
  
  // 1. Send directly to Telegram
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: parseInt(chatId), text: `📡 Antigravity:\n\n${message}` }),
  });
  
  if (!res.ok) {
    console.error(`❌ Telegram API error: ${res.status} ${await res.text()}`);
    process.exit(1);
  }
  
  // 2. Store in DB so MikoClaw has context (is_from_me=1, no tokens burned)
  const msgId = `antigrav-reply-${Date.now()}`;
  db.prepare(
    'INSERT OR REPLACE INTO messages (id, chat_jid, sender, sender_name, content, timestamp, is_from_me, is_bot_message) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(msgId, chatJid, 'antigravity', 'Antigravity', message, new Date().toISOString(), 1, 1);
  db.close();
  
  console.log(`✅ Sent directly to Telegram + stored in DB`);
  console.log(`   MikoClaw is aware (in conversation history) — 0 tokens burned`);

} else if (action === 'send') {
  // Send to MikoClaw AI for processing (burns tokens)
  const message = rest.join(' ');
  if (!message) { console.error('Usage: comms.ts send "message"'); process.exit(1); }
  const filename = `${Date.now()}.json`;
  fs.writeFileSync(path.join(TO_MIKOCLAW, filename), JSON.stringify({
    from: 'antigravity',
    message,
    timestamp: new Date().toISOString(),
  }));
  console.log(`✅ Sent to MikoClaw AI: "${message}" (will burn tokens)`);

} else if (action === 'read') {
  // Read from both to-antigrav and processed
  console.log('\n📨 Messages for Antigravity:');
  const msgs = [...readDir(TO_ANTIGRAV), ...readDir(PROCESSED)];
  if (msgs.length === 0) { console.log('  (none)'); }
  else { msgs.forEach(m => console.log(`  [${m.timestamp}] ${m.from}: ${m.message}`)); }

} else if (action === 'clear') {
  for (const dir of [TO_ANTIGRAV, PROCESSED]) {
    if (!fs.existsSync(dir)) continue;
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));
    files.forEach(f => fs.unlinkSync(path.join(dir, f)));
    console.log(`Cleared ${files.length} files from ${path.basename(dir)}`);
  }

} else {
  console.log(`
Antigravity ↔ MikoClaw Comms CLI

  reply <message>   Send DIRECTLY to Telegram + store in DB (0 tokens)
  send <message>    Send to MikoClaw AI for processing (burns tokens)
  read              Read /antigrav messages from Telegram
  clear             Clear read messages

Flow:
  /antigrav msg → saved to file → Antigravity reads → reply sends directly to Telegram
  MikoClaw stays aware via DB but burns no tokens
`);
}
