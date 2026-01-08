/**
 * Claudefi Orchestrator
 *
 * Main agent loop that dispatches to domain subagents.
 * Follows the pattern: observe → think → act → learn → repeat
 */

import 'dotenv/config';
import type { Domain, AgentDecision, DomainContext } from '../types/index.js';
import { subagents, getSubagent } from '../subagents/index.js';
import {
  getDomainBalance,
  getOpenPositions,
  getRecentDecisions,
  getPerformanceSnapshots,
  takePerformanceSnapshot,
  getPortfolio,
  getCachedPools,
  getCachedPerpMarkets,
  getCachedPolymarkets,
  getCachedSpotTokens,
} from '../db/index.js';

// Claude client for real AI decisions
import { getClaudeDecision, isClaudeAvailable } from '../clients/anthropic/client.js';

// Rich prompt builders
import { getSystemPrompt, getUserPrompt } from '../prompts/index.js';

// Telegram alerts
import { sendTradeAlert, sendErrorAlert } from '../telegram/alerts.js';
import { isBotRunning } from '../telegram/bot.js';

/**
 * Build context for a domain
 */
async function buildDomainContext(domain: Domain): Promise<DomainContext> {
  const [balance, positions, recentDecisions, snapshots] = await Promise.all([
    getDomainBalance(domain),
    getOpenPositions(domain),
    getRecentDecisions(domain, 5),
    getPerformanceSnapshots(domain, 10),
  ]);

  // Fetch markets based on domain - use larger limits for rich context
  let markets: unknown[] = [];
  switch (domain) {
    case 'dlmm':
      markets = await getCachedPools(100); // Was 30, now 100 pools
      break;
    case 'perps':
      markets = await getCachedPerpMarkets(80); // Was 30, now 80 markets
      break;
    case 'polymarket':
      markets = await getCachedPolymarkets(80); // Was 30, now 80 markets
      break;
    case 'spot':
      markets = await getCachedSpotTokens(60); // Was 20, now 60 tokens
      break;
  }

  const now = new Date();
  return {
    domain,
    balance,
    positions,
    markets: markets.map(m => ({
      // DLMM: pool_address, Perps: symbol, Polymarket: condition_id, Spot: mint (Solana address)
      id: String(
        (m as Record<string, unknown>).pool_address ||
        (m as Record<string, unknown>).mint ||
        (m as Record<string, unknown>).condition_id ||
        (m as Record<string, unknown>).symbol ||
        (m as Record<string, unknown>).address ||
        (m as Record<string, unknown>).id ||
        ''
      ),
      name: String((m as Record<string, unknown>).name || (m as Record<string, unknown>).symbol || (m as Record<string, unknown>).question),
      domain,
      metadata: m as Record<string, unknown>,
    })),
    recentDecisions,
    performanceSnapshots: snapshots,
    timestamp: now.toISOString(),
    currentDate: now.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric'
    }), // "January 8, 2026"
  };
}

/**
 * Format context as prompt for Claude
 */
