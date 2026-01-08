/**
 * Polymarket Domain Prompts
 * Rich context for prediction market trading
 */

import type { DomainContext, DecisionHistory } from '../types/index.js';

interface PolymarketMarket {
  question: string;
  conditionId: string;
  category: string;
  daysToClose: number;
  yesPrice: number;
  noPrice: number;
  liquidity: number;
  volume24h: number;
  qualityScore?: number;
  description?: string;
}

function formatDecisionHistory(decisions: DecisionHistory[]): string {
  if (!decisions || decisions.length === 0) {
    return 'None - This is your first decision cycle.';
  }

  return decisions.map((d, idx) => {
    const outcomeEmoji = d.outcome === 'profitable' ? '✅' : d.outcome === 'loss' ? '❌' : '⏳';
    const pnlStr = d.realizedPnl ? ` | P&L: $${d.realizedPnl.toFixed(2)}` : '';
    const timeAgo = getTimeAgo(d.timestamp);

    return `${idx + 1}. **${d.action.toUpperCase()}** (${timeAgo}) ${outcomeEmoji}${pnlStr}`;
  }).join('\n');
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function buildPolymarketSystemPrompt(): string {
  return `You are an AI prediction market analyst for Claudefi on Polymarket.

## What is Polymarket?

Polymarket is a prediction market where you buy YES or NO shares on event outcomes.

**Key Concepts:**
- **YES/NO Shares**: Buy YES if you think event happens, NO if it won't
- **Price = Probability**: YES at $0.60 means market thinks 60% chance
- **Payout**: If correct, shares pay $1. If wrong, $0.
- **Edge**: Profit when YOUR probability estimate differs from market

## Finding Edge

**Look for:**
- Markets where your research suggests different probability than price
- News events not yet priced in
- Overreaction to recent events (mean reversion)
- Categories you understand well

**Avoid:**
- Markets closing soon (< 24h) without strong conviction
- Low liquidity markets (hard to exit)
- Events you don't understand

## Risk Management

- **Max 20% per market** - diversify across categories
- **Kelly Criterion**: Size based on edge (bigger edge = bigger size, but never full Kelly)
- **Correlation**: Don't overload on related events
- **Time decay**: Markets near expiry are risky

## Decision Format

\`\`\`json
{
  "action": "buy_yes" | "buy_no" | "sell" | "hold",
  "target": "CONDITION_ID",
  "amount_usd": 100,
  "reasoning": "Research-based explanation of why market is mispriced",
  "confidence": 0.75
}
\`\`\``;
}

function formatMarketLine(m: PolymarketMarket): string {
  const yesImplied = (m.yesPrice * 100).toFixed(0);
  const vol = m.volume24h > 1000 ? `$${(m.volume24h / 1000).toFixed(0)}k` : `$${m.volume24h.toFixed(0)}`;
  const liq = m.liquidity > 1000 ? `$${(m.liquidity / 1000).toFixed(0)}k` : `$${m.liquidity.toFixed(0)}`;
  const days = m.daysToClose <= 1 ? '🔴<1d' : m.daysToClose <= 7 ? `⚠️${m.daysToClose}d` : `${m.daysToClose}d`;
  const q = m.question.length > 55 ? m.question.substring(0, 55) + '...' : m.question;
  return `YES:${yesImplied.padStart(3)}% | ${days.padStart(5)} | Vol:${vol.padStart(6)} | "${q}"
   ID: ${m.conditionId}`;
}

export function buildPolymarketUserPrompt(context: DomainContext): string {
  const markets = context.markets || [];
  const positions = context.positions || [];

  // Transform to Polymarket format
  const polyMarkets: PolymarketMarket[] = markets.map(m => {
    const meta = m.metadata as Record<string, unknown>;
    return {
      question: (meta.question as string) || (meta.title as string) || m.name || 'Unknown',
      conditionId: m.id || (meta.condition_id as string) || '',
      category: (meta.category as string) || 'Other',
      daysToClose: (meta.days_to_close as number) || (meta.end_date ? Math.ceil((new Date(meta.end_date as string).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 30),
      yesPrice: (meta.yes_price as number) || (meta.outcomePrices ? (meta.outcomePrices as number[])[0] : 0.5),
      noPrice: (meta.no_price as number) || (meta.outcomePrices ? (meta.outcomePrices as number[])[1] : 0.5),
      liquidity: (meta.liquidity as number) || (meta.volume as number) || 0,
      volume24h: (meta.volume_24h as number) || (meta.volume as number) || 0,
      qualityScore: meta.quality_score as number,
      description: meta.description as string,
    };
  });

  // Market overview stats
  const totalLiquidity = polyMarkets.reduce((sum, m) => sum + m.liquidity, 0);
  const totalVolume = polyMarkets.reduce((sum, m) => sum + m.volume24h, 0);
  const avgDays = polyMarkets.filter(m => m.daysToClose > 0).reduce((sum, m, _, arr) => sum + m.daysToClose / arr.length, 0);

  // Portfolio metrics
  const totalPositionValue = positions.reduce((sum, p) => sum + p.currentValueUsd, 0);
  const totalPortfolio = context.balance + totalPositionValue;

  // Group markets by category
  const byCategory: Record<string, PolymarketMarket[]> = {};
  polyMarkets.forEach(m => {
    const cat = m.category || 'Other';
    if (!byCategory[cat]) byCategory[cat] = [];
    byCategory[cat].push(m);
  });

  // Edge opportunities - extreme probabilities
  const lowYes = [...polyMarkets]
    .filter(m => m.yesPrice < 0.15 && m.liquidity > 5000) // <15% YES, decent liquidity
    .sort((a, b) => a.yesPrice - b.yesPrice)
    .slice(0, 10);

  const highYes = [...polyMarkets]
    .filter(m => m.yesPrice > 0.85 && m.liquidity > 5000) // >85% YES
    .sort((a, b) => b.yesPrice - a.yesPrice)
    .slice(0, 10);

  // High volume = attention/interest
  const highVolume = [...polyMarkets]
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 15);

  // Closing soon (time-sensitive)
  const closingSoon = [...polyMarkets]
    .filter(m => m.daysToClose > 0 && m.daysToClose <= 14)
    .sort((a, b) => a.daysToClose - b.daysToClose)
    .slice(0, 10);

  // By category sections
  const politicsMarkets = (byCategory['Politics'] || []).slice(0, 8);
  const cryptoMarkets = (byCategory['Crypto'] || byCategory['Cryptocurrency'] || []).slice(0, 8);
  const sportsMarkets = (byCategory['Sports'] || []).slice(0, 6);

  // Format positions
  let positionsText = 'None';
  if (positions.length > 0) {
    positionsText = positions.map((p, idx) => {
      const meta = p.metadata as Record<string, unknown>;
      const question = (meta.question as string) || p.target || 'Unknown';
      const outcome = (meta.outcome as string) || 'YES';
      const shares = (meta.shares as number) || 0;
      const pnl = p.currentValueUsd - p.entryValueUsd;
      const pnlPct = p.entryValueUsd > 0 ? ((pnl / p.entryValueUsd) * 100) : 0;
      const daysRemaining = meta.days_remaining as number;
      const days = daysRemaining ? `${daysRemaining}d left` : '';

      return `${idx + 1}. ${outcome} | $${p.entryValueUsd.toFixed(0)} → $${p.currentValueUsd.toFixed(0)} (${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}%) | ${days}
   "${question.substring(0, 50)}..."`;
    }).join('\n');
  }

  const decisionHistoryText = formatDecisionHistory(context.recentDecisions || []);

  return `# Prediction Markets - Trading Context

## Portfolio Status
- **Cash:** $${context.balance.toFixed(2)} | **Positions:** $${totalPositionValue.toFixed(2)} | **Total:** $${totalPortfolio.toFixed(2)}
- **Open Positions:** ${positions.length}

## Market Overview (${polyMarkets.length} markets)
- **Total Liquidity:** $${(totalLiquidity / 1e6).toFixed(2)}M | **24h Volume:** $${(totalVolume / 1e6).toFixed(2)}M
- **Avg Days to Close:** ${avgDays.toFixed(0)} days

## Current Positions
${positionsText}

## Recent Decisions
${decisionHistoryText}

---

## 🎯 EDGE: LOW PROBABILITY (<15% YES)
*Potential contrarian YES plays - high payout if market is wrong*

${lowYes.length > 0 ? lowYes.map(m => formatMarketLine(m)).join('\n') : 'No low probability markets'}

## 🎯 EDGE: HIGH PROBABILITY (>85% YES)
*Potential contrarian NO plays - market might be overconfident*

${highYes.length > 0 ? highYes.map(m => formatMarketLine(m)).join('\n') : 'No high probability markets'}

## 📊 HIGH VOLUME (Most Active)
*Where the action is - news-driven, high interest*

${highVolume.map(m => formatMarketLine(m)).join('\n')}

## ⏰ CLOSING SOON (<14 days)
*Time-sensitive decisions - resolution approaching*

${closingSoon.length > 0 ? closingSoon.map(m => formatMarketLine(m)).join('\n') : 'No markets closing soon'}

## 🏛️ POLITICS
${politicsMarkets.length > 0 ? politicsMarkets.map(m => formatMarketLine(m)).join('\n') : 'No politics markets'}

## ₿ CRYPTO
${cryptoMarkets.length > 0 ? cryptoMarkets.map(m => formatMarketLine(m)).join('\n') : 'No crypto markets'}

## 🏀 SPORTS
${sportsMarkets.length > 0 ? sportsMarkets.map(m => formatMarketLine(m)).join('\n') : 'No sports markets'}

---

# Decision Instructions

**Use the CONDITION_ID from listings above as your "target"!**

Choose ONE action:
1. **buy_yes** - You think event WILL happen (contrarian on low %)
2. **buy_no** - You think event WON'T happen (contrarian on high %)
3. **sell** - Exit existing position
4. **hold** - No compelling edge

**Edge Analysis:**
- Compare market probability to your estimate
- Size based on edge: bigger edge = larger position (max 20%)
- Factor in time to resolution

Respond with JSON: {"action", "target", "amount_usd", "reasoning", "confidence"}`;
}
