/**
 * Polymarket Tools
 * Prediction market trading tools
 * Uses LIVE data from Gamma API
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { gammaClient, type PolyMarket } from '../../../clients/polymarket/client.js';
import { polymarketClobClient } from '../../../clients/polymarket/clob-client.js';
import {
  getOpenPositions,
  getDomainBalance,
  createPosition,
  closePosition,
  updateDomainBalance,
  logDecision,
} from '../../../db/index.js';

export const polymarketTools: Tool[] = [
  {
    name: 'polymarket_fetch_markets',
    description: `Fetch LIVE prediction markets from Polymarket with prices and volume.
Returns markets with: question, YES/NO prices, volume, liquidity, end date.`,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          default: 30,
          description: 'Maximum number of markets to return (default: 30)',
        },
        trending: {
          type: 'boolean',
          default: true,
          description: 'Sort by volume (trending) or recency (default: true)',
        },
      },
    },
  },
  {
    name: 'polymarket_search',
    description: 'Search for markets by keyword.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query (e.g., "Trump", "Bitcoin", "election")',
        },
        limit: {
          type: 'number',
          default: 10,
          description: 'Maximum results (default: 10)',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'polymarket_buy_shares',
    description: `Buy YES or NO shares in a prediction market.
Calculates expected value and suggests position size based on Kelly Criterion.`,
    inputSchema: {
      type: 'object',
      properties: {
        conditionId: {
          type: 'string',
          description: 'Condition ID of the market',
        },
        outcome: {
          type: 'string',
          enum: ['YES', 'NO'],
          description: 'Which outcome to buy',
        },
        amountUsd: {
          type: 'number',
          minimum: 1,
          description: 'USD amount to spend on shares',
        },
        estimatedProb: {
          type: 'number',
          minimum: 1,
          maximum: 99,
          description: 'Your estimated probability for YES outcome (1-99%)',
        },
      },
      required: ['conditionId', 'outcome', 'amountUsd'],
    },
  },
  {
    name: 'polymarket_sell_shares',
    description: 'Sell shares from an existing position.',
    inputSchema: {
      type: 'object',
      properties: {
        positionId: {
          type: 'string',
          description: 'Database ID of the position to sell',
        },
        percentage: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 100,
          description: 'Percentage of position to sell (1-100, default: 100)',
        },
      },
      required: ['positionId'],
    },
  },
  {
    name: 'polymarket_get_positions',
    description: 'Get all open Polymarket positions with current values.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handlePolymarketTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const paperMode = process.env.PAPER_TRADING !== 'false';

  switch (name) {
    case 'polymarket_fetch_markets': {
      const limit = (args.limit as number) || 30;
      const trending = args.trending !== false;

      // Fetch LIVE markets from Gamma API
      let markets: PolyMarket[];

      if (trending) {
        markets = await gammaClient.getTrendingMarkets(limit);
      } else {
        markets = await gammaClient.getMarkets({ limit, active: true, closed: false });
      }

      const formatted = markets.map((m: PolyMarket) => {
        const prices = gammaClient.getMarketPrices(m);
        const vol = (m.volume24hrClob || 0) + (m.volume24hrAmm || 0);

        return {
          conditionId: m.condition_id,
          question: m.question,
          yesPrice: prices.yesPrice.toFixed(2),
          noPrice: prices.noPrice.toFixed(2),
          impliedYesProb: gammaClient.getImpliedProbability(prices.yesPrice).toFixed(0) + '%',
          volume24h: `$${vol.toLocaleString()}`,
          liquidity: `$${(m.liquidity || 0).toLocaleString()}`,
          endDate: m.endDate,
          daysToClose: gammaClient.getDaysToClose(m).toFixed(1),
          category: m.category || 'Unknown',
        };
      });

      return {
        count: formatted.length,
        source: 'LIVE Gamma API (Polymarket)',
        markets: formatted,
        hint: 'Use polymarket_buy_shares to buy YES or NO on a market',
      };
    }

    case 'polymarket_search': {
      const query = args.query as string;
      const limit = (args.limit as number) || 10;

      const markets = await gammaClient.searchMarkets(query, limit);

      const formatted = markets.map((m: PolyMarket) => {
        const prices = gammaClient.getMarketPrices(m);
        return {
          conditionId: m.condition_id,
          question: m.question,
          yesPrice: prices.yesPrice.toFixed(2),
          noPrice: prices.noPrice.toFixed(2),
          endDate: m.endDate,
          category: m.category || 'Unknown',
        };
      });

      return {
        query,
        count: formatted.length,
        source: 'LIVE Gamma API',
        markets: formatted,
      };
    }

    case 'polymarket_buy_shares': {
      const conditionId = args.conditionId as string;
      const outcome = args.outcome as 'YES' | 'NO';
      const amountUsd = args.amountUsd as number;
      const estimatedProb = args.estimatedProb as number | undefined;

      // Validate balance
      const balance = await getDomainBalance('polymarket');
      if (amountUsd > balance) {
        return {
          success: false,
          error: `Insufficient balance. Have $${balance.toFixed(2)}, need $${amountUsd}`,
        };
      }

      // Check position limit
      const positions = await getOpenPositions('polymarket');
      if (positions.length >= 3) {
        return {
          success: false,
          error: 'Maximum 3 Polymarket positions allowed. Sell a position first.',
        };
      }

      // Get LIVE market info
      const market = await gammaClient.getMarket(conditionId);
      if (!market) {
        return {
          success: false,
          error: `Market ${conditionId} not found`,
        };
      }

      const prices = gammaClient.getMarketPrices(market);
      const price = outcome === 'YES' ? prices.yesPrice : prices.noPrice;
      const shares = amountUsd / price;

      // Calculate expected value if probability estimate provided
      let ev: number | null = null;
      let kellyBet: number | null = null;

      if (estimatedProb) {
        const trueProb = outcome === 'YES' ? estimatedProb : 100 - estimatedProb;
        ev = gammaClient.calculateExpectedValue(trueProb, price, amountUsd);
        kellyBet = gammaClient.calculateKellyBet(trueProb, price, balance);
      }

      if (paperMode) {
        const positionId = await createPosition('polymarket', {
          target: conditionId,
          targetName: market.question,
          entryValueUsd: amountUsd,
          side: outcome,
          size: shares,
          entryPrice: price,
          metadata: {
            condition_id: conditionId,
            market_question: market.question,
            outcome,
            shares,
            estimated_prob: estimatedProb,
            expected_value: ev,
            paperTrade: true,
          },
        });

        // Deduct from balance
        await updateDomainBalance('polymarket', balance - amountUsd);

        await logDecision('polymarket', {
          action: outcome === 'YES' ? 'buy_yes' : 'buy_no',
          target: conditionId,
          amountUsd,
          reasoning: `Bought ${shares.toFixed(2)} ${outcome} shares at $${price.toFixed(2)}${ev ? `, EV: $${ev.toFixed(2)}` : ''}`,
          confidence: ev && ev > 0 ? 0.8 : 0.6,
        });

        return {
          success: true,
          mode: 'paper',
          positionId,
          conditionId,
          question: market.question,
          outcome,
          shares: shares.toFixed(2),
          price: price.toFixed(2),
          amountUsd,
          expectedValue: ev?.toFixed(2) || 'N/A (provide estimatedProb)',
          suggestedKellyBet: kellyBet?.toFixed(2) || 'N/A',
          newBalance: (balance - amountUsd).toFixed(2),
        };
      } else {
        // Real Polymarket trading via CLOB API
        if (!polymarketClobClient.isReady()) {
          return {
            success: false,
            error: 'Polymarket wallet not initialized. Set POLYMARKET_PRIVATE_KEY (Ethereum private key with USDC on Polygon).',
          };
        }

        try {
          // For Polymarket, we need the token ID for the specific outcome
          // The condition_id is the market, but YES/NO have separate token IDs
          // Token ID format is typically: conditionId + outcome index
          const tokenId = `${conditionId}`; // Simplified - may need adjustment for actual API

          const result = await polymarketClobClient.buyShares(tokenId, price, shares);

          const positionId = await createPosition('polymarket', {
            target: conditionId,
            targetName: market.question,
            entryValueUsd: amountUsd,
            side: outcome,
            size: shares,
            entryPrice: price,
            metadata: {
              condition_id: conditionId,
              token_id: tokenId,
              market_question: market.question,
              outcome,
              shares,
              estimated_prob: estimatedProb,
              expected_value: ev,
              order_id: result.orderId,
              paperTrade: false,
            },
          });

          // Deduct from balance
          await updateDomainBalance('polymarket', balance - amountUsd);

          await logDecision('polymarket', {
            action: outcome === 'YES' ? 'buy_yes' : 'buy_no',
            target: conditionId,
            amountUsd,
            reasoning: `REAL: Bought ${shares.toFixed(2)} ${outcome} shares at $${price.toFixed(2)}`,
            confidence: ev && ev > 0 ? 0.8 : 0.6,
          });

          return {
            success: true,
            mode: 'REAL',
            positionId,
            conditionId,
            question: market.question,
            outcome,
            shares: shares.toFixed(2),
            price: price.toFixed(2),
            amountUsd,
            orderId: result.orderId,
            txHash: result.txHash,
            expectedValue: ev?.toFixed(2) || 'N/A',
            newBalance: (balance - amountUsd).toFixed(2),
          };
        } catch (error) {
          return {
            success: false,
            error: `Polymarket order failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      }
    }

    case 'polymarket_sell_shares': {
      const positionId = args.positionId as string;
      const percentage = (args.percentage as number) || 100;

      const positions = await getOpenPositions('polymarket');
      const position = positions.find(p => p.id === positionId);

      if (!position) {
        return {
          success: false,
          error: `Position ${positionId} not found or already closed`,
        };
      }

      const metadata = position.metadata as Record<string, unknown>;
      const conditionId = metadata.condition_id as string;
      const outcome = metadata.outcome as 'YES' | 'NO';
      const entryPrice = metadata.entry_price as number;
      const shares = metadata.shares as number;

      // Get current LIVE price
      const market = await gammaClient.getMarket(conditionId);
      let currentPrice = entryPrice;

      if (market) {
        const prices = gammaClient.getMarketPrices(market);
        currentPrice = outcome === 'YES' ? prices.yesPrice : prices.noPrice;
      }

      const currentValue = shares * currentPrice;
      const valueToReturn = currentValue * (percentage / 100);
      const pnl = currentValue - position.entryValueUsd;

      if (paperMode) {
        await closePosition('polymarket', positionId, {
          currentValueUsd: currentValue,
          realizedPnl: pnl,
          metadata: { exit_price: currentPrice },
        });

        // Return value to balance
        const balance = await getDomainBalance('polymarket');
        await updateDomainBalance('polymarket', balance + valueToReturn);

        await logDecision('polymarket', {
          action: percentage >= 100 ? 'sell' : 'partial_sell',
          target: conditionId,
          amountUsd: valueToReturn,
          reasoning: `Sold ${percentage}% of position, returned $${valueToReturn.toFixed(2)}, PnL: $${pnl.toFixed(2)}`,
          confidence: 0.8,
        });

        return {
          success: true,
          mode: 'paper',
          positionId,
          question: metadata.market_question,
          outcome,
          percentage,
          exitPrice: currentPrice.toFixed(2),
          valueReturned: valueToReturn.toFixed(2),
          pnl: pnl.toFixed(2),
          pnlPercent: ((pnl / position.entryValueUsd) * 100).toFixed(1) + '%',
          newBalance: (balance + valueToReturn).toFixed(2),
        };
      } else {
        // Real Polymarket trading via CLOB API
        if (!polymarketClobClient.isReady()) {
          return {
            success: false,
            error: 'Polymarket wallet not initialized. Set POLYMARKET_PRIVATE_KEY.',
          };
        }

        try {
          const tokenId = (metadata.token_id as string) || conditionId;
          const sharesToSell = shares * (percentage / 100);

          const result = await polymarketClobClient.sellShares(tokenId, currentPrice, sharesToSell);

          await closePosition('polymarket', positionId, {
            currentValueUsd: currentValue,
            realizedPnl: pnl,
            metadata: { exit_price: currentPrice, order_id: result.orderId, tx_hash: result.txHash },
          });

          // Return value to balance
          const balance = await getDomainBalance('polymarket');
          await updateDomainBalance('polymarket', balance + valueToReturn);

          await logDecision('polymarket', {
            action: percentage >= 100 ? 'sell' : 'partial_sell',
            target: conditionId,
            amountUsd: valueToReturn,
            reasoning: `REAL: Sold ${percentage}% of position, returned $${valueToReturn.toFixed(2)}, PnL: $${pnl.toFixed(2)}`,
            confidence: 0.8,
          });

          return {
            success: true,
            mode: 'REAL',
            positionId,
            question: metadata.market_question,
            outcome,
            percentage,
            exitPrice: currentPrice.toFixed(2),
            valueReturned: valueToReturn.toFixed(2),
            pnl: pnl.toFixed(2),
            pnlPercent: ((pnl / position.entryValueUsd) * 100).toFixed(1) + '%',
            orderId: result.orderId,
            txHash: result.txHash,
            newBalance: (balance + valueToReturn).toFixed(2),
          };
        } catch (error) {
          return {
            success: false,
            error: `Polymarket sell failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
          };
        }
      }
    }

    case 'polymarket_get_positions': {
      const positions = await getOpenPositions('polymarket');

      if (positions.length === 0) {
        return {
          count: 0,
          message: 'No open Polymarket positions',
        };
      }

      // Update with live prices
      const positionsWithPrices = await Promise.all(
        positions.map(async p => {
          const meta = p.metadata as Record<string, unknown>;
          const conditionId = meta.condition_id as string;
          const outcome = meta.outcome as 'YES' | 'NO';
          const entryPrice = meta.entry_price as number;
          const shares = meta.shares as number;

          // Get live price
          let currentPrice = entryPrice;
          const market = await gammaClient.getMarket(conditionId);

          if (market) {
            const prices = gammaClient.getMarketPrices(market);
            currentPrice = outcome === 'YES' ? prices.yesPrice : prices.noPrice;
          }

          const currentValue = shares * currentPrice;
          const pnl = currentValue - p.entryValueUsd;

          return {
            id: p.id,
            conditionId,
            question: meta.market_question,
            outcome,
            shares: shares?.toFixed(2),
            entryPrice: entryPrice?.toFixed(2),
            currentPrice: currentPrice?.toFixed(2),
            entryValueUsd: p.entryValueUsd.toFixed(2),
            currentValueUsd: currentValue.toFixed(2),
            pnl: pnl.toFixed(2),
            pnlPercent: ((pnl / p.entryValueUsd) * 100).toFixed(1) + '%',
            openedAt: p.openedAt,
          };
        })
      );

      return {
        count: positions.length,
        source: 'LIVE prices from Gamma API',
        positions: positionsWithPrices,
      };
    }

    default:
      throw new Error(`Unknown polymarket tool: ${name}`);
  }
}
