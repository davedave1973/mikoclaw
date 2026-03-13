/**
 * Telegram channel for MikoClaw.
 * Uses node-telegram-bot-api for long-polling based bot integration.
 */
import TelegramBot from 'node-telegram-bot-api';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { registerChannel, ChannelOpts } from './registry.js';
import type { Channel, NewMessage } from '../types.js';

const JID_PREFIX = 'tg:';

function chatIdToJid(chatId: number | string): string {
  return `${JID_PREFIX}${chatId}`;
}

function jidToChatId(jid: string): number {
  return parseInt(jid.slice(JID_PREFIX.length), 10);
}

function createTelegramChannel(opts: ChannelOpts): Channel | null {
  const secrets = readEnvFile(['TELEGRAM_BOT_TOKEN']);
  const token = secrets.TELEGRAM_BOT_TOKEN || process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return null;

  let bot: TelegramBot | null = null;
  let connected = false;

  const channel: Channel = {
    name: 'telegram',

    async connect(): Promise<void> {
      bot = new TelegramBot(token, { polling: true });
      const me = await bot.getMe();
      logger.info({ botUsername: me.username }, 'Telegram bot connected');
      connected = true;

      bot.on('message', (msg) => {
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

        const message: NewMessage = {
          id: `tg-${msg.message_id}-${chatId}`,
          chat_jid: jid,
          sender: msg.from?.id?.toString() || 'unknown',
          sender_name: senderName,
          content: msg.text,
          timestamp: new Date(msg.date * 1000).toISOString(),
          is_from_me: msg.from?.id === me.id,
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
