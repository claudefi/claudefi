/**
 * Polymarket MCP Server
 *
 * Provides MCP tools for the Polymarket prediction market subagent.
 * Each tool returns structured data for agent decision-making.
 */

import { z } from 'zod';
import { gammaClient } from '../../clients/polymarket/client.js';
import {
  getOpenPositions,
  getDomainBalance,
  createPosition,
  closePosition,
  updateDomainBalance,
} from '../../db/index.js';
import type { PolymarketDecision } from '../../types/index.js';

/**
 * Runtime context shared with the executor
 */
export interface PolymarketRuntime {
  decision: PolymarketDecision | null;
}

/**
 * MCP Tool definition
 */
interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  handler: (args: unknown, runtime: PolymarketRuntime) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

/**
 * Decision schema for submit_decision tool
 */
const polymarketDecisionSchema = z.object({
  action: z.enum(['buy_yes', 'buy_no', 'sell', 'partial_sell', 'hold']),
  condition_id: z.string().optional(),
  amount_usd: z.number().positive().optional(),
  percentage: z.number().min(1).max(100).optional(),
  position_id: z.string().optional(),
  estimated_probability: z.number().min(0).max(100).optional(),
  reasoning: z.string().min(10),
  confidence: z.number().min(0).max(1),
});

/**
 * Create Polymarket MCP tools
 */
