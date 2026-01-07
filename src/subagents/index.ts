/**
 * Claudefi Subagents
 *
 * Domain-specific subagents that run in parallel, isolated contexts.
 * Each subagent specializes in one trading domain with focused prompts and tools.
 *
 * Architecture:
 * - Main orchestrator dispatches to subagents per domain
 * - Subagents observe market state, think, decide, act
 * - Hooks intercept actions for validation and logging
 * - Structured output ensures consistent decision format
 */

import type { Domain, AgentDecision, DomainContext } from '../types/index.js';

/**
 * Subagent configuration
 */
export interface SubagentConfig {
  name: string;
  domain: Domain;
  description: string;
  systemPrompt: string;
  tools: string[];  // List of tool names this subagent can access
  outputSchema: {
    type: 'object';
    properties: Record<string, unknown>;
    required: string[];
  };
}

/**
 * DLMM Subagent - Liquidity provision specialist
 */
export const dlmmAgent: SubagentConfig = {
  name: 'dlmm-agent',
  domain: 'dlmm',
  description: 'Analyzes Meteora DLMM pools and manages liquidity positions',
  systemPrompt: `You are a DLMM liquidity provision specialist for Claudefi.

Your expertise:
- Concentrated liquidity mechanics (bins, active bin, price ranges)
- Fee APR optimization vs impermanent loss risk
- Pool selection based on TVL, volume, volatility
- Strategy selection: SPOT (tight range), CURVE (normal distribution), BID-ASK (wide range)

Decision framework:
1. OBSERVE: Review available pools, current positions, balance
2. THINK: Analyze fee/TVL ratios, pool health, IL risk
3. DECIDE: add_liquidity, remove_liquidity, partial_remove, or hold
4. REASON: Explain your decision clearly

Risk rules:
- Max 3 positions at a time
- Max 20% of balance per position
- Prefer pools with safety_score >= 60
- Avoid pools with < $50k TVL

Always return a valid AgentDecision JSON.`,
  tools: [
    'dlmm_fetch_pools',
    'dlmm_add_liquidity',
    'dlmm_remove_liquidity',
    'dlmm_get_positions',
    'dlmm_sync_positions',
    'get_balances',
  ],
  outputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['add_liquidity', 'remove_liquidity', 'partial_remove', 'hold'] },
      target: { type: 'string', description: 'Pool address' },
      amountUsd: { type: 'number' },
      percentage: { type: 'number' },
      reasoning: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      metadata: {
        type: 'object',
        properties: {
          strategy: { type: 'string', enum: ['spot', 'curve', 'bid-ask'] },
          positionId: { type: 'string' },
        },
      },
    },
    required: ['action', 'reasoning', 'confidence'],
  },
};

/**
 * Perps Subagent - Perpetual futures trading specialist
 */
export const perpsAgent: SubagentConfig = {
  name: 'perps-agent',
  domain: 'perps',
  description: 'Trades perpetual futures on Hyperliquid with technical analysis',
  systemPrompt: `You are a perpetual futures trading specialist for Claudefi.

Your expertise:
- Technical analysis: RSI, EMA, momentum, trend identification
- Position sizing with leverage management
- Funding rate analysis and arbitrage
- Risk/reward optimization

Decision framework:
1. OBSERVE: Review market data, indicators, funding rates, open positions
2. THINK: Identify opportunities, assess risk/reward
3. DECIDE: open_long, open_short, close_position, partial_close, or hold
4. REASON: Explain your thesis clearly

Risk rules:
- Max 3 positions at a time
- Max 10x leverage (prefer 3-5x)
- Max 20% of balance per position (margin)
- Set mental stop-losses at liquidation_price

Key signals:
- RSI < 30 = oversold (potential long)
- RSI > 70 = overbought (potential short)
- Negative funding = shorts paying longs
- Positive momentum + uptrend = bullish

Always return a valid AgentDecision JSON.`,
  tools: [
    'perps_fetch_markets',
    'perps_open_position',
    'perps_close_position',
    'perps_get_positions',
    'perps_adjust_position',
    'get_balances',
  ],
  outputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['open_long', 'open_short', 'close_position', 'partial_close', 'hold'] },
      target: { type: 'string', description: 'Symbol (e.g., BTC, ETH, SOL)' },
      amountUsd: { type: 'number', description: 'Notional size' },
      percentage: { type: 'number' },
      reasoning: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      metadata: {
        type: 'object',
        properties: {
          leverage: { type: 'number', minimum: 1, maximum: 10 },
          positionId: { type: 'string' },
        },
      },
    },
    required: ['action', 'reasoning', 'confidence'],
  },
};

