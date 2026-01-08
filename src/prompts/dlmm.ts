/**
 * DLMM Domain Prompts
 * Rich context for liquidity provision decisions
 */

import type { DomainContext, Position, DecisionHistory } from '../types/index.js';

interface StrategyStats {
  strategy: string;
  wins: number;
  losses: number;
  winRate: number;
  totalPnl: number;
  avgPnl: number;
}

function formatStrategyStats(stats: StrategyStats[]): string {
  if (!stats || stats.length === 0) {
    return 'No strategy data yet - this is your first trades.';
  }

  return stats.map(s => {
    const winRateEmoji = s.winRate >= 60 ? '🟢' : s.winRate >= 40 ? '🟡' : '🔴';
    const pnlEmoji = s.totalPnl >= 0 ? '📈' : '📉';
    const pnlSign = s.totalPnl >= 0 ? '+' : '';
    return `- **${s.strategy.toUpperCase()}**: ${winRateEmoji} ${s.winRate.toFixed(0)}% win rate (${s.wins}W/${s.losses}L) | ${pnlEmoji} ${pnlSign}$${s.totalPnl.toFixed(2)} total P&L`;
  }).join('\n');
}

function formatDecisionHistory(decisions: DecisionHistory[]): string {
  if (!decisions || decisions.length === 0) {
    return 'None - This is your first decision cycle.';
  }

  return decisions.map((d, idx) => {
    const outcomeEmoji = d.outcome === 'profitable' ? '✅' : d.outcome === 'loss' ? '❌' : '⏳';
    const pnlStr = d.realizedPnl ? ` | P&L: $${d.realizedPnl.toFixed(2)}` : '';
    const targetStr = d.target ? ` on ${d.target.substring(0, 8)}...` : '';
    const timeAgo = getTimeAgo(d.timestamp);

    return `${idx + 1}. **${d.action.toUpperCase()}**${targetStr} (${timeAgo}) ${outcomeEmoji}${pnlStr}
   Reasoning: "${d.reasoning.substring(0, 150)}..."
   Confidence: ${(d.confidence * 100).toFixed(0)}%`;
  }).join('\n\n');
}

