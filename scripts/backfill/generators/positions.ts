/**
 * Position Generator
 * Creates realistic trading positions across all domains
 */

import { CONFIG, type Domain } from '../config.js';
import {
  randomInt,
  randomItem,
  generatePositionDuration,
  generatePositionSize,
  generatePnl,
  generateUUID,
  addHours,
  randomTimestamp,
  round2,
  resetSeed,
} from '../utils.js';
import {
  DLMM_POOLS,
  PERPS_SYMBOLS,
  POLYMARKET_MARKETS,
  SPOT_TOKENS,
} from '../data/markets.js';

export interface GeneratedPosition {
  id: string;
  domain: Domain;
  target: string;
  targetName: string;
  entryValueUsd: number;
  currentValueUsd: number;
  status: 'open' | 'closed';
  side: string | null;
  size: number | null;
  entryPrice: number | null;
  currentPrice: number | null;
  openedAt: Date;
  closedAt: Date | null;
  realizedPnl: number | null;
  metadata: Record<string, unknown>;
}

function generateDlmmPosition(openedAt: Date, keepOpen: boolean): GeneratedPosition {
  const pool = randomItem(DLMM_POOLS);
  const entryValue = generatePositionSize('dlmm');
  const duration = generatePositionDuration('dlmm');

  const { pnl, isWin } = generatePnl('dlmm', entryValue);
  const closedAt = keepOpen ? null : addHours(openedAt, duration);
  const currentValue = keepOpen ? round2(entryValue * (1 + (Math.random() * 0.1 - 0.03))) : round2(entryValue + pnl);

  return {
    id: generateUUID(),
    domain: 'dlmm',
    target: pool.address,
    targetName: pool.name,
    entryValueUsd: entryValue,
    currentValueUsd: currentValue,
    status: keepOpen ? 'open' : 'closed',
    side: 'spot',
    size: entryValue / 100, // Arbitrary LP tokens
    entryPrice: 100,
    currentPrice: keepOpen ? null : currentValue / (entryValue / 100),
    openedAt,
    closedAt,
    realizedPnl: keepOpen ? null : round2(pnl),
    metadata: {
      poolAddress: pool.address,
      symbol: pool.symbol,
      strategy: randomItem(['spot', 'curve', 'bid_ask']),
      binRange: randomInt(10, 50),
      apr: round2(Math.random() * (pool.typicalApr.max - pool.typicalApr.min) + pool.typicalApr.min),
    },
  };
}

function generatePerpsPosition(openedAt: Date, keepOpen: boolean): GeneratedPosition {
  const symbol = randomItem(PERPS_SYMBOLS);
  const entryValue = generatePositionSize('perps');
  const duration = generatePositionDuration('perps');
  const side = randomItem(['long', 'short']);
  const leverage = randomItem([2, 3, 5]);

  const { pnl, isWin } = generatePnl('perps', entryValue);
  const closedAt = keepOpen ? null : addHours(openedAt, duration);

  // Entry price based on symbol
  const basePrices: Record<string, number> = {
    BTC: 95000,
    ETH: 3400,
    SOL: 140,
    HYPE: 25,
    FARTCOIN: 0.40,
    DOGE: 0.35,
    XRP: 2.20,
    SUI: 4.50,
    AVAX: 40,
    LINK: 22,
  };
  const entryPrice = round2(basePrices[symbol.symbol] * (1 + (Math.random() * 0.1 - 0.05)));
  const currentValue = keepOpen ? round2(entryValue * (1 + (Math.random() * 0.15 - 0.05))) : round2(entryValue + pnl);

  return {
    id: generateUUID(),
    domain: 'perps',
    target: symbol.symbol,
    targetName: `${symbol.symbol}-PERP`,
    entryValueUsd: entryValue,
    currentValueUsd: currentValue,
    status: keepOpen ? 'open' : 'closed',
    side,
    size: round2(entryValue * leverage / entryPrice),
    entryPrice,
    currentPrice: keepOpen ? round2(entryPrice * (1 + (Math.random() * 0.08 - 0.04))) : null,
    openedAt,
    closedAt,
    realizedPnl: keepOpen ? null : round2(pnl),
    metadata: {
      symbol: symbol.symbol,
      leverage,
      liquidationPrice: side === 'long'
        ? round2(entryPrice * (1 - 0.9 / leverage))
        : round2(entryPrice * (1 + 0.9 / leverage)),
      exchange: 'hyperliquid',
    },
  };
}

function generatePolymarketPosition(openedAt: Date, keepOpen: boolean): GeneratedPosition {
  const market = randomItem(POLYMARKET_MARKETS);
  const entryValue = generatePositionSize('polymarket');
  const duration = generatePositionDuration('polymarket');
  const side = randomItem(['yes', 'no']);

  const { pnl, isWin } = generatePnl('polymarket', entryValue);
  const closedAt = keepOpen ? null : addHours(openedAt, duration);

  const entryPrice = round2(Math.random() * (market.typicalYesPrice.max - market.typicalYesPrice.min) + market.typicalYesPrice.min);
  const shares = round2(entryValue / entryPrice);
  const currentValue = keepOpen ? round2(entryValue * (1 + (Math.random() * 0.2 - 0.08))) : round2(entryValue + pnl);

  return {
    id: generateUUID(),
    domain: 'polymarket',
    target: market.conditionId,
    targetName: market.question.substring(0, 50) + '...',
    entryValueUsd: entryValue,
    currentValueUsd: currentValue,
    status: keepOpen ? 'open' : 'closed',
    side,
    size: shares,
    entryPrice,
    currentPrice: keepOpen ? round2(entryPrice + (Math.random() * 0.2 - 0.1)) : null,
    openedAt,
    closedAt,
    realizedPnl: keepOpen ? null : round2(pnl),
    metadata: {
      conditionId: market.conditionId,
      question: market.question,
      category: market.category,
      outcome: side,
      shares,
    },
  };
}

