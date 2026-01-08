/**
 * Real Market Data from Transcripts
 * Addresses and identifiers for authentic backfill data
 */

// DLMM Pools (from actual trading sessions)
export const DLMM_POOLS = [
  {
    address: 'DdMA1cHcHEqYfttc1z1sJEY978CcU1pyjNuTWTNmdvzU',
    name: 'PENGU-USDC',
    symbol: 'PENGU',
    typicalApr: { min: 15, max: 45 },
    tvl: { min: 500000, max: 2000000 },
  },
  {
    address: 'BGm1tav58oGcsQJehL9WXBFXF7D27vZsKefj4xJKD5Y',
    name: 'SOL-USDC',
    symbol: 'SOL',
    typicalApr: { min: 8, max: 25 },
    tvl: { min: 10000000, max: 50000000 },
  },
  {
    address: '7wkFP7EHYTgeUG5ouX64ftTsMuXpR1gFCJK6knyp22Rd',
    name: 'Fartcoin-USDC',
    symbol: 'FARTCOIN',
    typicalApr: { min: 20, max: 80 },
    tvl: { min: 1000000, max: 15000000 },
  },
  {
    address: 'A4SvFP5r2fL91rKvP1yxNnT7EaKbWkFk4qPfJ5pmpT',
    name: 'BONK-USDC',
    symbol: 'BONK',
    typicalApr: { min: 12, max: 35 },
    tvl: { min: 2000000, max: 8000000 },
  },
  {
    address: 'J8LKx7pr9Zxh2mskNzuC3pu3gSJA3RvPnjwG3pQVTgJ',
    name: 'WIF-USDC',
    symbol: 'WIF',
    typicalApr: { min: 18, max: 55 },
    tvl: { min: 3000000, max: 12000000 },
  },
];

// Perps Symbols (Hyperliquid)
export const PERPS_SYMBOLS = [
  { symbol: 'BTC', typical24hChange: { min: -5, max: 5 } },
  { symbol: 'ETH', typical24hChange: { min: -6, max: 6 } },
  { symbol: 'SOL', typical24hChange: { min: -8, max: 8 } },
  { symbol: 'HYPE', typical24hChange: { min: -10, max: 15 } },
  { symbol: 'FARTCOIN', typical24hChange: { min: -15, max: 25 } },
  { symbol: 'DOGE', typical24hChange: { min: -7, max: 7 } },
  { symbol: 'XRP', typical24hChange: { min: -5, max: 5 } },
  { symbol: 'SUI', typical24hChange: { min: -9, max: 9 } },
  { symbol: 'AVAX', typical24hChange: { min: -6, max: 6 } },
  { symbol: 'LINK', typical24hChange: { min: -5, max: 5 } },
];

// Spot Tokens (Solana memecoins from transcripts)
export const SPOT_TOKENS = [
  {
    mint: '26M5M3nwgaKE4zavkD3zEtYs5hJWdxe6xBwpdtsLHy1o',
    symbol: 'DINO',
    name: 'DINO',
    typicalChange: { min: -30, max: 50 },
  },
  {
    mint: '3mgxf9VVDd82E75bovuAJPS1wYmJoZCAo4MB6zpQDjnv',
    symbol: 'SPARK',
    name: 'SPARK',
    typicalChange: { min: -40, max: 60 },
  },
  {
    mint: 'Bzc9NZfMqkXR6fz1DBph7BDf9BroyEf6pnzESP7v5iiw',
    symbol: 'FARTCOIN',
    name: 'Fartcoin',
    typicalChange: { min: -20, max: 40 },
  },
  {
    mint: 'DqAfrGV2GBxpGRsq6Xk1z9ojRncqgLeeVPaKg5bCc24Z',
    symbol: 'HACHI',
    name: '$HACHI',
    typicalChange: { min: -35, max: 55 },
  },
  {
    mint: '4qxSqMh6iEdbdvtMp8r5MK2psAGKNk57PfGeVo2VhczQ',
    symbol: 'WHITEWHALE',
    name: 'WhiteWhale',
    typicalChange: { min: -25, max: 45 },
  },
  {
    mint: 'AA2x8NAEEen6zQ7wxxL6horSkHmJMPnsiYjLroQZMkCe',
    symbol: '114514',
    name: '114514',
    typicalChange: { min: -30, max: 50 },
  },
  {
    mint: 'GBsngTQLDQ6Afv7A4JV6enHz6vHrdzgNC1e45DekQc1L',
    symbol: 'KABUTO',
    name: 'KABUTO',
    typicalChange: { min: -35, max: 60 },
  },
  {
    mint: '24MzcN75D8BZSd5ZmCncSyMhe9unagiubwPNgLyaZWuX',
    symbol: 'MUSH',
    name: 'MUSH',
    typicalChange: { min: -45, max: 80 },
  },
];

// Polymarket Markets (realistic prediction markets)
export const POLYMARKET_MARKETS = [
  {
    conditionId: 'poly_btc_100k_jan',
    question: 'Will Bitcoin reach $100,000 by January 31, 2026?',
    category: 'Crypto',
    typicalYesPrice: { min: 0.35, max: 0.75 },
  },
  {
    conditionId: 'poly_eth_5k_q1',
    question: 'Will Ethereum reach $5,000 in Q1 2026?',
    category: 'Crypto',
    typicalYesPrice: { min: 0.20, max: 0.55 },
  },
  {
    conditionId: 'poly_fed_rate_cut',
    question: 'Will the Fed cut rates by 50bps or more by March 2026?',
    category: 'Economics',
    typicalYesPrice: { min: 0.15, max: 0.45 },
  },
  {
    conditionId: 'poly_sol_500',
    question: 'Will Solana reach $500 in 2026?',
    category: 'Crypto',
    typicalYesPrice: { min: 0.10, max: 0.35 },
  },
  {
    conditionId: 'poly_ai_regulation',
    question: 'Will US pass major AI regulation bill by June 2026?',
    category: 'Politics',
    typicalYesPrice: { min: 0.20, max: 0.50 },
  },
  {
    conditionId: 'poly_trump_crypto',
    question: 'Will Trump administration announce crypto reserve policy by Feb 2026?',
    category: 'Politics',
    typicalYesPrice: { min: 0.40, max: 0.70 },
  },
  {
    conditionId: 'poly_nvidia_earnings',
    question: 'Will NVIDIA beat Q4 earnings estimates?',
    category: 'Stocks',
    typicalYesPrice: { min: 0.55, max: 0.80 },
  },
  {
    conditionId: 'poly_superbowl',
    question: 'Will Chiefs win Super Bowl 2026?',
    category: 'Sports',
    typicalYesPrice: { min: 0.25, max: 0.45 },
  },
];

// Helper to get random item from array
export function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

// Helper to get market data for domain
export function getMarketForDomain(domain: string) {
  switch (domain) {
    case 'dlmm':
      return randomItem(DLMM_POOLS);
    case 'perps':
      return randomItem(PERPS_SYMBOLS);
    case 'polymarket':
      return randomItem(POLYMARKET_MARKETS);
    case 'spot':
      return randomItem(SPOT_TOKENS);
    default:
      throw new Error(`Unknown domain: ${domain}`);
  }
}
