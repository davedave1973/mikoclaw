/**
 * Telegram channel for MikoClaw.
 * Supports commands: /model, /help, /status
 */
import TelegramBot from 'node-telegram-bot-api';
import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { STORE_DIR } from '../config.js';
import { registerChannel, ChannelOpts } from './registry.js';
import type { Channel, NewMessage } from '../types.js';

const JID_PREFIX = 'tg:';
const AVAILABLE_MODELS: Record<string, string> = {
  deepseek: 'deepseek/deepseek-chat-v3-0324',
  'gpt-4o': 'openai/gpt-4o',
  claude: 'anthropic/claude-sonnet-4.5',
  haiku: 'anthropic/claude-haiku-4.5',
  gemini: 'google/gemini-2.5-flash',
  'gemini-pro': 'google/gemini-2.5-pro',
  llama: 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  mixtral: 'mistralai/mixtral-8x7b-instruct',
};

function chatIdToJid(chatId: number | string): string {
  return `${JID_PREFIX}${chatId}`;
}
function jidToChatId(jid: string): number {
  return parseInt(jid.slice(JID_PREFIX.length), 10);
}

function getGroupModel(jid: string): string {
  try {
    const dbPath = path.join(STORE_DIR, 'messages.db');
    if (!fs.existsSync(dbPath)) return 'deepseek/deepseek-chat-v3-0324';
    const db = new Database(dbPath, { readonly: true });
    const row = db
      .prepare('SELECT value FROM router_state WHERE key = ?')
      .get(`model:${jid}`) as { value: string } | undefined;
    db.close();
    return row?.value || 'deepseek/deepseek-chat-v3-0324';
  } catch {
    return 'deepseek/deepseek-chat-v3-0324';
  }
}

function setGroupModel(jid: string, model: string): void {
  try {
    const dbPath = path.join(STORE_DIR, 'messages.db');
    const db = new Database(dbPath);
    db.prepare(
      'INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)',
    ).run(`model:${jid}`, model);
    db.close();
  } catch (err) {
    logger.error({ err }, 'Failed to set model');
  }
}

