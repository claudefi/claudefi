/**
 * Perps MCP Server
 *
 * Provides MCP tools for the Perps (Hyperliquid) perpetual futures subagent.
 * Each tool returns structured data for agent decision-making.
 */

import { z } from 'zod';
import { hyperliquidClient } from '../../clients/hyperliquid/client.js';
import {
  getOpenPositions,
  getDomainBalance,
  createPosition,
  closePosition,
  updateDomainBalance,
} from '../../db/index.js';
import type { PerpsDecision } from '../../types/index.js';

/**
 * Runtime context shared with the executor
 */
export interface PerpsRuntime {
  decision: PerpsDecision | null;
}

/**
 * MCP Tool definition
 */
interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  handler: (args: unknown, runtime: PerpsRuntime) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

/**
 * Decision schema for submit_decision tool
 */
const perpsDecisionSchema = z.object({
  action: z.enum(['open_long', 'open_short', 'close_position', 'partial_close', 'hold']),
  symbol: z.string().optional(),
  amount_usd: z.number().positive().optional(),
  percentage: z.number().min(1).max(100).optional(),
  leverage: z.number().min(1).max(10).optional(),
  position_id: z.string().optional(),
  reasoning: z.string().min(10),
  confidence: z.number().min(0).max(1),
});

/**
 * Simple RSI calculation
 */
