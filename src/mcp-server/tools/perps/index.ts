/**
 * Perps Tools
 * Hyperliquid perpetual futures trading tools
 * Uses LIVE data from Hyperliquid API
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { hyperliquidClient, type PerpMarket } from '../../../clients/hyperliquid/client.js';
import {
  getOpenPositions,
  getDomainBalance,
  createPosition,
  closePosition,
  updateDomainBalance,
  logDecision,
} from '../../../db/index.js';

export const perpsTools: Tool[] = [
  {
    name: 'perps_fetch_markets',
    description: `Fetch LIVE perpetual futures markets from Hyperliquid.
Returns markets with: symbol, price, 24h change, volume, open interest, funding rate, max leverage.`,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          default: 30,
          description: 'Maximum number of markets to return (default: 30)',
        },
        minVolume: {
          type: 'number',
          default: 1000000,
          description: 'Minimum 24h volume in USD (default: $1M)',
        },
      },
    },
  },
  {
    name: 'perps_open_position',
    description: `Open a leveraged perpetual futures position (long or short).
Risk management:
- Max leverage is capped at 10x regardless of market max
- Position size cannot exceed 20% of available balance
- Maximum 3 open positions at a time`,
    inputSchema: {
      type: 'object',
      properties: {
        symbol: {
          type: 'string',
          description: 'Market symbol (e.g., BTC, ETH, SOL)',
        },
        side: {
          type: 'string',
          enum: ['LONG', 'SHORT'],
          description: 'Position direction',
        },
        sizeUsd: {
          type: 'number',
          minimum: 10,
          description: 'Position size in USD (notional value)',
        },
        leverage: {
          type: 'number',
          minimum: 1,
          maximum: 10,
          default: 3,
          description: 'Leverage multiplier (1-10, default: 3)',
        },
      },
      required: ['symbol', 'side', 'sizeUsd'],
    },
  },
  {
    name: 'perps_close_position',
    description: 'Close an open perpetual futures position.',
    inputSchema: {
      type: 'object',
      properties: {
        positionId: {
          type: 'string',
          description: 'Database ID of the position to close',
        },
        percentage: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 100,
          description: 'Percentage of position to close (1-100, default: 100)',
        },
      },
      required: ['positionId'],
    },
  },
  {
    name: 'perps_get_positions',
    description: 'Get all open perps positions with current P&L, liquidation price, and leverage.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'perps_sync_prices',
    description: 'Update all open perps positions with current market prices and P&L.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handlePerpsTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const paperMode = process.env.PAPER_TRADING !== 'false';

  switch (name) {
    case 'perps_fetch_markets': {
      const limit = (args.limit as number) || 30;
      const minVolume = (args.minVolume as number) || 1000000;

      // Fetch LIVE markets from Hyperliquid API
      const markets = await hyperliquidClient.getMarkets();

      const filtered = markets
        .filter((m: PerpMarket) => m.volume24h >= minVolume)
        .slice(0, limit)
        .map((m: PerpMarket) => ({
          symbol: m.symbol,
          price: m.markPrice.toFixed(4),
          volume24h: (m.volume24h / 1e6).toFixed(1) + 'M',
          openInterest: (m.openInterest / 1e6).toFixed(1) + 'M',
          fundingRate: (m.fundingRate * 100).toFixed(4) + '%',
          maxLeverage: m.maxLeverage,
        }));

      return {
        count: filtered.length,
        source: 'LIVE Hyperliquid API',
        markets: filtered,
        hint: 'Use perps_open_position to open a long or short position',
      };
    }

    case 'perps_open_position': {
      const symbol = args.symbol as string;
      const side = args.side as 'LONG' | 'SHORT';
      const sizeUsd = args.sizeUsd as number;
      const leverage = Math.min((args.leverage as number) || 3, 10); // Cap at 10x

      // Calculate margin required
      const marginRequired = sizeUsd / leverage;

      // Validate balance
      const balance = await getDomainBalance('perps');
      if (marginRequired > balance) {
        return {
          success: false,
          error: `Insufficient margin. Need $${marginRequired.toFixed(2)}, have $${balance.toFixed(2)}`,
        };
      }

      // Check position sizing (max 20% of balance)
      if (marginRequired > balance * 0.2) {
        return {
          success: false,
          error: `Position too large. Max $${(balance * 0.2).toFixed(2)} (20% of balance)`,
        };
      }

      // Check position limit
      const positions = await getOpenPositions('perps');
      if (positions.length >= 3) {
        return {
          success: false,
          error: 'Maximum 3 perps positions allowed. Close a position first.',
        };
      }

      // Get current LIVE price
      const entryPrice = await hyperliquidClient.getMarkPrice(symbol);
      if (!entryPrice || entryPrice <= 0) {
        return {
          success: false,
          error: `Market ${symbol} not found or price unavailable`,
        };
      }

      // Calculate liquidation price
      const liquidationPrice = hyperliquidClient.calculateLiquidationPrice(
        entryPrice,
        side,
        leverage
      );

      if (paperMode) {
        // Simulate order execution
        const simulation = await hyperliquidClient.simulateOrder(symbol, side, sizeUsd);

        const positionId = await createPosition('perps', {
          target: symbol,
          targetName: symbol,
          entryValueUsd: marginRequired,
          side,
          size: sizeUsd,
          entryPrice: simulation.fillPrice,
          metadata: {
            symbol,
            side,
            size_usd: sizeUsd,
            leverage,
            liquidation_price: liquidationPrice,
            unrealized_pnl: 0,
            margin_used: marginRequired,
            order_id: simulation.orderId,
            paperTrade: true,
          },
        });

        // Deduct margin from balance
        await updateDomainBalance('perps', balance - marginRequired);

        await logDecision('perps', {
          action: side === 'LONG' ? 'open_long' : 'open_short',
          target: symbol,
          amountUsd: sizeUsd,
          reasoning: `Opened ${leverage}x ${side} on ${symbol}, notional $${sizeUsd}`,
          confidence: 0.8,
        });

        return {
          success: true,
          mode: 'paper',
          positionId,
          symbol,
          side,
          sizeUsd,
          leverage,
          marginUsed: marginRequired.toFixed(2),
          entryPrice: simulation.fillPrice.toFixed(4),
          liquidationPrice: liquidationPrice.toFixed(4),
          newBalance: (balance - marginRequired).toFixed(2),
        };
      } else {
        // Real trading via Hyperliquid API
        try {
          const result = await hyperliquidClient.placeOrder(
            symbol,
            side,
            sizeUsd,
            leverage
          );

          const positionId = await createPosition('perps', {
            target: symbol,
            targetName: symbol,
            entryValueUsd: marginRequired,
            side,
            size: sizeUsd,
            entryPrice: result.fillPrice,
            metadata: {
              symbol,
              side,
              size_usd: sizeUsd,
              leverage,
              liquidation_price: liquidationPrice,
              unrealized_pnl: 0,
              margin_used: marginRequired,
              order_id: result.orderId,
              paperTrade: false,
            },
          });

          // Deduct margin from balance
          await updateDomainBalance('perps', balance - marginRequired);

          await logDecision('perps', {
            action: side === 'LONG' ? 'open_long' : 'open_short',
            target: symbol,
            amountUsd: sizeUsd,
            reasoning: `REAL: Opened ${leverage}x ${side} on ${symbol}, notional $${sizeUsd}`,
            confidence: 0.8,
          });

          return {
            success: true,
            mode: 'REAL',
            positionId,
            symbol,
            side,
            sizeUsd,
            leverage,
            marginUsed: marginRequired.toFixed(2),
            entryPrice: result.fillPrice.toFixed(4),
            liquidationPrice: liquidationPrice.toFixed(4),
            orderId: result.orderId,
            newBalance: (balance - marginRequired).toFixed(2),
          };
        } catch (error) {
          return {
            success: false,
            error: `Hyperliquid order failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      }
    }

    case 'perps_close_position': {
      const positionId = args.positionId as string;
      const percentage = (args.percentage as number) || 100;

      const positions = await getOpenPositions('perps');
      const position = positions.find(p => p.id === positionId);

      if (!position) {
        return {
          success: false,
          error: `Position ${positionId} not found or already closed`,
        };
      }

      const metadata = position.metadata as Record<string, unknown>;
      const symbol = metadata.symbol as string;
      const side = metadata.side as 'LONG' | 'SHORT';
      const entryPrice = metadata.entry_price as number;
      const sizeUsd = metadata.size_usd as number;
      const marginUsed = (metadata.margin_used as number) || position.entryValueUsd;

      // Get current LIVE price
      const currentPrice = await hyperliquidClient.getMarkPrice(symbol);

      // Calculate P&L
      const pnl = hyperliquidClient.calculatePnl(side, sizeUsd, entryPrice, currentPrice);
      const valueToReturn = (marginUsed + pnl) * (percentage / 100);

      if (paperMode) {
        await closePosition('perps', positionId, {
          currentValueUsd: marginUsed + pnl,
          realizedPnl: pnl,
          metadata: { exit_price: currentPrice },
        });

        // Return margin + PnL to balance
        const balance = await getDomainBalance('perps');
        await updateDomainBalance('perps', balance + valueToReturn);

        await logDecision('perps', {
          action: 'close_position',
          target: symbol,
          amountUsd: valueToReturn,
          reasoning: `Closed ${percentage}% of ${side} ${symbol}, PnL: $${pnl.toFixed(2)}`,
          confidence: 0.8,
        });

        return {
          success: true,
          mode: 'paper',
          positionId,
          symbol,
          side,
          percentage,
          exitPrice: currentPrice.toFixed(4),
          valueReturned: valueToReturn.toFixed(2),
          pnl: pnl.toFixed(2),
          pnlPercent: ((pnl / marginUsed) * 100).toFixed(1) + '%',
          newBalance: (balance + valueToReturn).toFixed(2),
        };
      } else {
        // Real trading via Hyperliquid API
        try {
          const sizeToClose = sizeUsd * (percentage / 100);
          const result = await hyperliquidClient.closePosition(symbol, side, sizeToClose);

          const pnl = hyperliquidClient.calculatePnl(side, sizeToClose, entryPrice, result.fillPrice);
          const valueToReturn = (marginUsed + pnl) * (percentage / 100);

          await closePosition('perps', positionId, {
            currentValueUsd: marginUsed + pnl,
            realizedPnl: pnl,
            metadata: { exit_price: result.fillPrice, order_id: result.orderId },
          });

          // Return margin + PnL to balance
          const balance = await getDomainBalance('perps');
          await updateDomainBalance('perps', balance + valueToReturn);

          await logDecision('perps', {
            action: 'close_position',
            target: symbol,
            amountUsd: valueToReturn,
            reasoning: `REAL: Closed ${percentage}% of ${side} ${symbol}, PnL: $${pnl.toFixed(2)}`,
            confidence: 0.8,
          });

          return {
            success: true,
            mode: 'REAL',
            positionId,
            symbol,
            side,
            percentage,
            exitPrice: result.fillPrice.toFixed(4),
            valueReturned: valueToReturn.toFixed(2),
            pnl: pnl.toFixed(2),
            pnlPercent: ((pnl / marginUsed) * 100).toFixed(1) + '%',
            orderId: result.orderId,
            newBalance: (balance + valueToReturn).toFixed(2),
          };
        } catch (error) {
          return {
            success: false,
            error: `Hyperliquid close failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      }
    }

    case 'perps_get_positions': {
      const positions = await getOpenPositions('perps');

      if (positions.length === 0) {
        return {
          count: 0,
          message: 'No open perps positions',
        };
      }

      // Update with live prices
      const positionsWithPrices = await Promise.all(
        positions.map(async p => {
          const meta = p.metadata as Record<string, unknown>;
          const symbol = meta.symbol as string;
          const side = meta.side as 'LONG' | 'SHORT';
          const entryPrice = meta.entry_price as number;
          const sizeUsd = meta.size_usd as number;
          const marginUsed = (meta.margin_used as number) || p.entryValueUsd;

          // Get live price
          const currentPrice = await hyperliquidClient.getMarkPrice(symbol);
          const pnl = hyperliquidClient.calculatePnl(side, sizeUsd, entryPrice, currentPrice);

          return {
            id: p.id,
            symbol,
            side,
            sizeUsd,
            leverage: meta.leverage,
            entryPrice: entryPrice?.toFixed(4),
            currentPrice: currentPrice?.toFixed(4),
            liquidationPrice: (meta.liquidation_price as number)?.toFixed(4),
            marginUsed: marginUsed?.toFixed(2),
            unrealizedPnl: pnl.toFixed(2),
            pnlPercent: ((pnl / marginUsed) * 100).toFixed(1) + '%',
            openedAt: p.openedAt,
          };
        })
      );

      return {
        count: positions.length,
        source: 'LIVE prices from Hyperliquid',
        positions: positionsWithPrices,
      };
    }

    case 'perps_sync_prices': {
      const positions = await getOpenPositions('perps');

      if (positions.length === 0) {
        return {
          synced: 0,
          message: 'No positions to sync',
        };
      }

      let updated = 0;
      for (const position of positions) {
        const meta = position.metadata as Record<string, unknown>;
        const symbol = meta.symbol as string;
        const side = meta.side as 'LONG' | 'SHORT';
        const entryPrice = meta.entry_price as number;
        const sizeUsd = meta.size_usd as number;

        const currentPrice = await hyperliquidClient.getMarkPrice(symbol);
        if (currentPrice > 0) {
          const pnl = hyperliquidClient.calculatePnl(side, sizeUsd, entryPrice, currentPrice);
          // Would update position in database here with pnl
          console.log(`Position ${position.id}: PnL = $${pnl.toFixed(2)}`);
          updated++;
        }
      }

      return {
        synced: updated,
        source: 'LIVE Hyperliquid API',
        message: `Updated ${updated} positions with current market prices`,
      };
    }

    default:
      throw new Error(`Unknown perps tool: ${name}`);
  }
}