function getTimeAgo(timestamp: string): string {
  const diff = Date.now() - new Date(timestamp).getTime();
  const hours = Math.floor(diff / (1000 * 60 * 60));
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

export function buildDLMMSystemPrompt(): string {
  return `You are an AI liquidity provider specializing in Meteora DLMM on Solana for Claudefi.

## What is DLMM?

DLMM is an advanced AMM that provides CONCENTRATED LIQUIDITY. Instead of spreading liquidity across all prices, you concentrate it in specific price ranges to earn more fees.

**Key Concepts:**
- **Bins**: Discrete price points where you can place liquidity
- **Active Bin**: The current market price bin (ONLY this bin earns fees!)
- **Fee APR**: Annual return from trading fees
- **Impermanent Loss (IL)**: When token prices change, your position value changes vs just holding

## Strategies

1. **Spot Strategy** - Tight range around current price. Max fee capture but high IL risk.
2. **Curve Strategy** - Wide range. Lower fees but more coverage and less IL.
3. **Bid-Ask Strategy** - Asymmetric placement for directional views.

## Risk Management

- **Max 20% of capital per pool** to diversify
- **Minimum TVL**: $100k (prevents liquidity traps)
- **Exit when**: TVL drops 80%+, IL exceeds fees, better opportunities exist

## Decision Format

Respond with valid JSON:
\`\`\`json
{
  "action": "add_liquidity" | "remove_liquidity" | "hold",
  "target": "POOL_ADDRESS",
  "amount_usd": 500,
  "strategy": "spot" | "curve" | "bid-ask",
  "reasoning": "Detailed explanation",
  "confidence": 0.75
}
\`\`\`

**CRITICAL: Target must be the FULL POOL ADDRESS from the pool list!**`;
}

interface PoolData {
  id: string;
  name: string;
  apr: number;
  tvl: number;
  volume: number;
  fees: number;
  binStep: number;
}

function parsePool(m: { id: string; name: string; metadata: Record<string, unknown> }): PoolData {
  const pool = m.metadata;
  return {
    id: m.id,
    name: (pool.pool_name as string) || (pool.name as string) || m.name || 'Unknown',
    apr: (pool.fee_apr as number) || (pool.apr as number) || 0,
    tvl: (pool.tvl as number) || 0,
    volume: (pool.volume_24h as number) || 0,
    fees: (pool.fees_24h as number) || 0,
    binStep: (pool.bin_step as number) || 0,
  };
}

function formatPoolLine(p: PoolData, idx: number): string {
  const apr = p.apr > 0 ? `${(p.apr * 100).toFixed(0)}%` : 'N/A';
  const tvl = p.tvl > 0 ? `$${(p.tvl / 1000).toFixed(0)}k` : 'N/A';
  const vol = p.volume > 0 ? `$${(p.volume / 1000).toFixed(0)}k` : 'N/A';
  return `${idx}. ${p.name.substring(0, 18).padEnd(18)} APR:${apr.padStart(5)} TVL:${tvl.padStart(7)} Vol:${vol.padStart(7)} | ${p.id}`;
}

export function buildDLMMUserPrompt(context: DomainContext): string {
  const markets = context.markets || [];
  const positions = context.positions || [];

  // Parse all pools
  const allPools = markets.map(m => parsePool(m as { id: string; name: string; metadata: Record<string, unknown> }));

  // Calculate portfolio metrics
  const totalPositionValue = positions.reduce((sum, p) => sum + p.currentValueUsd, 0);
  const totalAUM = context.balance + totalPositionValue;
  const deploymentPct = totalAUM > 0 ? (totalPositionValue / totalAUM) * 100 : 0;

  // Market overview stats
  const totalTVL = allPools.reduce((sum, p) => sum + p.tvl, 0);
  const totalVolume = allPools.reduce((sum, p) => sum + p.volume, 0);
  const avgAPR = allPools.filter(p => p.apr > 0).reduce((sum, p, _, arr) => sum + p.apr / arr.length, 0);
  const highAPRCount = allPools.filter(p => p.apr > 0.5).length; // >50% APR

  // Categorize pools
  const highAPRPools = [...allPools]
    .filter(p => p.apr > 0.2 && p.tvl > 50000) // >20% APR, >$50k TVL
    .sort((a, b) => b.apr - a.apr)
    .slice(0, 15);

  const highVolumePools = [...allPools]
    .filter(p => p.volume > 100000) // >$100k volume
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 15);

  const stablePools = allPools
    .filter(p => p.name.includes('USDC') || p.name.includes('USDT') || p.name.includes('SOL'))
    .filter(p => p.tvl > 100000)
    .sort((a, b) => b.tvl - a.tvl)
    .slice(0, 10);

  const memePools = allPools
    .filter(p => !p.name.includes('USDC') && !p.name.includes('SOL') && !p.name.includes('ETH'))
    .filter(p => p.apr > 0.5 && p.volume > 50000) // High APR meme pools
    .sort((a, b) => b.apr - a.apr)
    .slice(0, 10);

  // Format pool sections
  const highAPRSection = highAPRPools.length > 0
    ? highAPRPools.map((p, i) => formatPoolLine(p, i + 1)).join('\n')
    : 'No high APR pools with sufficient TVL';

  const highVolumeSection = highVolumePools.length > 0
    ? highVolumePools.map((p, i) => formatPoolLine(p, i + 1)).join('\n')
    : 'No high volume pools available';

  const stableSection = stablePools.length > 0
    ? stablePools.map((p, i) => formatPoolLine(p, i + 1)).join('\n')
    : 'No stable pools available';

  const memeSection = memePools.length > 0
    ? memePools.map((p, i) => formatPoolLine(p, i + 1)).join('\n')
    : 'No high-yield meme pools available';

  // Format positions with warnings
  let positionsText = 'None';
  if (positions.length > 0) {
    positionsText = positions.map((p, idx) => {
      const pnl = p.currentValueUsd - p.entryValueUsd;
      const pnlPct = p.entryValueUsd > 0 ? ((pnl / p.entryValueUsd) * 100) : 0;
      const pnlSign = pnl >= 0 ? '+' : '';
      let hoursOpen = 0;
      if (p.openedAt) {
        hoursOpen = (Date.now() - new Date(p.openedAt).getTime()) / (1000 * 60 * 60);
      }
      let ilWarning = '';
      if (pnlPct < -15) ilWarning = ' 🚨 HIGH IL';
      else if (pnlPct < -10) ilWarning = ' ⚠️ IL';

      return `${idx + 1}. Pool: ${p.target.substring(0, 12)}... | Entry: $${p.entryValueUsd.toFixed(0)} → $${p.currentValueUsd.toFixed(0)} | P&L: ${pnlSign}${pnlPct.toFixed(1)}% | ${hoursOpen.toFixed(0)}h${ilWarning}`;
    }).join('\n');
  }

  const decisionHistoryText = formatDecisionHistory(context.recentDecisions || []);

  return `# DLMM Liquidity Provision - Trading Context

## Portfolio Status
- **Cash:** $${context.balance.toFixed(2)} | **Positions:** $${totalPositionValue.toFixed(2)} | **Total AUM:** $${totalAUM.toFixed(2)}
- **Deployment:** ${deploymentPct.toFixed(0)}% deployed | **Open Positions:** ${positions.length}

## Market Overview (${allPools.length} pools analyzed)
- **Total TVL:** $${(totalTVL / 1_000_000).toFixed(1)}M | **24h Volume:** $${(totalVolume / 1_000_000).toFixed(1)}M
- **Avg APR:** ${(avgAPR * 100).toFixed(0)}% | **High APR (>50%) Pools:** ${highAPRCount}

## Your Current Positions
${positionsText}

## Recent Decisions
${decisionHistoryText}

---

## 🔥 HIGH APR OPPORTUNITIES (>20% APR, >$50k TVL)
*Sorted by APR - Higher reward but watch for IL on volatile pairs*

${highAPRSection}

## 📊 HIGH VOLUME POOLS (>$100k daily)
*Most active pools - good fee generation, high liquidity*

${highVolumeSection}

## 🏦 STABLE/MAJOR PAIRS (SOL, USDC, USDT)
*Lower APR but safer from IL, good for larger positions*

${stableSection}

## 🎰 MEME POOLS (High APR, Non-stable)
*Highest risk/reward - volatile pairs with potential for big fees*

${memeSection}

---

# Decision Instructions

**CRITICAL: Use the FULL POOL ADDRESS from the listings above as your "target"!**

Choose ONE action:
1. **add_liquidity** - New position (max 20% of AUM per pool)
2. **remove_liquidity** - Exit if IL > fees or better opportunity exists
3. **hold** - If current positions are performing well

**Strategy Selection:**
- **spot** - Tight range, max fees, high IL risk (for stable pairs)
- **curve** - Wide range, lower fees, less IL (for volatile pairs)
- **bid-ask** - Directional view on price movement

Respond with JSON: {"action", "target", "amount_usd", "strategy", "reasoning", "confidence"}`;
}
