/**
 * Claudefi Shared Types
 * Ported from ClaudeFi backend/src/domains/base/types.ts
 */

// =============================================================================
// MARKETS
// =============================================================================

/**
 * Generic market representation that works across all domains
 */
export interface Market {
  id: string;                          // Unique identifier (pool address, market ID, ticker, etc.)
  name: string;                        // Human-readable name
  domain: Domain;                      // Which domain this market belongs to
  metadata: Record<string, unknown>;   // Domain-specific data
}

/**
 * DLMM-specific market data
 */
export interface DLMMPool extends Market {
  domain: 'dlmm';
  metadata: {
    address: string;
    tokenX: { symbol: string; mint: string; decimals: number };
    tokenY: { symbol: string; mint: string; decimals: number };
    binStep: number;
    tvl: number;
    volume24h: number;
    feeApr: number;
    activeBin: number;
    currentPrice: number;
    safetyScore: number;
  };
}

/**
 * Perps-specific market data
 */
export interface PerpsMarket extends Market {
  domain: 'perps';
  metadata: {
    symbol: string;
    price: number;
    change24h: number;
    volume24h: number;
    openInterest: number;
    fundingRate: number;
    maxLeverage: number;
    rsi?: number;
    ema20?: number;
    momentum?: string;
    trend?: string;
  };
}

/**
 * Polymarket-specific market data
 */
export interface PolymarketMarket extends Market {
  domain: 'polymarket';
  metadata: {
    conditionId: string;
    question: string;
    yesPrice: number;
    noPrice: number;
    volume: number;
    liquidity: number;
    endDate: string;
    category: string;
    qualityScore: number;
  };
}

/**
 * Spot-specific market data (memecoins)
 */
export interface SpotToken extends Market {
  domain: 'spot';
  metadata: {
    symbol: string;
    mint: string;
    price: number;
    change24h: number;
    volume24h: number;
    marketCap: number;
    liquidity: number;
    holders?: number;
  };
}

// =============================================================================
// POSITIONS
// =============================================================================

/**
 * Generic position representation across all domains
 */
export interface Position {
  id: string;
  domain: Domain;
  target: string;                      // Pool address, market ID, ticker symbol
  entryValueUsd: number;
  currentValueUsd: number;
  status: 'open' | 'closed';
  openedAt: string;
  closedAt?: string;
  metadata: Record<string, unknown>;
}

/**
 * DLMM liquidity position
 */
export interface DLMMPosition extends Position {
  domain: 'dlmm';
  metadata: {
    poolAddress: string;
    poolName: string;
    tokenX: string;
    tokenY: string;
    strategy: 'spot' | 'curve' | 'bid-ask';
    feesEarned: number;
    positionAddress?: string;
  };
}

/**
 * Perps position
 */
export interface PerpsPosition extends Position {
  domain: 'perps';
  metadata: {
    symbol: string;
    side: 'LONG' | 'SHORT';
    leverage: number;
    entryPrice: number;
    currentPrice: number;
    liquidationPrice: number;
    unrealizedPnl: number;
  };
}

/**
 * Polymarket position
 */
export interface PolymarketPosition extends Position {
  domain: 'polymarket';
  metadata: {
    conditionId: string;
    question: string;
    outcome: 'YES' | 'NO';
    shares: number;
    entryPrice: number;
    currentPrice: number;
  };
}

/**
 * Spot position
 */
export interface SpotPosition extends Position {
  domain: 'spot';
  metadata: {
    symbol: string;
    mint: string;
    amount: number;
    entryPrice: number;
    currentPrice: number;
  };
}

// =============================================================================
// DECISIONS
// =============================================================================

/**
 * Domain type
 */
export type Domain = 'dlmm' | 'perps' | 'polymarket' | 'spot';

/**
 * Agent decision structure
 */
export interface AgentDecision {
  domain: Domain;
  action: string;
  target?: string;
  amountUsd?: number;
  percentage?: number;
  reasoning: string;
  confidence: number;
  metadata?: Record<string, unknown>;
}

/**
 * DLMM-specific decision
 */
export interface DLMMDecision extends AgentDecision {
  domain: 'dlmm';
  action: 'add_liquidity' | 'remove_liquidity' | 'partial_remove' | 'hold';
  metadata?: {
    poolAddress?: string;
    strategy?: 'spot' | 'curve' | 'bid-ask';
    positionId?: string;
  };
}

/**
 * Perps-specific decision
 */
export interface PerpsDecision extends AgentDecision {
  domain: 'perps';
  action: 'open_long' | 'open_short' | 'close_position' | 'partial_close' | 'hold';
  metadata?: {
    symbol?: string;
    leverage?: number;
    positionId?: string;
  };
}

/**
 * Polymarket-specific decision
 */
export interface PolymarketDecision extends AgentDecision {
  domain: 'polymarket';
  action: 'buy_yes' | 'buy_no' | 'sell' | 'partial_sell' | 'hold';
  metadata?: {
    conditionId?: string;
    positionId?: string;
    estimatedProbability?: number;
  };
}

/**
 * Spot-specific decision
 */
export interface SpotDecision extends AgentDecision {
  domain: 'spot';
  action: 'buy' | 'sell' | 'partial_sell' | 'hold';
  metadata?: {
    symbol?: string;
    mint?: string;
    positionId?: string;
  };
}

// =============================================================================
// CONTEXT
// =============================================================================

/**
 * Context provided to Claude for decision-making
 */
export interface DomainContext {
  domain: Domain;
  balance: number;
  positions: Position[];
  markets: Market[];
  recentDecisions: DecisionHistory[];
  performanceSnapshots: PerformanceSnapshot[];
  timestamp: string;
}

/**
 * Historical decision record
 */
export interface DecisionHistory {
  action: string;
  target?: string;
  amountUsd?: number;
  reasoning: string;
  confidence: number;
  outcome?: 'profitable' | 'loss' | 'pending';
  realizedPnl?: number;
  timestamp: string;
}

/**
 * Performance snapshot
 */
export interface PerformanceSnapshot {
  domain: Domain | null; // null = total portfolio
  timestamp: string;
  totalValueUsd: number;
  numPositions: number;
  feesEarned?: number;
  dailyPnl?: number;
  weeklyPnl?: number;
  totalPnl?: number;
}

// =============================================================================
// PORTFOLIO
// =============================================================================

/**
 * Cross-domain portfolio summary
 */
export interface Portfolio {
  totalValueUsd: number;
  domains: {
    [K in Domain]: {
      balance: number;
      positionsValue: number;
      totalValue: number;
      numPositions: number;
    };
  };
  positions: Position[];
  lastUpdated: string;
}

// =============================================================================
// CONFIG
// =============================================================================

/**
 * Claudefi configuration
 */
export interface ClaudefiConfig {
  anthropicApiKey: string;
  supabaseUrl: string;
  supabaseKey: string;
  solanaRpcUrl: string;
  paperTrading: boolean;
  activeDomains: Domain[];
  cycleIntervalMs: number;
}
