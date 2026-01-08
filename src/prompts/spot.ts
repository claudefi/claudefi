/**
 * Spot Domain Prompts
 * Rich context for memecoin/token trading
 */

import type { DomainContext, DecisionHistory } from '../types/index.js';

interface SpotToken {
  symbol: string;
  name: string;
  address: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  liquidity: number;
  marketCap?: number;
}

function formatDecisionHistory(decisions: DecisionHistory[]): string {
  if (!decisions || decisions.length === 0) {
    return 'None - This is your first decision cycle.';
  }

  return decisions.map((d, idx) => {
    const outcomeEmoji = d.outcome === 'profitable' ? '✅' : d.outcome === 'loss' ? '❌' : '⏳';
    const pnlStr = d.realizedPnl ? ` | P&L: $${d.realizedPnl.toFixed(2)}` : '';
    const targetStr = d.target ? ` ${d.target}` : '';
    const timeAgo = getTimeAgo(d.timestamp);

    return `${idx + 1}. **${d.action.toUpperCase()}**${targetStr} (${timeAgo}) ${outcomeEmoji}${pnlStr}`;
  }).join('\n');
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function buildSpotSystemPrompt(): string {
  return `You are an AI memecoin/spot trader for Claudefi on Solana via Jupiter.

## Memecoin Trading

Memecoins are high-risk, high-reward tokens driven by community, memes, and speculation.

**Key Metrics:**
- **Volume**: High volume = momentum, low = dead coin
- **Liquidity**: Need enough to exit without slippage
- **Price Action**: 24h change shows momentum direction
- **Market Cap**: Lower mcap = more upside but more risk

## Strategy

**Entry Signals:**
- Strong volume surge (3x+ normal)
- Social media buzz
- New narrative/catalyst
- Healthy pullback in uptrend

**Exit Signals:**
- Volume dying
- Failed to break resistance
- Better opportunity elsewhere
- Hit profit target

## Risk Management

- **Max 20% per token** - memecoins are volatile
- **Set mental stops** - exit losers quickly
- **Take profits** - memecoins dump fast
- **Liquidity check** - ensure you can exit

## Decision Format

\`\`\`json
{
  "action": "buy" | "sell" | "hold",
  "target": "TOKEN_ADDRESS",
  "amountUsd": 100,  // REQUIRED for buy/sell (use position value for sells)
  "reasoning": "Why this token, why now",
  "confidence": 0.75
}
\`\`\`

**CRITICAL**: Always include \`amountUsd\` for buy/sell actions. For sells, use the position's current value.
}

function formatTokenLine(t: SpotToken): string {
  const changeStr = t.priceChange24h >= 0 ? `+${t.priceChange24h.toFixed(1)}%` : `${t.priceChange24h.toFixed(1)}%`;
  const vol = t.volume24h > 1e6 ? `$${(t.volume24h / 1e6).toFixed(1)}M` : `$${(t.volume24h / 1000).toFixed(0)}k`;
  const liq = t.liquidity > 1e6 ? `$${(t.liquidity / 1e6).toFixed(1)}M` : `$${(t.liquidity / 1000).toFixed(0)}k`;
  const mcap = t.marketCap ? (t.marketCap > 1e6 ? `$${(t.marketCap / 1e6).toFixed(1)}M` : `$${(t.marketCap / 1000).toFixed(0)}k`) : 'N/A';
  const priceStr = t.price < 0.0001 ? t.price.toExponential(2) : t.price < 1 ? `$${t.price.toFixed(6)}` : `$${t.price.toFixed(2)}`;

  return `${t.symbol.padEnd(10)} ${priceStr.padStart(12)} | 24h:${changeStr.padStart(7)} | Vol:${vol.padStart(7)} | Liq:${liq.padStart(7)} | MCap:${mcap}
   Mint: ${t.address}`;
}

export function buildSpotUserPrompt(context: DomainContext): string {
  const markets = context.markets || [];
  const positions = context.positions || [];

  // Transform to spot token format
  const tokens: SpotToken[] = markets.map(m => {
    const meta = m.metadata as Record<string, unknown>;
    return {
      symbol: (meta.symbol as string) || m.name || 'UNKNOWN',
      name: (meta.name as string) || m.name || 'Unknown Token',
      address: m.id || (meta.mint as string) || (meta.address as string) || '',
      price: (meta.price_usd as number) || (meta.price as number) || 0,
      priceChange24h: (meta.price_change_24h as number) || (meta.change_24h as number) || 0,
      volume24h: (meta.volume_24h as number) || (meta.volume as number) || 0,
      liquidity: (meta.liquidity_usd as number) || (meta.liquidity as number) || 0,
      marketCap: (meta.market_cap as number) || 0,
    };
  });

  // Market overview stats
  const totalVolume = tokens.reduce((sum, t) => sum + t.volume24h, 0);
  const totalLiquidity = tokens.reduce((sum, t) => sum + t.liquidity, 0);
  const avgChange = tokens.filter(t => t.priceChange24h).reduce((sum, t, _, arr) => sum + t.priceChange24h / arr.length, 0);
  const greenCount = tokens.filter(t => t.priceChange24h > 0).length;
  const redCount = tokens.filter(t => t.priceChange24h < 0).length;

  // Portfolio metrics
  const totalPositionValue = positions.reduce((sum, p) => sum + p.currentValueUsd, 0);
  const totalAUM = context.balance + totalPositionValue;
  const exposurePct = totalAUM > 0 ? (totalPositionValue / totalAUM) * 100 : 0;

  // Categorize tokens
  const bigGainers = [...tokens]
    .filter(t => t.priceChange24h > 10 && t.liquidity > 50000)
    .sort((a, b) => b.priceChange24h - a.priceChange24h)
    .slice(0, 10);

  const bigLosers = [...tokens]
    .filter(t => t.priceChange24h < -10 && t.liquidity > 50000)
    .sort((a, b) => a.priceChange24h - b.priceChange24h)
    .slice(0, 8);

  const highVolume = [...tokens]
    .filter(t => t.liquidity > 100000) // Safe liquidity
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 15);

  const lowCapGems = [...tokens]
    .filter(t => t.marketCap && t.marketCap > 100000 && t.marketCap < 5_000_000)
    .filter(t => t.liquidity > 30000)
    .sort((a, b) => b.volume24h - a.volume24h)
    .slice(0, 10);

  const highLiquidity = [...tokens]
    .filter(t => t.liquidity > 500000) // Very safe
    .sort((a, b) => b.liquidity - a.liquidity)
    .slice(0, 8);

  // Format positions
  let positionsText = 'None';
  if (positions.length > 0) {
    positionsText = positions.map((p, idx) => {
      const meta = p.metadata as Record<string, unknown>;
      const symbol = (meta.symbol as string) || p.target || 'UNKNOWN';
      const pnl = p.currentValueUsd - p.entryValueUsd;
      const pnlPct = p.entryValueUsd > 0 ? ((pnl / p.entryValueUsd) * 100) : 0;
      let hoursHeld = 0;
      if (p.openedAt) {
        hoursHeld = (Date.now() - new Date(p.openedAt).getTime()) / (1000 * 60 * 60);
      }
      return `${idx + 1}. ${symbol} | $${p.entryValueUsd.toFixed(0)} → $${p.currentValueUsd.toFixed(0)} | P&L: ${pnlPct >= 0 ? '+' : ''}${pnlPct.toFixed(1)}% | ${hoursHeld.toFixed(0)}h held`;
    }).join('\n');
  }

  const decisionHistoryText = formatDecisionHistory(context.recentDecisions || []);

  return `# Memecoin/Spot Trading - Context

## Portfolio Status
- **Cash:** $${context.balance.toFixed(2)} | **Positions:** $${totalPositionValue.toFixed(2)} | **Total AUM:** $${totalAUM.toFixed(2)}
- **Exposure:** ${exposurePct.toFixed(0)}% deployed | **Open Positions:** ${positions.length}/3 max

## Market Overview (${tokens.length} tokens)
- **Total Volume:** $${(totalVolume / 1e6).toFixed(1)}M | **Total Liquidity:** $${(totalLiquidity / 1e6).toFixed(1)}M
- **Avg 24h Change:** ${avgChange >= 0 ? '+' : ''}${avgChange.toFixed(1)}% | **Green:** ${greenCount} | **Red:** ${redCount}

## Current Positions
${positionsText}

## Recent Decisions
${decisionHistoryText}

---

## 🚀 BIG GAINERS (>10% in 24h)
*Momentum plays - high risk, potential runners*

${bigGainers.length > 0 ? bigGainers.map(t => formatTokenLine(t)).join('\n') : 'No big gainers with safe liquidity'}

## 📉 BIG LOSERS (<-10% in 24h)
*Potential bounce plays - oversold conditions*

${bigLosers.length > 0 ? bigLosers.map(t => formatTokenLine(t)).join('\n') : 'No big losers with safe liquidity'}

## 📊 HIGHEST VOLUME (Most Active)
*Where the action is - hot tokens with momentum*

${highVolume.map(t => formatTokenLine(t)).join('\n')}

## 💎 LOW CAP GEMS ($100k-$5M MCap)
*Early stage with upside potential*

${lowCapGems.length > 0 ? lowCapGems.map(t => formatTokenLine(t)).join('\n') : 'No qualifying low cap gems'}

## 🏦 HIGH LIQUIDITY (>$500k)
*Safest to trade - easy entry/exit*

${highLiquidity.length > 0 ? highLiquidity.map(t => formatTokenLine(t)).join('\n') : 'No high liquidity tokens'}

---

# Decision Instructions

**Use the MINT ADDRESS from listings above as your "target"!**

Choose ONE action:
1. **buy** - Enter new position (use mint address)
2. **sell** - Exit existing position
3. **hold** - No compelling opportunity

**Risk Rules:**
- Max 20% of AUM per token
- Require liquidity > $50k for entry
- Set mental stop-loss (exit at -20%)
- Take profits on 2x gains

Respond with JSON: {"action", "target", "amountUsd", "reasoning", "confidence"}`;
}
