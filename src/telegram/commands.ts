/**
 * Telegram Bot Commands
 *
 * Handles user commands like /start, /status, /positions, etc.
 */

import { Context } from 'telegraf';
import { getPortfolio, getOpenPositions, getRecentDecisions } from '../db/index.js';
import { addSubscriber, updateSubscriber } from './bot.js';
import type { Domain } from '../types/index.js';

/**
 * /start - Subscribe to alerts
 */
export async function handleStart(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id.toString();
  const username = ctx.from?.username;

  if (!chatId) {
    await ctx.reply('Error: Could not determine chat ID');
    return;
  }

  const success = await addSubscriber(chatId, username);

  if (success) {
    await ctx.reply(
      `Welcome to <b>Claudefi</b> - Your Autonomous DeFi Trading Agent!\n\n` +
      `You're now subscribed to trading alerts.\n\n` +
      `<b>Available Commands:</b>\n` +
      `/status - Current portfolio status\n` +
      `/positions - Open positions\n` +
      `/domains - Performance by domain\n` +
      `/stop - Pause alerts\n` +
      `/resume - Resume alerts\n` +
      `/help - Show all commands\n\n` +
      `You'll receive alerts for:\n` +
      `- New trades executed\n` +
      `- Positions closed (with P&L)\n` +
      `- Daily summaries`,
      { parse_mode: 'HTML' }
    );
  } else {
    await ctx.reply('Failed to subscribe. Please try again later.');
  }
}

/**
 * /status - Get current portfolio status
 */
export async function handleStatus(ctx: Context): Promise<void> {
  try {
    const portfolio = await getPortfolio();

    const totalPnl = portfolio.totalValueUsd - 10000; // Starting balance was 10k
    const totalPnlPct = (totalPnl / 10000) * 100;
    const pnlEmoji = totalPnl >= 0 ? '' : '';

    let message = `<b>Claudefi Portfolio Status</b>\n\n`;
    message += `<b>Total AUM:</b> $${portfolio.totalValueUsd.toFixed(2)}\n`;
    message += `<b>Total P&L:</b> ${pnlEmoji} ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)} (${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}%)\n`;
    message += `<b>Open Positions:</b> ${portfolio.positions.length}\n\n`;

    message += `<b>By Domain:</b>\n`;
    const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
    for (const domain of domains) {
      const d = portfolio.domains[domain];
      const domainPnl = d.totalValue - 2500; // 2500 per domain
      const domainEmoji = domainPnl >= 0 ? '' : '';
      message += `${getDomainEmoji(domain)} ${domain.toUpperCase()}: $${d.totalValue.toFixed(0)} ${domainEmoji}\n`;
    }

    message += `\n<i>Last updated: ${new Date().toLocaleTimeString()}</i>`;

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error in /status:', error);
    await ctx.reply('Error fetching portfolio status. Please try again.');
  }
}

/**
 * /positions - List open positions
 */
export async function handlePositions(ctx: Context): Promise<void> {
  try {
    const portfolio = await getPortfolio();
    const positions = portfolio.positions;

    if (positions.length === 0) {
      await ctx.reply('No open positions.');
      return;
    }

    let message = `<b>Open Positions (${positions.length})</b>\n\n`;

    for (const pos of positions) {
      const pnl = pos.currentValueUsd - pos.entryValueUsd;
      const pnlPct = (pnl / pos.entryValueUsd) * 100;
      const emoji = pnl >= 0 ? '' : '';

      message += `${getDomainEmoji(pos.domain)} <b>${pos.domain.toUpperCase()}</b>\n`;
      message += `Target: <code>${truncate(pos.target, 20)}</code>\n`;
      message += `Entry: $${pos.entryValueUsd.toFixed(2)} → Current: $${pos.currentValueUsd.toFixed(2)}\n`;
      message += `P&L: ${emoji} ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error in /positions:', error);
    await ctx.reply('Error fetching positions. Please try again.');
  }
}

/**
 * /domains - Performance breakdown by domain
 */
export async function handleDomains(ctx: Context): Promise<void> {
  try {
    const portfolio = await getPortfolio();

    let message = `<b>Performance by Domain</b>\n\n`;

    const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
    const startingPerDomain = 2500;

    for (const domain of domains) {
      const d = portfolio.domains[domain];
      const pnl = d.totalValue - startingPerDomain;
      const pnlPct = (pnl / startingPerDomain) * 100;
      const emoji = pnl >= 0 ? '' : '';

      message += `${getDomainEmoji(domain)} <b>${domain.toUpperCase()}</b>\n`;
      message += `   Cash: $${d.balance.toFixed(2)}\n`;
      message += `   Positions: $${d.positionsValue.toFixed(2)} (${d.numPositions} open)\n`;
      message += `   Total: $${d.totalValue.toFixed(2)}\n`;
      message += `   P&L: ${emoji} ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%)\n\n`;
    }

    await ctx.reply(message, { parse_mode: 'HTML' });
  } catch (error) {
    console.error('Error in /domains:', error);
    await ctx.reply('Error fetching domain data. Please try again.');
  }
}

/**
 * /stop - Pause alerts
 */
export async function handleStop(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id.toString();

  if (!chatId) {
    await ctx.reply('Error: Could not determine chat ID');
    return;
  }

  const success = await updateSubscriber(chatId, { isActive: false });

  if (success) {
    await ctx.reply(
      'Alerts paused. You will no longer receive notifications.\n\n' +
      'Use /resume to start receiving alerts again.'
    );
  } else {
    await ctx.reply('Failed to pause alerts. Please try again.');
  }
}

/**
 * /resume - Resume alerts
 */
export async function handleResume(ctx: Context): Promise<void> {
  const chatId = ctx.chat?.id.toString();

  if (!chatId) {
    await ctx.reply('Error: Could not determine chat ID');
    return;
  }

  const success = await updateSubscriber(chatId, { isActive: true });

  if (success) {
    await ctx.reply('Alerts resumed! You will now receive trading notifications.');
  } else {
    await ctx.reply('Failed to resume alerts. Please try again.');
  }
}

/**
 * /help - Show available commands
 */
export async function handleHelp(ctx: Context): Promise<void> {
  const message = `<b>Claudefi Bot Commands</b>\n\n` +
    `<b>Monitoring:</b>\n` +
    `/status - Current portfolio status\n` +
    `/positions - List open positions\n` +
    `/domains - Performance by domain\n\n` +
    `<b>Alerts:</b>\n` +
    `/stop - Pause notifications\n` +
    `/resume - Resume notifications\n\n` +
    `<b>Info:</b>\n` +
    `/start - Subscribe to alerts\n` +
    `/help - Show this message\n\n` +
    `<b>Alert Types:</b>\n` +
    ` Trade executed\n` +
    ` Position closed\n` +
    ` Daily summary\n` +
    ` Errors/warnings`;

  await ctx.reply(message, { parse_mode: 'HTML' });
}

// Helper functions

function getDomainEmoji(domain: string): string {
  switch (domain) {
    case 'dlmm': return '';
    case 'perps': return '';
    case 'polymarket': return '';
    case 'spot': return '';
    default: return '';
  }
}

function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 3) + '...';
}