function formatContextPrompt(context: DomainContext): string {
  const lines: string[] = [
    `## Current State (${context.domain.toUpperCase()})`,
    `Timestamp: ${context.timestamp}`,
    `Available Balance: $${context.balance.toFixed(2)}`,
    '',
    `### Open Positions (${context.positions.length})`,
  ];

  if (context.positions.length === 0) {
    lines.push('No open positions.');
  } else {
    context.positions.forEach((p, i) => {
      const pnl = p.currentValueUsd - p.entryValueUsd;
      const pnlPct = ((pnl / p.entryValueUsd) * 100).toFixed(1);
      lines.push(`${i + 1}. ${p.target}`);
      lines.push(`   Entry: $${p.entryValueUsd.toFixed(2)} → Current: $${p.currentValueUsd.toFixed(2)} (${pnl >= 0 ? '+' : ''}${pnlPct}%)`);
    });
  }

  lines.push('');
  lines.push(`### Available Markets (top ${Math.min(context.markets.length, 10)})`);
  context.markets.slice(0, 10).forEach((m, i) => {
    const meta = m.metadata;
    let summary = m.name;

    // Add domain-specific details
    if (context.domain === 'dlmm') {
      const tvl = (meta.tvl as number) || 0;
      const apr = (meta.fee_apr as number) || 0;
      summary = `${m.name} | TVL: $${(tvl / 1000).toFixed(0)}k | APR: ${apr.toFixed(1)}%`;
    } else if (context.domain === 'perps') {
      const price = (meta.price as number) || 0;
      const change = (meta.change_24h as number) || 0;
      summary = `${m.name} | $${price.toFixed(2)} | ${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
    } else if (context.domain === 'polymarket') {
      const yesPrice = (meta.yes_price as number) || 0;
      summary = `${m.name} | YES: ${(yesPrice * 100).toFixed(0)}%`;
    } else if (context.domain === 'spot') {
      const price = (meta.price as number) || 0;
      const change = (meta.change_24h as number) || 0;
      summary = `${m.name} | $${price.toFixed(6)} | ${change >= 0 ? '+' : ''}${change.toFixed(1)}%`;
    }

    lines.push(`${i + 1}. ${summary}`);
  });

  lines.push('');
  lines.push('### Recent Decisions');
  if (context.recentDecisions.length === 0) {
    lines.push('No recent decisions.');
  } else {
    context.recentDecisions.slice(0, 3).forEach(d => {
      lines.push(`- ${d.action}: ${d.target || 'N/A'} | ${d.outcome || 'pending'}`);
    });
  }

  lines.push('');
  lines.push('### Required Decision Format (JSON)');
  lines.push('```json');
  lines.push('{');
  lines.push('  "action": "add_liquidity|remove_liquidity|open_long|open_short|close_position|buy|sell|hold",');
  lines.push('  "target": "pool_address or symbol or condition_id",');
  lines.push('  "amountUsd": 100,');
  lines.push('  "reasoning": "Clear explanation of your decision",');
  lines.push('  "confidence": 0.8');
  lines.push('}');
  lines.push('```');

  return lines.join('\n');
}

/**
 * Run a single domain cycle
 */
export async function runDomainCycle(domain: Domain): Promise<AgentDecision | null> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Claudefi - ${domain.toUpperCase()} Cycle`);
  console.log(`${'='.repeat(60)}`);

  const subagent = getSubagent(domain);
  console.log(`Subagent: ${subagent.name}`);

  // 1. OBSERVE - Build context
  console.log('\n📊 Observing market state...');
  const context = await buildDomainContext(domain);
  console.log(`   Balance: $${context.balance.toFixed(2)}`);
  console.log(`   Open positions: ${context.positions.length}`);
  console.log(`   Available markets: ${context.markets.length}`);

  // 2. THINK - Build prompts using rich context builders
  console.log('\n🧠 Building rich decision prompt...');
  const systemPrompt = getSystemPrompt(domain);
  const userPrompt = getUserPrompt(domain, context);

  // 3. ACT - Get decision from Claude
  let decision: AgentDecision;

  if (isClaudeAvailable()) {
    console.log('\n🤖 Calling Claude for decision...');
    try {
      decision = await getClaudeDecision(systemPrompt, userPrompt, domain);
    } catch (error) {
      console.error('   Claude API error:', error);
      decision = {
        domain,
        action: 'hold',
        reasoning: `API error: ${error}. Holding position.`,
        confidence: 0.1,
      };
    }
  } else {
    console.log('\n⚠️  No ANTHROPIC_API_KEY - using mock decision');
    decision = {
      domain,
      action: 'hold',
      reasoning: 'No API key configured. Add ANTHROPIC_API_KEY to .env for real Claude calls.',
      confidence: 0.5,
    };
  }

  console.log('\n🎯 Decision:', JSON.stringify(decision, null, 2));

  // 5. ALERT - Send telegram notification if bot is running
  if (isBotRunning() && decision.action !== 'hold') {
    try {
      const { sent, failed } = await sendTradeAlert(domain, decision);
      if (sent > 0) {
        console.log(`\n📱 Telegram alert sent to ${sent} subscriber(s)`);
      }
    } catch (error) {
      console.error('Failed to send telegram alert:', error);
    }
  }

  // 6. LEARN - Take performance snapshot
  const totalValue = context.balance + context.positions.reduce((sum, p) => sum + p.currentValueUsd, 0);
  await takePerformanceSnapshot(domain, totalValue, context.positions.length);
  console.log(`\n📸 Snapshot: $${totalValue.toFixed(2)} total value`);

  return decision;
}

/**
 * Run full cycle across all active domains
 */
export async function runFullCycle(): Promise<void> {
  const activeDomains = (process.env.ACTIVE_DOMAINS || 'dlmm,perps,polymarket,spot')
    .split(',')
    .map(d => d.trim()) as Domain[];

  console.log('\nCLAUDEFI - Full Cycle Starting');
  console.log(`Active domains: ${activeDomains.join(', ')}`);
  console.log(`Mode: ${process.env.PAPER_TRADING === 'true' ? 'PAPER' : 'LIVE'}`);

  // Get portfolio overview
  const portfolio = await getPortfolio();
  console.log(`\n💰 Portfolio: $${portfolio.totalValueUsd.toFixed(2)}`);
  Object.entries(portfolio.domains).forEach(([domain, data]) => {
    console.log(`   ${domain}: $${data.totalValue.toFixed(2)} (${data.numPositions} positions)`);
  });

  // Run each domain cycle
  const decisions: AgentDecision[] = [];
  for (const domain of activeDomains) {
    try {
      const decision = await runDomainCycle(domain);
      if (decision) {
        decisions.push(decision);
      }
    } catch (error) {
      console.error(`Error in ${domain} cycle:`, error);
      // Send error alert if bot is running
      if (isBotRunning()) {
        await sendErrorAlert(`Error in ${domain} cycle: ${error}`, 'error', domain);
      }
    }

    // Stagger between domains (3 minutes in production)
    if (activeDomains.indexOf(domain) < activeDomains.length - 1) {
      console.log('\n⏳ Waiting before next domain...');
      // await new Promise(resolve => setTimeout(resolve, 180000)); // 3 min
    }
  }

  console.log('\nCLAUDEFI - Cycle Complete');
  console.log(`Decisions made: ${decisions.filter(d => d.action !== 'hold').length}`);
}

/**
 * Start the scheduler for continuous cycles
 */
export async function startScheduler(): Promise<void> {
  const intervalMs = parseInt(process.env.CYCLE_INTERVAL_MS || '1800000'); // 30 min default

  console.log('Claudefi Scheduler Starting');
  console.log(`Cycle interval: ${intervalMs / 60000} minutes`);

  // Run immediately
  await runFullCycle();

  // Schedule recurring cycles
  setInterval(async () => {
    try {
      await runFullCycle();
    } catch (error) {
      console.error('Cycle error:', error);
    }
  }, intervalMs);
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  startScheduler().catch(console.error);
}
