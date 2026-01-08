/**
 * Snapshot Generator
 * Creates time-series performance snapshots for charts
 */

import { CONFIG, type Domain } from '../config.js';
import { generateUUID, addHours, getDatesInRange, round2, randomInRange } from '../utils.js';
import type { GeneratedPosition } from './positions.js';

export interface GeneratedSnapshot {
  id: string;
  domain: Domain | null; // null = total portfolio
  totalValueUsd: number;
  numPositions: number;
  dailyPnl: number | null;
  weeklyPnl: number | null;
  totalPnl: number | null;
  timestamp: Date;
}

interface PortfolioState {
  balance: number;
  openPositions: GeneratedPosition[];
  totalValue: number;
  realizedPnl: number;
}

function getPortfolioStateAtTime(
  positions: GeneratedPosition[],
  timestamp: Date,
  domain: Domain | null
): PortfolioState {
  // Filter positions by domain if specified
  const domainPositions = domain
    ? positions.filter((p) => p.domain === domain)
    : positions;

  // Get positions that were open at this timestamp
  const openPositions = domainPositions.filter((p) => {
    const wasOpened = p.openedAt <= timestamp;
    const notYetClosed = !p.closedAt || p.closedAt > timestamp;
    return wasOpened && notYetClosed;
  });

  // Calculate realized P&L from positions closed before this timestamp
  const closedPositions = domainPositions.filter(
    (p) => p.closedAt && p.closedAt <= timestamp
  );
  const realizedPnl = closedPositions.reduce(
    (sum, p) => sum + (p.realizedPnl || 0),
    0
  );

  // Calculate current value of open positions with some random drift
  // (simulating market movement between snapshots)
  const openPositionValue = openPositions.reduce((sum, p) => {
    // Calculate how far through the position lifecycle we are
    const positionStart = p.openedAt.getTime();
    const snapshotTime = timestamp.getTime();
    const positionEnd = p.closedAt?.getTime() || CONFIG.endDate.getTime();
    const progress = (snapshotTime - positionStart) / (positionEnd - positionStart);

    // Interpolate between entry and final value with some noise
    let currentValue: number;
    if (p.closedAt) {
      // Closed position: interpolate toward final value
      const targetValue = p.entryValueUsd + (p.realizedPnl || 0);
      currentValue = p.entryValueUsd + (targetValue - p.entryValueUsd) * progress;
    } else {
      // Open position: use current value with slight variation
      currentValue = p.currentValueUsd;
    }

    // Add small random noise (1-3%)
    const noise = 1 + randomInRange(-0.03, 0.03);
    return sum + currentValue * noise;
  }, 0);

  // Starting balance based on domain
  const initialBalance = domain
    ? CONFIG.initialBalancePerDomain
    : CONFIG.initialBalancePerDomain * CONFIG.domains.length;

  // Balance = initial + realized P&L - value in open positions
  const balance = initialBalance + realizedPnl - openPositions.reduce((sum, p) => sum + p.entryValueUsd, 0);
  const totalValue = balance + openPositionValue;

  return {
    balance: round2(balance),
    openPositions,
    totalValue: round2(totalValue),
    realizedPnl: round2(realizedPnl),
  };
}

export function generateSnapshots(positions: GeneratedPosition[]): GeneratedSnapshot[] {
  const snapshots: GeneratedSnapshot[] = [];
  const dates = getDatesInRange(CONFIG.startDate, CONFIG.endDate);
  const domains: (Domain | null)[] = [...CONFIG.domains, null]; // null = total

  // Generate snapshots at 6-hour intervals
  const hoursPerSnapshot = 24 / CONFIG.snapshotsPerDay;

  // Track previous values for daily/weekly P&L calculations
  const previousValues: Record<string, { daily: number; weekly: number[] }> = {};

  for (const date of dates) {
    for (let hour = 0; hour < 24; hour += hoursPerSnapshot) {
      const timestamp = addHours(date, hour);

      // Skip timestamps before start or after end
      if (timestamp < CONFIG.startDate || timestamp > CONFIG.endDate) continue;

      for (const domain of domains) {
        const domainKey = domain || 'total';
        const state = getPortfolioStateAtTime(positions, timestamp, domain);

        // Initialize tracking if needed
        if (!previousValues[domainKey]) {
          previousValues[domainKey] = {
            daily: state.totalValue,
            weekly: [state.totalValue],
          };
        }

        // Calculate P&L
        const dailyPnl = round2(state.totalValue - previousValues[domainKey].daily);
        const weeklyPnl =
          previousValues[domainKey].weekly.length >= 28 // 7 days * 4 snapshots
            ? round2(state.totalValue - previousValues[domainKey].weekly[0])
            : null;

        // Initial balance for total P&L
        const initialBalance = domain
          ? CONFIG.initialBalancePerDomain
          : CONFIG.initialBalancePerDomain * CONFIG.domains.length;
        const totalPnl = round2(state.totalValue - initialBalance);

        snapshots.push({
          id: generateUUID(),
          domain,
          totalValueUsd: state.totalValue,
          numPositions: state.openPositions.length,
          dailyPnl: hour === 0 ? dailyPnl : null, // Only set daily P&L at midnight
          weeklyPnl,
          totalPnl,
          timestamp,
        });

        // Update tracking - reset daily at midnight
        if (hour === 0) {
          previousValues[domainKey].daily = state.totalValue;
        }

        // Track weekly values (rolling window)
        previousValues[domainKey].weekly.push(state.totalValue);
        if (previousValues[domainKey].weekly.length > 28) {
          previousValues[domainKey].weekly.shift();
        }
      }
    }
  }

  // Sort by timestamp then domain
  snapshots.sort((a, b) => {
    const timeDiff = a.timestamp.getTime() - b.timestamp.getTime();
    if (timeDiff !== 0) return timeDiff;
    // Put total (null domain) last
    if (a.domain === null) return 1;
    if (b.domain === null) return -1;
    return a.domain.localeCompare(b.domain);
  });

  return snapshots;
}

// Get summary statistics
export function getSnapshotSummary(snapshots: GeneratedSnapshot[]): {
  totalSnapshots: number;
  byDomain: Record<string, number>;
  dateRange: { start: Date; end: Date };
  finalValues: Record<string, number>;
} {
  const byDomain: Record<string, number> = {};
  const finalValues: Record<string, number> = {};

  let minDate = new Date();
  let maxDate = new Date(0);

  for (const snap of snapshots) {
    const key = snap.domain || 'total';
    byDomain[key] = (byDomain[key] || 0) + 1;

    if (snap.timestamp < minDate) minDate = snap.timestamp;
    if (snap.timestamp > maxDate) maxDate = snap.timestamp;

    // Track final value (last snapshot for each domain)
    finalValues[key] = snap.totalValueUsd;
  }

  return {
    totalSnapshots: snapshots.length,
    byDomain,
    dateRange: { start: minDate, end: maxDate },
    finalValues,
  };
}
