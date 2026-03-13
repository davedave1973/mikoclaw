/**
 * Register a Telegram chat as the main group directly in the DB.
 * Usage: npx tsx scripts/register-telegram.ts <chat_id>
 */
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

const STORE_DIR = path.resolve(process.cwd(), 'store');
const GROUPS_DIR = path.resolve(process.cwd(), 'groups');
const chatId = process.argv[2];

if (!chatId) { console.error('Usage: npx tsx scripts/register-telegram.ts <chat_id>'); process.exit(1); }

const jid = chatId.startsWith('tg:') ? chatId : `tg:${chatId}`;
const dbPath = path.join(STORE_DIR, 'messages.db');
fs.mkdirSync(STORE_DIR, { recursive: true });

const db = new Database(dbPath);
db.exec(`CREATE TABLE IF NOT EXISTS registered_groups (
  jid TEXT PRIMARY KEY, name TEXT NOT NULL, folder TEXT NOT NULL UNIQUE,
  trigger_pattern TEXT NOT NULL, added_at TEXT NOT NULL, container_config TEXT,
  requires_trigger INTEGER DEFAULT 1, is_main INTEGER DEFAULT 0
);`);
try { db.exec(`ALTER TABLE registered_groups ADD COLUMN is_main INTEGER DEFAULT 0`); } catch {}

db.prepare(`INSERT OR REPLACE INTO registered_groups (jid, name, folder, trigger_pattern, added_at, container_config, requires_trigger, is_main)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(jid, 'Main', 'telegram_main', '@WizDudeBot', new Date().toISOString(), null, 0, 1);

fs.mkdirSync(path.join(GROUPS_DIR, 'telegram_main', 'logs'), { recursive: true });
db.close();
console.log(`Registered ${jid} as main group.`);