function createTelegramChannel(opts: ChannelOpts): Channel | null {
  const secrets = readEnvFile(['TELEGRAM_BOT_TOKEN']);
  const token = secrets.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  let bot: TelegramBot | null = null;
  let botMe: TelegramBot.User | null = null;
  let connected = false;

  async function handleCommand(
    msg: TelegramBot.Message,
    command: string,
    args: string,
  ): Promise<boolean> {
    const chatId = msg.chat.id;
    const jid = chatIdToJid(chatId);

    if (command === '/model') {
      if (!args) {
        const current = getGroupModel(jid);
        const modelList = Object.entries(AVAILABLE_MODELS)
          .map(
            ([name, id]) =>
              `  \`${name}\` → ${id}${id === current ? ' ✅' : ''}`,
          )
          .join('\n');
        await bot!.sendMessage(
          chatId,
          `**Current model:** \`${current}\`\n\n**Available:**\n${modelList}\n\nUsage: \`/model deepseek\` or \`/model openai/gpt-4o\``,
          { parse_mode: 'Markdown' },
        );
      } else {
        const modelId = AVAILABLE_MODELS[args.toLowerCase()] || args;
        setGroupModel(jid, modelId);
        await bot!.sendMessage(chatId, `✅ Model switched to \`${modelId}\``, {
          parse_mode: 'Markdown',
        });
        logger.info({ jid, model: modelId }, 'Model switched');
      }
      return true;
    }

    if (command === '/status') {
      const current = getGroupModel(jid);
      await bot!.sendMessage(
        chatId,
        `🟢 **WizDudeBot Status**\n• Model: \`${current}\`\n• Channel: Telegram\n• Dashboard: http://localhost:3333`,
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    if (command === '/ag') {
      if (!args) {
        await bot!.sendMessage(
          chatId,
          '📡 Usage: `/ag your message here`\n\nSends a message to Antigravity (the coding assistant).',
          { parse_mode: 'Markdown' },
        );
      } else {
        const commsDir = path.join(
          process.cwd(),
          'data',
          'comms',
          'to-antigrav',
        );
        fs.mkdirSync(commsDir, { recursive: true });
        const filename = `${Date.now()}.json`;
        fs.writeFileSync(
          path.join(commsDir, filename),
          JSON.stringify({
            from: msg.from?.first_name || 'User',
            message: args,
            timestamp: new Date().toISOString(),
            chatJid: jid,
          }),
        );
        await bot!.sendMessage(chatId, '📡 Message sent to Antigravity ✅');
        logger.info({ message: args }, 'Message queued for Antigravity');
      }
      return true;
    }

    if (command === '/mikoclaw') {
      if (!args) {
        await bot!.sendMessage(
          chatId,
          '🤖 Usage: `/mikoclaw your message here`\n\nSends a direct message to the AI agent.',
          { parse_mode: 'Markdown' },
        );
      } else {
        // Don't intercept — let it fall through as a normal message to the agent
        return false;
      }
      return true;
    }

    if (command === '/help') {
      await bot!.sendMessage(
        chatId,
        `🤖 **WizDudeBot Commands**\n\n` +
          `/model [name] — Switch AI model\n` +
          `/status — Show current config\n` +
          `/ag [msg] — Send message to Antigravity\n` +
          `/mikoclaw [msg] — Send direct message to AI agent\n` +
          `/help — This message\n\n` +
          `Just type normally to chat!`,
        { parse_mode: 'Markdown' },
      );
      return true;
    }

    return false;
  }

  const channel: Channel = {
    name: 'telegram',

    async connect(): Promise<void> {
      bot = new TelegramBot(token, { polling: true });
      botMe = await bot.getMe();
      logger.info({ botUsername: botMe.username }, 'Telegram bot connected');
      connected = true;

      bot.on('message', async (msg) => {
        if (!msg.text) return;
        const chatId = msg.chat.id;
        const jid = chatIdToJid(chatId);
        const isGroup =
          msg.chat.type === 'group' || msg.chat.type === 'supergroup';
        const senderName =
          [msg.from?.first_name, msg.from?.last_name]
            .filter(Boolean)
            .join(' ') || 'Unknown';
        const chatName = msg.chat.title || senderName;

        opts.onChatMetadata(
          jid,
          new Date(msg.date * 1000).toISOString(),
          chatName,
          'telegram',
          isGroup,
        );

        // Handle commands directly (don't pass to agent)
        if (msg.text.startsWith('/')) {
          const [cmd, ...rest] = msg.text.split(' ');
          const handled = await handleCommand(
            msg,
            cmd.split('@')[0],
            rest.join(' '),
          );
          if (handled) return;
        }

        const message: NewMessage = {
          id: `tg-${msg.message_id}-${chatId}`,
          chat_jid: jid,
          sender: msg.from?.id?.toString() || 'unknown',
          sender_name: senderName,
          content: msg.text,
          timestamp: new Date(msg.date * 1000).toISOString(),
          is_from_me: msg.from?.id === botMe!.id,
          is_bot_message: msg.from?.is_bot || false,
        };
        opts.onMessage(jid, message);
      });

      bot.on('polling_error', (err) => {
        logger.error({ err }, 'Telegram polling error');
      });
    },

    async sendMessage(jid: string, text: string): Promise<void> {
      if (!bot) throw new Error('Telegram not connected');
      const chatId = jidToChatId(jid);
      const MAX_LEN = 4096;
      if (text.length <= MAX_LEN) {
        await bot.sendMessage(chatId, text);
      } else {
        for (let i = 0; i < text.length; i += MAX_LEN) {
          await bot.sendMessage(chatId, text.slice(i, i + MAX_LEN));
        }
      }
    },

    isConnected(): boolean {
      return connected;
    },
    ownsJid(jid: string): boolean {
      return jid.startsWith(JID_PREFIX);
    },

    async disconnect(): Promise<void> {
      if (bot) {
        await bot.stopPolling();
        connected = false;
        logger.info('Telegram bot disconnected');
      }
    },

    async setTyping(jid: string, isTyping: boolean): Promise<void> {
      if (!bot || !isTyping) return;
      try {
        await bot.sendChatAction(jidToChatId(jid), 'typing');
      } catch {
        /* best-effort */
      }
    },
  };
  return channel;
}

registerChannel('telegram', createTelegramChannel);
