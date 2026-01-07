/**
 * Telegram Alert Sending
 *
 * Functions to send various types of alerts to subscribers.
 */

import { broadcastMessage } from './bot.js';
import type { TradeAlert, PositionClosedAlert, DailySummaryAlert, ErrorAlert, Alert } from './types.js';
import type { Domain, AgentDecision, Position, Portfolio } from '../types/index.js';

/**
 * Send a trade execution alert
 */
export async function sendTradeAlert(
  domain: Domain,
  decision: AgentDecision
): Promise<{ sent: number; failed: number }> {
  if (decision.action === 'hold') {
    // Don't alert on holds
    return { sent: 0, failed: 0 };
  }

  const emoji = getActionEmoji(decision.action);
  const domainEmoji = getDomainEmoji(domain);
  const confidence = Math.round(decision.confidence * 100);

  const message = `${emoji} <b>Trade Executed</b>\n\n` +
    `${domainEmoji} <b>Domain:</b> ${domain.toUpperCase()}\n` +
    `<b>Action:</b> ${decision.action.toUpperCase()}\n` +
    `<b>Target:</b> <code>${truncate(decision.target || 'N/A', 30)}</code>\n` +
    `<b>Amount:</b> $${(decision.amountUsd || 0).toFixed(2)}\n` +
    `<b>Confidence:</b> ${confidence}%\n\n` +
    `<b>Reasoning:</b>\n<i>${truncate(decision.reasoning, 200)}</i>\n\n` +
    `<i>${new Date().toLocaleString()}</i>`;

  return broadcastMessage(message, 'trade');
}

/**
 * Send a position closed alert
 */
export async function sendPositionClosedAlert(
  domain: Domain,
  position: Position,
  exitValueUsd: number
): Promise<{ sent: number; failed: number }> {
  const pnl = exitValueUsd - position.entryValueUsd;
  const pnlPct = (pnl / position.entryValueUsd) * 100;
  const isProfitable = pnl >= 0;

  // Calculate hold duration
  const openedAt = position.openedAt ? new Date(position.openedAt) : new Date();
  const holdMs = Date.now() - openedAt.getTime();
  const holdDuration = formatDuration(holdMs);

  const emoji = isProfitable ? '' : '';
  const domainEmoji = getDomainEmoji(domain);

  const message = `${emoji} <b>Position Closed</b>\n\n` +
    `${domainEmoji} <b>Domain:</b> ${domain.toUpperCase()}\n` +
    `<b>Target:</b> <code>${truncate(position.target, 30)}</code>\n\n` +
    `<b>Entry:</b> $${position.entryValueUsd.toFixed(2)}\n` +
    `<b>Exit:</b> $${exitValueUsd.toFixed(2)}\n` +
    `<b>P&L:</b> ${isProfitable ? '+' : ''}$${pnl.toFixed(2)} (${isProfitable ? '+' : ''}${pnlPct.toFixed(1)}%)\n` +
    `<b>Held:</b> ${holdDuration}\n\n` +
    `<i>${new Date().toLocaleString()}</i>`;

  return broadcastMessage(message, 'position_closed');
}

/**
 * Send daily summary alert
 */
export async function sendDailySummaryAlert(
  portfolio: Portfolio,
  tradesExecuted: number,
  previousDayValue?: number
): Promise<{ sent: number; failed: number }> {
  const startingBalance = 10000;
  const totalPnl = portfolio.totalValueUsd - startingBalance;
  const totalPnlPct = (totalPnl / startingBalance) * 100;

  // Calculate daily change if we have previous value
  let dailyChange = '';
  if (previousDayValue) {
    const dailyPnl = portfolio.totalValueUsd - previousDayValue;
    const dailyPnlPct = (dailyPnl / previousDayValue) * 100;
    const dailyEmoji = dailyPnl >= 0 ? '' : '';
    dailyChange = `\n<b>24h Change:</b> ${dailyEmoji} ${dailyPnl >= 0 ? '+' : ''}$${dailyPnl.toFixed(2)} (${dailyPnlPct >= 0 ? '+' : ''}${dailyPnlPct.toFixed(1)}%)`;
  }

  const overallEmoji = totalPnl >= 0 ? '' : '';

  let message = ` <b>Daily Summary</b>\n\n`;
  message += `<b>Total AUM:</b> $${portfolio.totalValueUsd.toFixed(2)}${dailyChange}\n`;
  message += `<b>Total P&L:</b> ${overallEmoji} ${totalPnl >= 0 ? '+' : ''}$${totalPnl.toFixed(2)} (${totalPnlPct >= 0 ? '+' : ''}${totalPnlPct.toFixed(1)}%)\n`;
  message += `<b>Open Positions:</b> ${portfolio.positions.length}\n`;
  message += `<b>Trades Today:</b> ${tradesExecuted}\n\n`;

  message += `<b>By Domain:</b>\n`;
  const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
  const startingPerDomain = 2500;

  for (const domain of domains) {
    const d = portfolio.domains[domain];
    const domainPnl = d.totalValue - startingPerDomain;
    const domainEmoji = domainPnl >= 0 ? '' : '';
    message += `${getDomainEmoji(domain)} ${domain.toUpperCase()}: $${d.totalValue.toFixed(0)} ${domainEmoji}\n`;
  }

  message += `\n<i>${new Date().toLocaleDateString()} - End of day report</i>`;

  return broadcastMessage(message, 'daily_summary');
}

/**
 * Send error/warning alert
 */
export async function sendErrorAlert(
  message: string,
  severity: 'warning' | 'error' | 'critical' = 'error',
  domain?: Domain
): Promise<{ sent: number; failed: number }> {
  const emoji = severity === 'critical' ? '' : severity === 'error' ? '' : '';
  const severityLabel = severity.toUpperCase();
  const domainText = domain ? ` (${domain.toUpperCase()})` : '';

  const alertMessage = `${emoji} <b>${severityLabel}${domainText}</b>\n\n` +
    `${message}\n\n` +
    `<i>${new Date().toLocaleString()}</i>`;

  return broadcastMessage(alertMessage, 'error');
}

/**
 * Send a custom alert message
 */
export async function sendCustomAlert(
  title: string,
  message: string,
  emoji: string = ''
): Promise<{ sent: number; failed: number }> {
  const alertMessage = `${emoji} <b>${title}</b>\n\n${message}\n\n<i>${new Date().toLocaleString()}</i>`;
  return broadcastMessage(alertMessage, 'all');
}

// Helper functions

function getActionEmoji(action: string): string {
  switch (action) {
    case 'add_liquidity':
    case 'buy':
    case 'buy_yes':
    case 'buy_no':
    case 'open_long':
      return '';
    case 'remove_liquidity':
    case 'sell':
    case 'close_position':
    case 'open_short':
      return '';
    default:
      return '';
  }
}

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

function formatDuration(ms: number): string {
  const hours = Math.floor(ms / (1000 * 60 * 60));
  const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));

  if (hours < 1) return `${minutes}m`;
  if (hours < 24) return `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
}