function generateSpotPosition(openedAt: Date, keepOpen: boolean): GeneratedPosition {
  const token = randomItem(SPOT_TOKENS);
  const entryValue = generatePositionSize('spot');
  const duration = generatePositionDuration('spot');

  const { pnl, isWin } = generatePnl('spot', entryValue);
  const closedAt = keepOpen ? null : addHours(openedAt, duration);

  // Token prices vary wildly
  const entryPrice = Math.random() * 0.01;
  const size = entryValue / entryPrice;
  const currentValue = keepOpen ? round2(entryValue * (1 + (Math.random() * 0.25 - 0.10))) : round2(entryValue + pnl);

  return {
    id: generateUUID(),
    domain: 'spot',
    target: token.mint,
    targetName: token.symbol,
    entryValueUsd: entryValue,
    currentValueUsd: currentValue,
    status: keepOpen ? 'open' : 'closed',
    side: null,
    size: round2(size),
    entryPrice: round2(entryPrice * 1e6) / 1e6, // Keep precision
    currentPrice: keepOpen ? round2((entryPrice * currentValue / entryValue) * 1e6) / 1e6 : null,
    openedAt,
    closedAt,
    realizedPnl: keepOpen ? null : round2(pnl),
    metadata: {
      mint: token.mint,
      symbol: token.symbol,
      name: token.name,
    },
  };
}

export function generatePositions(): GeneratedPosition[] {
  resetSeed(42); // Consistent generation

  const positions: GeneratedPosition[] = [];
  const totalPositions = randomInt(CONFIG.positions.total.min, CONFIG.positions.total.max);
  const openPositions = randomInt(CONFIG.positions.openAtEnd.min, CONFIG.positions.openAtEnd.max);
  const closedPositions = totalPositions - openPositions;

  // Track open positions per domain to respect max limit
  const openByDomain: Record<Domain, number> = {
    dlmm: 0,
    perps: 0,
    polymarket: 0,
    spot: 0,
  };

  // Generate closed positions first (distributed across time range)
  const closedDates: Date[] = [];
  for (let i = 0; i < closedPositions; i++) {
    // Leave buffer at end for open positions
    const bufferEnd = addHours(CONFIG.endDate, -72);
    closedDates.push(randomTimestamp(CONFIG.startDate, bufferEnd));
  }
  closedDates.sort((a, b) => a.getTime() - b.getTime());

  for (const openedAt of closedDates) {
    const domain = randomItem([...CONFIG.domains]);

    switch (domain) {
      case 'dlmm':
        positions.push(generateDlmmPosition(openedAt, false));
        break;
      case 'perps':
        positions.push(generatePerpsPosition(openedAt, false));
        break;
      case 'polymarket':
        positions.push(generatePolymarketPosition(openedAt, false));
        break;
      case 'spot':
        positions.push(generateSpotPosition(openedAt, false));
        break;
    }
  }

  // Generate open positions (in last few days)
  const recentStart = addHours(CONFIG.endDate, -96); // Last 4 days
  for (let i = 0; i < openPositions; i++) {
    // Find domain that isn't at max
    let domain: Domain;
    let attempts = 0;
    do {
      domain = randomItem([...CONFIG.domains]);
      attempts++;
    } while (openByDomain[domain] >= CONFIG.maxPositionsPerDomain && attempts < 20);

    if (attempts >= 20) {
      // All domains at max, find any with room
      domain = (Object.entries(openByDomain).find(([_, count]) => count < CONFIG.maxPositionsPerDomain)?.[0] as Domain) || 'spot';
    }

    openByDomain[domain]++;
    const openedAt = randomTimestamp(recentStart, CONFIG.endDate);

    switch (domain) {
      case 'dlmm':
        positions.push(generateDlmmPosition(openedAt, true));
        break;
      case 'perps':
        positions.push(generatePerpsPosition(openedAt, true));
        break;
      case 'polymarket':
        positions.push(generatePolymarketPosition(openedAt, true));
        break;
      case 'spot':
        positions.push(generateSpotPosition(openedAt, true));
        break;
    }
  }

  // Sort all positions by openedAt
  positions.sort((a, b) => a.openedAt.getTime() - b.openedAt.getTime());

  return positions;
}

// Calculate final balances from positions
export function calculateFinalBalances(positions: GeneratedPosition[]): Record<Domain, number> {
  const balances: Record<Domain, number> = {
    dlmm: CONFIG.initialBalancePerDomain,
    perps: CONFIG.initialBalancePerDomain,
    polymarket: CONFIG.initialBalancePerDomain,
    spot: CONFIG.initialBalancePerDomain,
  };

  // Sum realized P&L for closed positions
  for (const pos of positions) {
    if (pos.status === 'closed' && pos.realizedPnl !== null) {
      balances[pos.domain] += pos.realizedPnl;
    }
  }

  // Subtract entry value for open positions (money in position, not balance)
  for (const pos of positions) {
    if (pos.status === 'open') {
      balances[pos.domain] -= pos.entryValueUsd;
    }
  }

  // Round all balances
  for (const domain of CONFIG.domains) {
    balances[domain] = round2(balances[domain]);
  }

  return balances;
}