function calculateRSI(prices: number[], period: number = 14): number {
  if (prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for (let i = prices.length - period; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses -= change;
  }

  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - (100 / (1 + rs));
}

/**
 * Simple EMA calculation
 */
function calculateEMA(prices: number[], period: number): number {
  if (prices.length < period) return prices[prices.length - 1];

  const multiplier = 2 / (period + 1);
  let ema = prices.slice(0, period).reduce((a, b) => a + b, 0) / period;

  for (let i = period; i < prices.length; i++) {
    ema = (prices[i] - ema) * multiplier + ema;
  }

  return ema;
}

/**
 * Create Perps MCP tools
 */
export function createPerpsTools(runtime: PerpsRuntime): McpTool[] {
  return [
    {
      name: 'fetch_markets',
      description: `Fetch perpetual futures markets from Hyperliquid.
Returns: symbol, price, funding rate, open interest, 24h volume, max leverage.
Also includes technical indicators: RSI (14), EMA (20), momentum signal.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
        sort_by: z.enum(['volume', 'funding', 'oi']).default('volume'),
      }),
      handler: async (args) => {
        const { limit, sort_by } = args as { limit: number; sort_by: string };

        const markets = await hyperliquidClient.getMarkets();

        // Sort markets
        let sorted = [...markets];
        if (sort_by === 'volume') {
          sorted.sort((a, b) => b.volume24h - a.volume24h);
        } else if (sort_by === 'funding') {
          sorted.sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));
        } else if (sort_by === 'oi') {
          sorted.sort((a, b) => b.openInterest - a.openInterest);
        }

        // Get top markets with indicators
        const topMarkets = sorted.slice(0, limit);
        const formatted = await Promise.all(
          topMarkets.map(async m => {
            // Fetch candles for technical analysis
            let rsi = 50;
            let ema20 = m.markPrice;
            let momentum = 'neutral';

            try {
              const candles = await hyperliquidClient.getCandles(m.symbol, '1h', 30);
              if (candles.length > 0) {
                const closes = candles.map(c => c.close);
                rsi = calculateRSI(closes);
                ema20 = calculateEMA(closes, 20);
                momentum = m.markPrice > ema20 ? 'bullish' : 'bearish';
              }
            } catch {
              // Use defaults if candle fetch fails
            }

            return {
              symbol: m.symbol,
              price: `$${m.markPrice.toLocaleString()}`,
              funding_rate: `${(m.fundingRate * 100).toFixed(4)}%`,
              funding_direction: m.fundingRate > 0 ? 'longs_pay' : 'shorts_pay',
              open_interest: `$${(m.openInterest / 1e6).toFixed(2)}M`,
              volume_24h: `$${(m.volume24h / 1e6).toFixed(2)}M`,
              max_leverage: `${m.maxLeverage}x`,
              // Technical indicators
              rsi: rsi.toFixed(1),
              rsi_signal: rsi < 30 ? 'oversold' : rsi > 70 ? 'overbought' : 'neutral',
              ema20: ema20.toFixed(2),
              momentum,
            };
          })
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              count: formatted.length,
              source: 'LIVE Hyperliquid API',
              markets: formatted,
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'get_positions',
      description: 'Get your open perpetual futures positions with current P&L.',
      inputSchema: z.object({}),
      handler: async () => {
        const positions = await getOpenPositions('perps');

        if (positions.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ count: 0, message: 'No open perps positions' }),
            }],
          };
        }

        // Get current prices for P&L calculation
        const allMids = await hyperliquidClient.getAllMids();

        const formatted = await Promise.all(
          positions.map(async p => {
            const meta = p.metadata as Record<string, unknown>;
            const symbol = meta.symbol as string;
            const side = meta.side as 'LONG' | 'SHORT';
            const entryPrice = meta.entry_price as number;
            const leverage = meta.leverage as number;

            const currentPrice = parseFloat(allMids[symbol] || '0') || entryPrice;
            const pnl = hyperliquidClient.calculatePnl(side, p.entryValueUsd, entryPrice, currentPrice);
            const pnlPercent = (pnl / p.entryValueUsd) * 100;

            const liqPrice = hyperliquidClient.calculateLiquidationPrice(entryPrice, side, leverage);

            return {
              id: p.id,
              symbol,
              side,
              entry_price: `$${entryPrice.toLocaleString()}`,
              current_price: `$${currentPrice.toLocaleString()}`,
              size_usd: `$${p.entryValueUsd.toFixed(2)}`,
              leverage: `${leverage}x`,
              pnl: `$${pnl.toFixed(2)}`,
              pnl_percent: `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(2)}%`,
              liquidation_price: `$${liqPrice.toFixed(2)}`,
              opened_at: p.openedAt,
            };
          })
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({ count: positions.length, positions: formatted }, null, 2),
          }],
        };
      },
    },
    {
      name: 'get_balance',
      description: 'Get your available balance for perps trading.',
      inputSchema: z.object({}),
      handler: async () => {
        const balance = await getDomainBalance('perps');
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              balance_usd: balance,
              formatted: `$${balance.toFixed(2)}`,
              max_margin: `$${(balance * 0.2).toFixed(2)} (20% of balance)`,
              note: 'This is margin. With 5x leverage, max position = 5x margin',
            }),
          }],
        };
      },
    },
    {
      name: 'get_market_details',
      description: 'Get detailed information about a specific market including technical analysis.',
      inputSchema: z.object({
        symbol: z.string(),
      }),
      handler: async (args) => {
        const { symbol } = args as { symbol: string };

        const markets = await hyperliquidClient.getMarkets();
        const market = markets.find(m => m.symbol.toLowerCase() === symbol.toLowerCase());

        if (!market) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Market ${symbol} not found` }),
            }],
          };
        }

        // Get candles for detailed analysis
        const candles = await hyperliquidClient.getCandles(market.symbol, '1h', 50);
        const closes = candles.map(c => c.close);

        const rsi = calculateRSI(closes);
        const ema20 = calculateEMA(closes, 20);
        const ema50 = calculateEMA(closes, 50);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              symbol: market.symbol,
              price: `$${market.markPrice.toLocaleString()}`,
              funding_rate: `${(market.fundingRate * 100).toFixed(4)}%`,
              open_interest: `$${(market.openInterest / 1e6).toFixed(2)}M`,
              volume_24h: `$${(market.volume24h / 1e6).toFixed(2)}M`,
              max_leverage: `${market.maxLeverage}x`,
              technical: {
                rsi: rsi.toFixed(1),
                rsi_signal: rsi < 30 ? 'OVERSOLD - potential long' : rsi > 70 ? 'OVERBOUGHT - potential short' : 'neutral',
                ema20: ema20.toFixed(2),
                ema50: ema50.toFixed(2),
                trend: ema20 > ema50 ? 'BULLISH (EMA20 > EMA50)' : 'BEARISH (EMA20 < EMA50)',
                momentum: market.markPrice > ema20 ? 'positive' : 'negative',
              },
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'submit_decision',
      description: `Submit your trading decision. You MUST use this tool to finalize your decision.

Actions:
- open_long: Open a leveraged long position
- open_short: Open a leveraged short position
- close_position: Close an entire position
- partial_close: Close a percentage of a position
- hold: Wait and observe (no action)

Required fields:
- reasoning: Explain your decision including technical analysis (min 10 chars)
- confidence: Your confidence level (0.0-1.0)

For open_long/open_short:
- symbol: The market to trade (e.g., BTC, ETH, SOL)
- amount_usd: Margin amount (position size = margin * leverage)
- leverage: 1-10x (recommend 3-5x)

For close_position/partial_close:
- position_id: The position ID from your current "Open Positions" context (use the 'id' field, not 'target')
- percentage: (for partial_close) What % to close

IMPORTANT: Only close positions that exist in your current context. Do not attempt to close positions from previous sessions.`,
      inputSchema: perpsDecisionSchema,
      handler: async (args) => {
        const decision = args as z.infer<typeof perpsDecisionSchema>;

        // For close actions, use position_id as target for proper idempotency and position matching
        const target = (decision.action === 'close_position' || decision.action === 'partial_close')
          ? decision.position_id
          : decision.symbol;

        runtime.decision = {
          domain: 'perps',
          action: decision.action,
          target,
          amountUsd: decision.amount_usd,
          percentage: decision.percentage,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
          metadata: {
            symbol: decision.symbol,
            leverage: decision.leverage,
            positionId: decision.position_id,
          },
        };

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              status: 'decision_recorded',
              action: decision.action,
              confidence: decision.confidence,
              message: 'Decision submitted. Hooks will validate before execution.',
            }),
          }],
        };
      },
    },
  ];
}

/**
 * Execute a tool by name
 */
export async function executePerpsTools(
  toolName: string,
  args: unknown,
  runtime: PerpsRuntime
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tools = createPerpsTools(runtime);
  const tool = tools.find(t => t.name === toolName);

  if (!tool) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({ error: `Unknown tool: ${toolName}` }),
      }],
    };
  }

  try {
    const validated = tool.inputSchema.parse(args);
    return await tool.handler(validated, runtime);
  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          error: error instanceof Error ? error.message : 'Tool execution failed',
        }),
      }],
    };
  }
}

/**
 * Get tool definitions for MCP server registration
 */
export function getPerpsToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}> {
  const tools = createPerpsTools({ decision: null });

  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object' as const,
      properties: {},
      required: [],
    },
  }));
}
