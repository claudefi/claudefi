/**
 * Portfolio Tools
 * Cross-domain portfolio management tools
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  getPortfolio,
  getAllBalances,
  getOpenPositions,
  getPerformanceSnapshots,
} from '../../../db/index.js';
import type { Domain } from '../../../types/index.js';

export const portfolioTools: Tool[] = [
  {
    name: 'get_portfolio',
    description: 'Get full portfolio overview across all domains including balances, positions, and total value.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_balances',
    description: 'Get available cash balances for all domains (DLMM, Perps, Polymarket, Spot).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'portfolio_get_positions',
    description: 'Get all open positions, optionally filtered by domain.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['dlmm', 'perps', 'polymarket', 'spot'],
          description: 'Filter positions by domain (optional)',
        },
      },
    },
  },
  {
    name: 'portfolio_get_performance',
    description: 'Get recent performance snapshots for a domain.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['dlmm', 'perps', 'polymarket', 'spot'],
          description: 'Domain to get performance for',
        },
        limit: {
          type: 'number',
          default: 50,
          description: 'Number of snapshots to return',
        },
      },
      required: ['domain'],
    },
  },
];

export async function handlePortfolioTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'get_portfolio': {
      const portfolio = await getPortfolio();
      return {
        totalValueUsd: portfolio.totalValueUsd,
        domains: portfolio.domains,
        openPositionsCount: portfolio.positions.length,
        lastUpdated: portfolio.lastUpdated,
        breakdown: Object.entries(portfolio.domains).map(([domain, data]) => ({
          domain,
          balance: data.balance.toFixed(2),
          positionsValue: data.positionsValue.toFixed(2),
          totalValue: data.totalValue.toFixed(2),
          numPositions: data.numPositions,
          allocation: ((data.totalValue / portfolio.totalValueUsd) * 100).toFixed(1) + '%',
        })),
      };
    }

    case 'get_balances': {
      const balances = await getAllBalances();
      const total = Object.values(balances).reduce((a, b) => a + b, 0);
      return {
        dlmm: balances.dlmm.toFixed(2),
        perps: balances.perps.toFixed(2),
        polymarket: balances.polymarket.toFixed(2),
        spot: balances.spot.toFixed(2),
        total: total.toFixed(2),
      };
    }

    case 'portfolio_get_positions': {
      const domain = args.domain as Domain | undefined;

      if (domain) {
        const positions = await getOpenPositions(domain);
        return {
          domain,
          count: positions.length,
          positions: positions.map(p => ({
            id: p.id,
            target: p.target,
            entryValueUsd: p.entryValueUsd.toFixed(2),
            currentValueUsd: p.currentValueUsd.toFixed(2),
            pnl: (p.currentValueUsd - p.entryValueUsd).toFixed(2),
            pnlPercent: (((p.currentValueUsd - p.entryValueUsd) / p.entryValueUsd) * 100).toFixed(1) + '%',
            openedAt: p.openedAt,
          })),
        };
      }

      // Get positions for all domains
      const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
      const allPositions = await Promise.all(
        domains.map(async d => ({
          domain: d,
          positions: await getOpenPositions(d),
        }))
      );

      return {
        totalCount: allPositions.reduce((sum, d) => sum + d.positions.length, 0),
        byDomain: Object.fromEntries(
          allPositions.map(d => [
            d.domain,
            {
              count: d.positions.length,
              positions: d.positions.map(p => ({
                id: p.id,
                target: p.target,
                currentValueUsd: p.currentValueUsd.toFixed(2),
                pnl: (p.currentValueUsd - p.entryValueUsd).toFixed(2),
              })),
            },
          ])
        ),
      };
    }

    case 'portfolio_get_performance': {
      const domain = args.domain as Domain;
      const limit = (args.limit as number) || 50;

      const snapshots = await getPerformanceSnapshots(domain, limit);

      if (snapshots.length === 0) {
        return { domain, message: 'No performance data available' };
      }

      const latest = snapshots[0];
      const oldest = snapshots[snapshots.length - 1];
      const changeUsd = latest.totalValueUsd - oldest.totalValueUsd;
      const changePercent = oldest.totalValueUsd > 0
        ? ((changeUsd / oldest.totalValueUsd) * 100).toFixed(2)
        : '0';

      return {
        domain,
        currentValue: latest.totalValueUsd.toFixed(2),
        numPositions: latest.numPositions,
        periodStart: oldest.timestamp,
        periodEnd: latest.timestamp,
        changeUsd: changeUsd.toFixed(2),
        changePercent: changePercent + '%',
        snapshots: snapshots.slice(0, 10).map(s => ({
          timestamp: s.timestamp,
          totalValueUsd: s.totalValueUsd.toFixed(2),
          numPositions: s.numPositions,
        })),
      };
    }

    default:
      throw new Error(`Unknown portfolio tool: ${name}`);
  }
}
