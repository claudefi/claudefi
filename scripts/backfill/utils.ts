/**
 * Backfill Utility Functions
 * Helpers for timestamp generation, random values, and P&L calculations
 */

import { CONFIG, type Domain } from './config.js';

// Seeded random for reproducibility
let seed = 12345;

export function seededRandom(): number {
  seed = (seed * 1103515245 + 12345) & 0x7fffffff;
  return seed / 0x7fffffff;
}

export function resetSeed(newSeed: number = 12345): void {
  seed = newSeed;
}

// Random number in range
export function randomInRange(min: number, max: number): number {
  return min + seededRandom() * (max - min);
}

// Random integer in range (inclusive)
export function randomInt(min: number, max: number): number {
  return Math.floor(randomInRange(min, max + 1));
}

// Random item from array
export function randomItem<T>(arr: T[]): T {
  return arr[Math.floor(seededRandom() * arr.length)];
}

// Random boolean with probability
export function randomBool(probability: number = 0.5): boolean {
  return seededRandom() < probability;
}

// Generate timestamp between start and end
export function randomTimestamp(start: Date, end: Date): Date {
  const startTime = start.getTime();
  const endTime = end.getTime();
  return new Date(startTime + seededRandom() * (endTime - startTime));
}

// Generate sorted array of timestamps
export function generateSortedTimestamps(start: Date, end: Date, count: number): Date[] {
  const timestamps: Date[] = [];
  for (let i = 0; i < count; i++) {
    timestamps.push(randomTimestamp(start, end));
  }
  return timestamps.sort((a, b) => a.getTime() - b.getTime());
}

// Add hours to date
export function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000);
}

// Add days to date
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

// Generate confidence with realistic distribution (mode around 0.72)
export function generateConfidence(): number {
  const { min, max, mode, highThreshold } = CONFIG.confidence;

  // 30% chance of high confidence trade
  if (seededRandom() < 0.3) {
    return randomInRange(highThreshold, max);
  }

  // Otherwise, triangular distribution around mode
  const u = seededRandom();
  const fc = (mode - min) / (max - min);

  if (u < fc) {
    return min + Math.sqrt(u * (max - min) * (mode - min));
  } else {
    return max - Math.sqrt((1 - u) * (max - min) * (max - mode));
  }
}

// Generate P&L for a position based on domain win rate and target
export function generatePnl(domain: Domain, entryValue: number): { pnl: number; pnlPercent: number; isWin: boolean } {
  const winRate = CONFIG.winRates[domain];
  const isWin = seededRandom() < winRate;

  // P&L percent ranges
  let pnlPercent: number;

  if (isWin) {
    // Wins: 5-50% depending on domain
    const winRanges: Record<Domain, [number, number]> = {
      dlmm: [0.05, 0.25],      // LP fees: conservative
      perps: [0.10, 0.50],     // Leveraged: higher
      polymarket: [0.15, 0.60], // Binary outcomes: can be high
      spot: [0.10, 0.40],      // Memecoins: volatile
    };
    const [minWin, maxWin] = winRanges[domain];
    pnlPercent = randomInRange(minWin, maxWin);
  } else {
    // Losses: -5% to -30%
    const lossRanges: Record<Domain, [number, number]> = {
      dlmm: [-0.15, -0.03],    // LP: IL protection
      perps: [-0.35, -0.08],   // Leveraged: higher
      polymarket: [-0.50, -0.10], // Binary: can lose all
      spot: [-0.30, -0.05],    // Memecoins: volatile
    };
    const [minLoss, maxLoss] = lossRanges[domain];
    pnlPercent = randomInRange(minLoss, maxLoss);
  }

  const pnl = entryValue * pnlPercent;

  return { pnl, pnlPercent, isWin };
}

// Generate market conditions snapshot
export function generateMarketConditions(): {
  fearGreed: number;
  btcPrice: number;
  sentiment: 'bullish' | 'bearish' | 'neutral';
} {
  const fearGreed = randomInt(CONFIG.marketConditions.fearGreedRange[0], CONFIG.marketConditions.fearGreedRange[1]);
  const btcPrice = randomInRange(CONFIG.marketConditions.btcPriceRange[0], CONFIG.marketConditions.btcPriceRange[1]);

  let sentiment: 'bullish' | 'bearish' | 'neutral';
  if (fearGreed < 40) {
    sentiment = 'bearish';
  } else if (fearGreed > 60) {
    sentiment = 'bullish';
  } else {
    sentiment = 'neutral';
  }

  return { fearGreed, btcPrice, sentiment };
}

// Generate position duration in hours based on domain
export function generatePositionDuration(domain: Domain): number {
  const { min, max } = CONFIG.positionDuration[domain];
  return randomInt(min, max);
}

// Generate position size based on domain
export function generatePositionSize(domain: Domain): number {
  const { min, max } = CONFIG.positionSizes[domain];
  return Math.round(randomInRange(min, max));
}

// Generate UUID v4 using crypto for true randomness
export function generateUUID(): string {
  // Use crypto.randomUUID if available, otherwise fallback to random generation
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.floor(Math.random() * 16);
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Round to 2 decimal places
export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// Format date for display
export function formatDate(date: Date): string {
  return date.toISOString().split('T')[0];
}

// Get all dates in range
export function getDatesInRange(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  let current = new Date(start);

  while (current <= end) {
    dates.push(new Date(current));
    current = addDays(current, 1);
  }

  return dates;
}

// Distribute items across domains
export function distributeAcrossDomains(total: number): Record<Domain, number> {
  const domains = CONFIG.domains;
  const perDomain = Math.floor(total / domains.length);
  const remainder = total % domains.length;

  const distribution: Record<string, number> = {};

  domains.forEach((domain, index) => {
    distribution[domain] = perDomain + (index < remainder ? 1 : 0);
  });

  return distribution as Record<Domain, number>;
}