export function createPolymarketTools(runtime: PolymarketRuntime): McpTool[] {
  return [
    {
      name: 'fetch_markets',
      description: `Fetch trending prediction markets from Polymarket.
Returns: question, yes/no prices, volume, liquidity, end date, days until close.
Also calculates potential edge if you have a probability estimate.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
        category: z.string().optional(),
        ending_soon: z.boolean().default(false),
      }),
      handler: async (args) => {
        const { limit, category, ending_soon } = args as {
          limit: number;
          category?: string;
          ending_soon: boolean;
        };

        let markets;
        if (ending_soon) {
          markets = await gammaClient.getMarketsEndingSoon(72, limit);
        } else if (category) {
          markets = await gammaClient.getMarketsByCategory(category, limit);
        } else {
          markets = await gammaClient.getTrendingMarkets(limit);
        }

        const formatted = markets.map(m => {
          const prices = gammaClient.getMarketPrices(m);
          const volume = (m.volume24hrClob || 0) + (m.volume24hrAmm || 0);
          const daysToClose = gammaClient.getDaysToClose(m);

          return {
            condition_id: m.condition_id,
            question: m.question.slice(0, 100) + (m.question.length > 100 ? '...' : ''),
            yes_price: `$${prices.yesPrice.toFixed(2)}`,
            no_price: `$${prices.noPrice.toFixed(2)}`,
            implied_yes_prob: `${(prices.yesPrice * 100).toFixed(1)}%`,
            volume_24h: `$${volume.toLocaleString()}`,
            liquidity: `$${(m.liquidity || 0).toLocaleString()}`,
            days_to_close: daysToClose.toFixed(1),
            category: m.category || 'general',
          };
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              count: formatted.length,
              source: 'LIVE Polymarket API',
              markets: formatted,
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'get_positions',
      description: 'Get your open Polymarket positions with current values.',
      inputSchema: z.object({}),
      handler: async () => {
        const positions = await getOpenPositions('polymarket');

        if (positions.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ count: 0, message: 'No open Polymarket positions' }),
            }],
          };
        }

        const formatted = await Promise.all(
          positions.map(async p => {
            const meta = p.metadata as Record<string, unknown>;
            // Support both old (conditionId) and new (condition_id) field names
            const conditionId = (meta.condition_id || meta.conditionId) as string;
            const outcome = (meta.outcome || 'YES') as 'YES' | 'NO';
            const shares = (meta.shares || 1) as number;
            const entryPrice = (meta.entry_price || meta.entryPrice || 0.5) as number;
            const estimatedProbability = meta.estimatedProbability as number | undefined;

            // Get current market price
            let currentPrice = entryPrice;
            // Note: conditionId might be question text, not API ID - skip API call if it looks like text
            const isApiId = conditionId && conditionId.startsWith('0x');
            if (isApiId) {
              try {
                const market = await gammaClient.getMarket(conditionId);
                if (market) {
                  const prices = gammaClient.getMarketPrices(market);
                  currentPrice = outcome === 'YES' ? prices.yesPrice : prices.noPrice;
                }
              } catch {
                // Use entry price if fetch fails
              }
            }

            const currentValue = shares * currentPrice;
            const pnl = currentValue - p.entryValueUsd;
            const pnlPercent = (pnl / p.entryValueUsd) * 100;

            // Use conditionId as question if it's not an API ID (i.e., it's question text)
            const questionText = isApiId
              ? ((meta.question as string) || 'Unknown market')
              : (conditionId || 'Unknown market');

            return {
              id: p.id,
              question: questionText.length > 50 ? questionText.slice(0, 50) + '...' : questionText,
              outcome,
              shares: shares.toFixed(2),
              entry_price: `$${entryPrice.toFixed(2)}`,
              current_price: `$${currentPrice.toFixed(2)}`,
              entry_value: `$${p.entryValueUsd.toFixed(2)}`,
              current_value: `$${currentValue.toFixed(2)}`,
              pnl: `$${pnl.toFixed(2)}`,
              pnl_percent: `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`,
              estimated_probability: estimatedProbability ? `${estimatedProbability}%` : undefined,
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
      description: 'Get your available balance for Polymarket trading.',
      inputSchema: z.object({}),
      handler: async () => {
        const balance = await getDomainBalance('polymarket');
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              balance_usd: balance,
              formatted: `$${balance.toFixed(2)}`,
              max_position_size: `$${(balance * 0.2).toFixed(2)} (20% of balance)`,
            }),
          }],
        };
      },
    },
    {
      name: 'get_market_details',
      description: 'Get detailed information about a specific market.',
      inputSchema: z.object({
        condition_id: z.string(),
      }),
      handler: async (args) => {
        const { condition_id } = args as { condition_id: string };

        const market = await gammaClient.getMarket(condition_id);

        if (!market) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Market ${condition_id} not found` }),
            }],
          };
        }

        const prices = gammaClient.getMarketPrices(market);
        const volume = (market.volume24hrClob || 0) + (market.volume24hrAmm || 0);
        const daysToClose = gammaClient.getDaysToClose(market);

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              condition_id: market.condition_id,
              question: market.question,
              description: market.description?.slice(0, 200),
              category: market.category,
              yes_price: `$${prices.yesPrice.toFixed(2)}`,
              no_price: `$${prices.noPrice.toFixed(2)}`,
              implied_yes_probability: `${(prices.yesPrice * 100).toFixed(1)}%`,
              volume_24h: `$${volume.toLocaleString()}`,
              liquidity: `$${(market.liquidity || 0).toLocaleString()}`,
              end_date: market.endDate,
              days_to_close: daysToClose.toFixed(1),
              status: market.closed ? 'closed' : market.active ? 'active' : 'inactive',
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'calculate_edge',
      description: `Calculate your edge on a market given your probability estimate.
Returns expected value, Kelly bet size, and recommendation.`,
      inputSchema: z.object({
        condition_id: z.string(),
        your_yes_probability: z.number().min(0).max(100),
      }),
      handler: async (args) => {
        const { condition_id, your_yes_probability } = args as {
          condition_id: string;
          your_yes_probability: number;
        };

        const market = await gammaClient.getMarket(condition_id);
        if (!market) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Market ${condition_id} not found` }),
            }],
          };
        }

        const prices = gammaClient.getMarketPrices(market);
        const marketYesProb = prices.yesPrice * 100;

        const yesEdge = your_yes_probability - marketYesProb;
        const noEdge = (100 - your_yes_probability) - (prices.noPrice * 100);

        const balance = await getDomainBalance('polymarket');
        const betOnYes = yesEdge > 0;
        const relevantEdge = betOnYes ? yesEdge : noEdge;
        const relevantPrice = betOnYes ? prices.yesPrice : prices.noPrice;

        const kellyBet = gammaClient.calculateKellyBet(
          betOnYes ? your_yes_probability : (100 - your_yes_probability),
          relevantPrice,
          balance
        );

        const ev = gammaClient.calculateExpectedValue(
          betOnYes ? your_yes_probability : (100 - your_yes_probability),
          relevantPrice,
          100 // Per $100 bet
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              market: market.question.slice(0, 80),
              your_yes_probability: `${your_yes_probability}%`,
              market_yes_probability: `${marketYesProb.toFixed(1)}%`,
              edge: {
                on_yes: `${yesEdge >= 0 ? '+' : ''}${yesEdge.toFixed(1)}%`,
                on_no: `${noEdge >= 0 ? '+' : ''}${noEdge.toFixed(1)}%`,
              },
              recommendation: {
                action: relevantEdge > 10 ? (betOnYes ? 'BUY YES' : 'BUY NO') : 'WAIT',
                reason: relevantEdge > 10
                  ? `${relevantEdge.toFixed(1)}% edge detected`
                  : `Edge (${relevantEdge.toFixed(1)}%) below 10% threshold`,
                kelly_bet_size: `$${kellyBet.toFixed(2)}`,
                expected_value_per_100: `$${ev.toFixed(2)}`,
              },
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'search_markets',
      description: 'Search for markets by keyword.',
      inputSchema: z.object({
        query: z.string(),
        limit: z.number().int().min(1).max(20).default(10),
      }),
      handler: async (args) => {
        const { query, limit } = args as { query: string; limit: number };

        const markets = await gammaClient.searchMarkets(query, limit);

        const formatted = markets.map(m => {
          const prices = gammaClient.getMarketPrices(m);
          return {
            condition_id: m.condition_id,
            question: m.question.slice(0, 80),
            yes_price: `$${prices.yesPrice.toFixed(2)}`,
            category: m.category,
          };
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              query,
              count: formatted.length,
              markets: formatted,
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'submit_decision',
      description: `Submit your trading decision. You MUST use this tool to finalize your decision.

Actions:
- buy_yes: Buy YES shares (betting event happens)
- buy_no: Buy NO shares (betting event doesn't happen)
- sell: Sell all shares of a position
- partial_sell: Sell a percentage of shares
- hold: Wait and observe (no action)

Required fields:
- reasoning: Explain your probability estimate and edge (min 10 chars)
- confidence: Your confidence level (0.0-1.0)

For buy_yes/buy_no:
- condition_id: The market to trade
- amount_usd: How much to spend
- estimated_probability: Your probability estimate (0-100%)

For sell/partial_sell:
- position_id: The position to sell
- percentage: (for partial_sell) What % to sell`,
      inputSchema: polymarketDecisionSchema,
      handler: async (args) => {
        const decision = args as z.infer<typeof polymarketDecisionSchema>;

        // For sell actions, use position_id as target for proper idempotency and position matching
        const target = (decision.action === 'sell' || decision.action === 'partial_sell')
          ? decision.position_id
          : decision.condition_id;

        runtime.decision = {
          domain: 'polymarket',
          action: decision.action,
          target,
          amountUsd: decision.amount_usd,
          percentage: decision.percentage,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
          metadata: {
            conditionId: decision.condition_id,
            estimatedProbability: decision.estimated_probability,
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
export async function executePolymarketTool(
  toolName: string,
  args: unknown,
  runtime: PolymarketRuntime
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tools = createPolymarketTools(runtime);
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
