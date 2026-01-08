/**
 * Backfill Configuration
 * Constants and distributions for historical data generation
 */

export const CONFIG = {
  // Time range
  startDate: new Date('2025-12-09'),
  endDate: new Date('2026-01-08'),

  // Domains
  domains: ['dlmm', 'perps', 'polymarket', 'spot'] as const,

  // Balances
  initialBalancePerDomain: 2500,

  // Target P&L per domain (sum to +5-15% = $500-$1500)
  domainPnl: {
    dlmm: { target: 0.035, range: [0.02, 0.05] },     // Steady LP fees
    perps: { target: 0.05, range: [0.00, 0.10] },     // Higher volatility
    polymarket: { target: 0.01, range: [-0.03, 0.04] }, // Mixed results
    spot: { target: 0.025, range: [-0.02, 0.06] },    // Memecoins
  },

  // Win rates by domain (from transcript analysis)
  winRates: {
    dlmm: 0.65,
    perps: 0.48,
    polymarket: 0.52,
    spot: 0.42,
  },

  // Confidence distribution (mode 0.72, cluster at 0.85-0.95)
  confidence: {
    mode: 0.72,
    min: 0.55,
    max: 0.95,
    highThreshold: 0.85,
  },

  // Position counts
  positions: {
    total: { min: 60, max: 80 },
    openAtEnd: { min: 4, max: 8 },
  },

  // Decisions per position
  decisionsPerPosition: { min: 2, max: 3 },

  // Snapshots - 4 per day per domain
  snapshotsPerDay: 4,

  // Max positions per domain
  maxPositionsPerDomain: 3,

  // Action distributions by domain
  actions: {
    dlmm: { hold: 0.60, add_liquidity: 0.25, remove_liquidity: 0.15 },
    perps: { hold: 0.35, open_long: 0.25, close_position: 0.25, open_short: 0.15 },
    polymarket: { hold: 0.40, buy_yes: 0.25, buy_no: 0.20, sell: 0.15 },
    spot: { hold: 0.30, sell: 0.35, buy: 0.20, partial_sell: 0.15 },
  },

  // Position value ranges (USD)
  positionSizes: {
    dlmm: { min: 200, max: 600 },
    perps: { min: 150, max: 500 },
    polymarket: { min: 100, max: 400 },
    spot: { min: 200, max: 500 },
  },

  // Position duration ranges (hours)
  positionDuration: {
    dlmm: { min: 24, max: 168 },    // 1-7 days
    perps: { min: 4, max: 72 },     // 4h-3d
    polymarket: { min: 48, max: 336 }, // 2-14 days
    spot: { min: 4, max: 96 },      // 4h-4d
  },

  // Market conditions for realistic context
  marketConditions: {
    fearGreedRange: [25, 75],
    btcPriceRange: [88000, 105000],
  },
} as const;

export type Domain = typeof CONFIG.domains[number];
