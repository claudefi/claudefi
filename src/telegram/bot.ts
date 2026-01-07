/**
 * Telegram Bot for Claudefi
 *
 * Provides real-time alerts and commands for monitoring the trading agent.
 */

import { Telegraf, Context } from 'telegraf';
import {
  addTelegramSubscriber,
  removeTelegramSubscriber,
  getActiveTelegramSubscribers,
} from '../db/index.js';
import type { TelegramSubscriber, AlertType } from './types.js';
import { handleStart, handleStatus, handlePositions, handleHelp, handleStop, handleResume, handleDomains } from './commands.js';

let bot: Telegraf | null = null;
let isRunning = false;

/**
 * Initialize and start the Telegram bot
 */
export async function startBot(): Promise<Telegraf | null> {
  const token = process.env.TELEGRAM_BOT_TOKEN;

  if (!token) {
    console.log('TELEGRAM_BOT_TOKEN not set - Telegram alerts disabled');
    return null;
  }

  try {
    bot = new Telegraf(token);

    // Register commands
    bot.command('start', handleStart);
    bot.command('status', handleStatus);
    bot.command('positions', handlePositions);
    bot.command('domains', handleDomains);
    bot.command('stop', handleStop);
    bot.command('resume', handleResume);
    bot.command('help', handleHelp);

    // Handle unknown commands
    bot.on('text', (ctx) => {
      if (ctx.message.text.startsWith('/')) {
        ctx.reply('Unknown command. Use /help to see available commands.');
      }
    });

    // Error handler
    bot.catch((err, ctx) => {
      console.error('Telegram bot error:', err);
    });

    // Start polling
    await bot.launch();
    isRunning = true;
    console.log('Telegram bot started successfully');

    // Enable graceful stop
    process.once('SIGINT', () => bot?.stop('SIGINT'));
    process.once('SIGTERM', () => bot?.stop('SIGTERM'));

    return bot;
  } catch (error) {
    console.error('Failed to start Telegram bot:', error);
    return null;
  }
}

/**
 * Stop the Telegram bot
 */
export function stopBot(): void {
  if (bot) {
    bot.stop();
    isRunning = false;
    console.log('Telegram bot stopped');
  }
}

/**
 * Check if bot is running
 */
export function isBotRunning(): boolean {
  return isRunning;
}

/**
 * Get all active subscribers
 */
export async function getActiveSubscribers(alertType?: AlertType): Promise<TelegramSubscriber[]> {
  const subscribers = await getActiveTelegramSubscribers();

  // Filter by alert type if specified
  const filtered = alertType && alertType !== 'all'
    ? subscribers.filter(s => s.alertTypes.includes(alertType))
    : subscribers;

  return filtered.map(s => ({
    id: s.chatId,
    chatId: s.chatId,
    username: s.username || undefined,
    alertTypes: s.alertTypes as AlertType[],
    isActive: true,
    createdAt: new Date().toISOString(),
  }));
}

/**
 * Add or update a subscriber
 */
export async function addSubscriber(
  chatId: string,
  username?: string,
  alertTypes: AlertType[] = ['trade', 'daily_summary']
): Promise<boolean> {
  try {
    await addTelegramSubscriber(chatId, username);
    return true;
  } catch (error) {
    console.error('Error adding subscriber:', error);
    return false;
  }
}

/**
 * Update subscriber preferences
 */
export async function updateSubscriber(
  chatId: string,
  updates: { alertTypes?: AlertType[]; isActive?: boolean }
): Promise<boolean> {
  try {
    if (updates.isActive === false) {
      await removeTelegramSubscriber(chatId);
    } else {
      // Re-add to activate
      await addTelegramSubscriber(chatId);
    }
    return true;
  } catch (error) {
    console.error('Error updating subscriber:', error);
    return false;
  }
}

/**
 * Send a message to a specific chat
 */
export async function sendMessage(chatId: string, message: string, parseMode: 'HTML' | 'Markdown' = 'HTML'): Promise<boolean> {
  if (!bot) {
    console.log('Bot not initialized - cannot send message');
    return false;
  }

  try {
    await bot.telegram.sendMessage(chatId, message, { parse_mode: parseMode });
    return true;
  } catch (error) {
    console.error(`Failed to send message to ${chatId}:`, error);
    return false;
  }
}

/**
 * Broadcast a message to all active subscribers
 */
export async function broadcastMessage(
  message: string,
  alertType?: AlertType,
  parseMode: 'HTML' | 'Markdown' = 'HTML'
): Promise<{ sent: number; failed: number }> {
  const subscribers = await getActiveSubscribers(alertType);

  let sent = 0;
  let failed = 0;

  for (const subscriber of subscribers) {
    const success = await sendMessage(subscriber.chatId, message, parseMode);
    if (success) {
      sent++;
    } else {
      failed++;
    }
    // Rate limiting: wait 50ms between messages
    await new Promise(resolve => setTimeout(resolve, 50));
  }

  return { sent, failed };
}

export { bot };
