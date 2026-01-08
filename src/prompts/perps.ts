/**
 * Perps Domain Prompts
 * Rich context with technical indicators for perpetual futures
 */

import type { DomainContext, DecisionHistory } from '../types/index.js';

interface PerpMarket {
  symbol: string;
  markPrice: number;
  volume24h: number;
  openInterest: number;
  fundingRate: number;
  maxLeverage: number;
  priceChange1h?: number;
  priceChange4h?: number;
  priceChange24h?: number;
  high24h?: number;
  low24h?: number;
  rsi?: number;
  ema20?: number;
  volumeTrend?: string;
  momentum?: string;
  signalStrength?: number;
  trend?: string;
}

function formatDecisionHistory(decisions: DecisionHistory[]): string {
  if (!decisions || decisions.length === 0) {
    return 'None - This is your first decision cycle.';
  }

  return decisions.map((d, idx) => {
    const outcomeEmoji = d.outcome === 'profitable' ? '✅' : d.outcome === 'loss' ? '❌' : '⏳';
    const pnlStr = d.realizedPnl ? ` | P&L: $${d.realizedPnl.toFixed(2)}` : '';
    const targetStr = d.target ? ` on ${d.target}` : '';
    const timeAgo = getTimeAgo(d.timestamp);

    return `${idx + 1}. **${d.action.toUpperCase()}**${targetStr} (${timeAgo}) ${outcomeEmoji}${pnlStr}
   Confidence: ${(d.confidence * 100).toFixed(0)}%`;
  }).join('\n\n');
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function buildPerpsSystemPrompt(): string {
  return `You are an AI trader specializing in PERPETUAL FUTURES on Hyperliquid for Claudefi.

## What are Perpetual Futures?

Perps let you trade price movements with LEVERAGE without expiration.

**Key Features:**
- **LEVERAGE**: Control large positions with small margin (up to 50x)
- **LONG or SHORT**: Profit from price going up OR down
- **FUNDING RATES**: Periodic payments between longs and shorts
- **LIQUIDATION**: Auto-close if price moves too far against you

## Technical Indicators Provided

**RSI (Relative Strength Index):**
- < 30 = OVERSOLD (consider longs)
- > 70 = OVERBOUGHT (consider shorts)
- 40-60 = Neutral

**Momentum Signal (0-100):**
- STRONG_BULLISH (70-100) = Very strong buy signals
- BULLISH (60-70) = Multiple buy signals
- NEUTRAL (45-55) = Mixed signals
- BEARISH (30-40) = Multiple sell signals
- STRONG_BEARISH (0-30) = Very strong sell signals

## Risk Management

- **Use LOW leverage (2-5x)** until confident
- **Max 30% of balance as margin**
- **Always check liquidation price**
- **Consider funding rates** for overnight holds

## Decision Format

\`\`\`json
{
  "action": "open_long" | "open_short" | "close_position" | "hold",
  "target": "BTC",  // Symbol for new positions, positionId for closes
  "amountUsd": 100,  // REQUIRED for all non-hold actions (use position value for closes)
  "leverage": 5,  // Only for open_long/open_short
  "reasoning": "Technical analysis explanation",
  "confidence": 0.75
}
\`\`\`

**CRITICAL**: Always include \`amountUsd\` for open/close actions. For closes, use the position's current value.

**Remember:** amountUsd is POSITION SIZE, not margin. Margin = amountUsd / leverage.`;
}

function formatMarketLine(m: PerpMarket): string {
  const price = m.markPrice || 0;
  const vol = m.volume24h || 0;
  const oi = m.openInterest || 0;
  const funding = m.fundingRate || 0;
  const change24h = m.priceChange24h || 0;
  const changeStr = change24h >= 0 ? `+${change24h.toFixed(1)}%` : `${change24h.toFixed(1)}%`;
  const fundingStr = `${(funding * 100).toFixed(3)}%`;

  return `${m.symbol.padEnd(8)} $${price.toFixed(2).padStart(10)} | 24h:${changeStr.padStart(7)} | Vol:$${(vol/1e6).toFixed(1)}M | OI:$${(oi/1e6).toFixed(1)}M | Fund:${fundingStr}`;
}

export function buildPerpsUserPrompt(context: DomainContext): string {
  const markets = context.markets || [];
  const positions = context.positions || [];

  // Transform markets to perp format
  const perpMarkets: PerpMarket[] = markets.map(m => {
    const meta = m.metadata as Record<string, unknown>;
    return {
      symbol: m.name || (meta.symbol as string) || 'UNKNOWN',
      markPrice: (meta.mark_price as number) || (meta.price as number) || 0,
      volume24h: (meta.volume_24h as number) || 0,
      openInterest: (meta.open_interest as number) || 0,
      fundingRate: (meta.funding_rate as number) || 0,
      maxLeverage: (meta.max_leverage as number) || 50,
      priceChange1h: meta.change_1h as number,
      priceChange4h: meta.change_4h as number,
      priceChange24h: (meta.change_24h as number) || (meta.price_change_24h as number),
      rsi: meta.rsi as number,
      ema20: meta.ema20 as number,
      volumeTrend: meta.volume_trend as string,
      momentum: meta.momentum as string,
      signalStrength: meta.signal_strength as number,
      trend: meta.trend as string,
    };
  });

  // Market overview stats
  const totalVolume = perpMarkets.reduce((sum, m) => sum + (m.volume24h || 0), 0);
  const totalOI = perpMarkets.reduce((sum, m) => sum + (m.openInterest || 0), 0);
  const avgFunding = perpMarkets.filter(m => m.fundingRate).reduce((sum, m, _, arr) => sum + m.fundingRate / arr.length, 0);
  const bullishCount = perpMarkets.filter(m => (m.priceChange24h || 0) > 2).length;
  const bearishCount = perpMarkets.filter(m => (m.priceChange24h || 0) < -2).length;

  // Categorize markets
  const majors = ['BTC', 'ETH', 'SOL', 'BNB', 'XRP', 'ADA', 'AVAX', 'DOT', 'LINK', 'MATIC'];
  const majorMarkets = perpMarkets.filter(m => majors.includes(m.symbol)).slice(0, 10);

  const highVolume = [...perpMarkets]
    .sort((a, b) => (b.volume24h || 0) - (a.volume24h || 0))
    .slice(0, 15);

  // Funding rate opportunities - negative funding = shorts pay longs
  const negativeFunding = [...perpMarkets]
    .filter(m => m.fundingRate < -0.0001) // Negative funding
    .sort((a, b) => a.fundingRate - b.fundingRate)
    .slice(0, 10);

  const positiveFunding = [...perpMarkets]
    .filter(m => m.fundingRate > 0.0001) // Positive funding
    .sort((a, b) => b.fundingRate - a.fundingRate)
    .slice(0, 10);

  // Momentum plays - big movers
  const bigGainers = [...perpMarkets]
    .filter(m => (m.priceChange24h || 0) > 3)
    .sort((a, b) => (b.priceChange24h || 0) - (a.priceChange24h || 0))
    .slice(0, 10);

  const bigLosers = [...perpMarkets]
    .filter(m => (m.priceChange24h || 0) < -3)
    .sort((a, b) => (a.priceChange24h || 0) - (b.priceChange24h || 0))
    .slice(0, 10);

  // Format positions
  let positionsText = 'None';
  if (positions.length > 0) {
    positionsText = positions.map(pos => {
      const meta = pos.metadata as Record<string, unknown>;
      const sizeUsd = (meta.size_usd as number) || pos.currentValueUsd || 0;
      const leverage = (meta.leverage as number) || 1;
      const entryPrice = (meta.entry_price as number) || 0;
      const liquidationPrice = (meta.liquidation_price as number) || 0;
      const unrealizedPnl = (meta.unrealized_pnl as number) || (pos.currentValueUsd - pos.entryValueUsd);
      const roiPct = pos.entryValueUsd > 0 ? (unrealizedPnl / pos.entryValueUsd) * 100 : 0;
      const side = (meta.side as string) || 'LONG';
      const symbol = (meta.symbol as string) || pos.target || 'UNKNOWN';

      return `${symbol} ${side} ${leverage}x | Size: $${sizeUsd.toFixed(0)} | Entry: $${entryPrice.toFixed(2)} | Liq: $${liquidationPrice.toFixed(2)} | P&L: ${roiPct >= 0 ? '+' : ''}${roiPct.toFixed(1)}%`;
    }).join('\n');
  }

  const decisionHistoryText = formatDecisionHistory(context.recentDecisions || []);

  return `# Perpetual Futures - Trading Context

## Portfolio Status
- **Balance:** $${context.balance.toFixed(2)} USDC
- **Open Positions:** ${positions.length}

## Market Overview (${perpMarkets.length} markets)
- **Total Volume:** $${(totalVolume / 1e9).toFixed(2)}B | **Open Interest:** $${(totalOI / 1e9).toFixed(2)}B
- **Avg Funding:** ${(avgFunding * 100).toFixed(4)}%/8h | **Bullish:** ${bullishCount} | **Bearish:** ${bearishCount}

## Current Positions
${positionsText}

## Recent Decisions
${decisionHistoryText}

---

## 🏛️ MAJOR ASSETS (BTC, ETH, SOL, etc.)
*Lower volatility, high liquidity, good for larger positions*

${majorMarkets.map(m => formatMarketLine(m)).join('\n')}

## 📊 HIGHEST VOLUME (Most Active)
*Best liquidity, tight spreads*

${highVolume.map(m => formatMarketLine(m)).join('\n')}

## 💰 NEGATIVE FUNDING (Shorts Pay Longs)
*Go LONG and earn funding every 8h*

${negativeFunding.length > 0 ? negativeFunding.map(m => formatMarketLine(m)).join('\n') : 'No negative funding opportunities'}

## 💸 POSITIVE FUNDING (Longs Pay Shorts)
*Go SHORT and earn funding every 8h*

${positiveFunding.length > 0 ? positiveFunding.map(m => formatMarketLine(m)).join('\n') : 'No positive funding opportunities'}

## 🚀 BIG GAINERS (>3% in 24h)
*Momentum plays - consider longs on pullbacks*

${bigGainers.length > 0 ? bigGainers.map(m => formatMarketLine(m)).join('\n') : 'No big gainers today'}

## 📉 BIG LOSERS (<-3% in 24h)
*Potential bounce plays or shorts on rallies*

${bigLosers.length > 0 ? bigLosers.map(m => formatMarketLine(m)).join('\n') : 'No big losers today'}

---

# Decision Instructions

Choose ONE action:
1. **open_long** - Bullish position (symbol + size_usd + leverage)
2. **open_short** - Bearish position (symbol + size_usd + leverage)
3. **close_position** - Exit existing position
4. **hold** - No action

**Risk Rules:**
- Max leverage: 5x for volatile, 10x for majors
- Max position: 30% of balance as margin
- Check liquidation distance (need >15% buffer)
- Stop losses: -8% to -15% depending on setup quality
- Profit targets: Let winners run! Trail stops on +20%+ gains, don't exit for tiny profits

**Avoid Over-Trading:**
- A +5% gain with strong momentum should be HELD, not closed
- Don't close winners just because they're profitable - wait for trend exhaustion
- Only take profits when: momentum reversing, funding rates flipping against you, or 2R+ target hit
- Small gains (+3-8%) are NOT profit targets - these are noise, not signal

Respond with JSON: {"action", "target", "amountUsd", "leverage", "reasoning", "confidence"}`;
}