/**
 * Polymarket Subagent - Prediction market analyst
 */
export const polymarketAgent: SubagentConfig = {
  name: 'polymarket-agent',
  domain: 'polymarket',
  description: 'Analyzes prediction markets and trades based on probability estimation',
  systemPrompt: `You are a prediction market analyst for Claudefi.

Your expertise:
- Event research and probability estimation
- Identifying mispriced markets (edge detection)
- Kelly criterion position sizing
- Information aggregation and analysis

Decision framework:
1. OBSERVE: Review markets, prices, liquidity, your estimated probabilities
2. THINK: Compare market price to your probability estimate
3. DECIDE: buy_yes, buy_no, sell, partial_sell, or hold
4. REASON: Explain your probability estimate and edge

Risk rules:
- Max 3 positions at a time
- Max 20% of balance per position
- Only trade markets with liquidity > $10k
- Require at least 10% edge (your prob vs market price)

Edge calculation:
- If you estimate 70% YES, market shows 55% YES → 15% edge → BUY YES
- If you estimate 30% YES, market shows 45% YES → 15% edge → BUY NO

Always return a valid AgentDecision JSON.`,
  tools: [
    'polymarket_fetch_markets',
    'polymarket_buy_shares',
    'polymarket_sell_shares',
    'polymarket_research_market',
    'polymarket_get_positions',
    'get_balances',
  ],
  outputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['buy_yes', 'buy_no', 'sell', 'partial_sell', 'hold'] },
      target: { type: 'string', description: 'Condition ID' },
      amountUsd: { type: 'number' },
      percentage: { type: 'number' },
      reasoning: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      metadata: {
        type: 'object',
        properties: {
          estimatedProbability: { type: 'number' },
          marketPrice: { type: 'number' },
          edge: { type: 'number' },
          positionId: { type: 'string' },
        },
      },
    },
    required: ['action', 'reasoning', 'confidence'],
  },
};

/**
 * Spot Subagent - Memecoin trading specialist
 */
export const spotAgent: SubagentConfig = {
  name: 'spot-agent',
  domain: 'spot',
  description: 'Scans and trades memecoins/tokens on Jupiter',
  systemPrompt: `You are a memecoin/spot trading specialist for Claudefi.

Your expertise:
- Token discovery and analysis
- Liquidity and rug-pull detection
- Momentum trading and quick flips
- Volume and holder analysis

Decision framework:
1. OBSERVE: Review available tokens, prices, volume, liquidity
2. THINK: Assess momentum, liquidity depth, rug risk
3. DECIDE: buy, sell, partial_sell, or hold
4. REASON: Explain your thesis and exit strategy

Risk rules:
- Max 3 positions at a time
- Max 20% of balance per position
- Only trade tokens with liquidity > $50k
- Quick profit-taking: consider selling at 2x

Warning signs (avoid):
- Low holder count
- Very low liquidity
- Sudden volume spikes without news
- Suspicious token contract

Always return a valid AgentDecision JSON.`,
  tools: [
    'spot_fetch_tokens',
    'spot_buy_token',
    'spot_sell_token',
    'spot_get_positions',
    'get_balances',
  ],
  outputSchema: {
    type: 'object',
    properties: {
      action: { type: 'string', enum: ['buy', 'sell', 'partial_sell', 'hold'] },
      target: { type: 'string', description: 'Token symbol or mint address' },
      amountUsd: { type: 'number' },
      percentage: { type: 'number' },
      reasoning: { type: 'string' },
      confidence: { type: 'number', minimum: 0, maximum: 1 },
      metadata: {
        type: 'object',
        properties: {
          mint: { type: 'string' },
          positionId: { type: 'string' },
        },
      },
    },
    required: ['action', 'reasoning', 'confidence'],
  },
};

/**
 * All subagent configurations
 */
export const subagents: Record<Domain, SubagentConfig> = {
  dlmm: dlmmAgent,
  perps: perpsAgent,
  polymarket: polymarketAgent,
  spot: spotAgent,
};

/**
 * Get subagent config by domain
 */
export function getSubagent(domain: Domain): SubagentConfig {
  return subagents[domain];
}
