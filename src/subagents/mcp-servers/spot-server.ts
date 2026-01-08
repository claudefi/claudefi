/**
 * Spot MCP Server
 *
 * Provides MCP tools for the Spot (memecoin/token) trading subagent.
 * Uses GeckoTerminal for discovery and Jupiter for swaps.
 */

import { z } from 'zod';
import { geckoTerminalClient } from '../../clients/geckoterminal/client.js';
import { jupiterClient, TOKENS } from '../../clients/jupiter/client.js';
import {
  getOpenPositions,
  getDomainBalance,
  createPosition,
  closePosition,
  updateDomainBalance,
} from '../../db/index.js';
import type { SpotDecision } from '../../types/index.js';

/**
 * Runtime context shared with the executor
 */
export interface SpotRuntime {
  decision: SpotDecision | null;
}

/**
 * MCP Tool definition
 */
interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  handler: (args: unknown, runtime: SpotRuntime) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

/**
 * Decision schema for submit_decision tool
 */
const spotDecisionSchema = z.object({
  action: z.enum(['buy', 'sell', 'partial_sell', 'hold']),
  mint: z.string().optional(),
  symbol: z.string().optional(),
  amount_usd: z.number().positive().optional(),
  percentage: z.number().min(1).max(100).optional(),
  position_id: z.string().optional(),
  reasoning: z.string().min(10),
  confidence: z.number().min(0).max(1),
});

/**
 * Create Spot MCP tools
 */
export function createSpotTools(runtime: SpotRuntime): McpTool[] {
  return [
    {
      name: 'fetch_tokens',
      description: `Fetch trending tokens/memecoins from GeckoTerminal.
Returns: symbol, name, price, 24h change, volume, liquidity, buy/sell ratio, score.
Higher score = more attractive for trading.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
        min_liquidity: z.number().default(50000),
        high_momentum: z.boolean().default(false),
      }),
      handler: async (args) => {
        const { limit, min_liquidity, high_momentum } = args as {
          limit: number;
          min_liquidity: number;
          high_momentum: boolean;
        };

        let tokens;
        if (high_momentum) {
          tokens = await geckoTerminalClient.getHighMomentumTokens(20, limit * 2);
        } else {
          tokens = await geckoTerminalClient.getTrendingPools(limit * 2);
        }

        const filtered = tokens
          .filter(t => t.liquidity >= min_liquidity)
          .slice(0, limit);

        const formatted = filtered.map(t => {
          const score = geckoTerminalClient.calculateTokenScore(t);
          const buySellRatio = t.buys24h && t.sells24h
            ? ((t.buys24h / (t.buys24h + t.sells24h)) * 100).toFixed(0)
            : 'N/A';

          return {
            symbol: t.symbol,
            name: t.name,
            mint: t.address,
            price: `$${t.priceUsd.toFixed(8)}`,
            change_24h: `${t.priceChange24h >= 0 ? '+' : ''}${t.priceChange24h.toFixed(2)}%`,
            volume_24h: `$${t.volume24h.toLocaleString()}`,
            liquidity: `$${t.liquidity.toLocaleString()}`,
            buy_sell_ratio: `${buySellRatio}%`,
            fdv: `$${(t.fdv / 1e6).toFixed(2)}M`,
            score: `${score}/100`,
          };
        });

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              count: formatted.length,
              source: 'LIVE GeckoTerminal API',
              tokens: formatted,
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'get_positions',
      description: 'Get your open spot token positions with current values.',
      inputSchema: z.object({}),
      handler: async () => {
        const positions = await getOpenPositions('spot');

        if (positions.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ count: 0, message: 'No open spot positions' }),
            }],
          };
        }

        const formatted = await Promise.all(
          positions.map(async p => {
            const meta = p.metadata as Record<string, unknown>;
            // Support both old (mint/symbol) and new (token_mint/token_symbol) field names
            const mint = (meta.token_mint || meta.mint) as string | undefined;
            const symbol = (meta.token_symbol || meta.symbol || 'UNKNOWN') as string;
            const tokenAmount = (meta.amount || meta.tokenAmount || 1) as number;
            const entryPrice = (meta.entry_price || meta.entryPrice || 0) as number;

            // Get current price - only if we have a valid mint address
            let currentPrice = entryPrice;
            if (mint && mint.length > 30) {  // Solana mints are ~44 chars
              try {
                const price = await jupiterClient.getPrice(mint);
                if (price > 0) currentPrice = price;
              } catch {
                // Use entry price if fetch fails
              }
            }

            const currentValue = tokenAmount * currentPrice;
            const pnl = currentValue - p.entryValueUsd;
            const pnlPercent = p.entryValueUsd > 0 ? (pnl / p.entryValueUsd) * 100 : 0;

            return {
              id: p.id,
              symbol,
              mint: mint ? mint.slice(0, 8) + '...' : 'unknown',
              amount: tokenAmount.toFixed(4),
              entry_price: `$${entryPrice.toFixed(8)}`,
              current_price: `$${currentPrice.toFixed(8)}`,
              entry_value: `$${p.entryValueUsd.toFixed(2)}`,
              current_value: `$${currentValue.toFixed(2)}`,
              pnl: `$${pnl.toFixed(2)}`,
              pnl_percent: `${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%`,
              opened_at: p.openedAt,
            };
          })
        );

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              count: positions.length,
              source: 'LIVE Jupiter prices',
              positions: formatted,
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'get_balance',
      description: 'Get your available balance for spot trading.',
      inputSchema: z.object({}),
      handler: async () => {
        const balance = await getDomainBalance('spot');
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
      name: 'search_token',
      description: 'Search for a specific token by name or symbol.',
      inputSchema: z.object({
        query: z.string(),
      }),
      handler: async (args) => {
        const { query } = args as { query: string };

        const tokens = await geckoTerminalClient.searchTokens(query);

        if (tokens.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                query,
                count: 0,
                message: `No tokens found matching "${query}"`,
              }),
            }],
          };
        }

        const formatted = tokens.slice(0, 10).map(t => ({
          symbol: t.symbol,
          name: t.name,
          mint: t.address,
          price: `$${t.priceUsd.toFixed(8)}`,
          liquidity: `$${t.liquidity.toLocaleString()}`,
          volume_24h: `$${t.volume24h.toLocaleString()}`,
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              query,
              count: formatted.length,
              tokens: formatted,
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'get_token_details',
      description: 'Get detailed information about a specific token by mint address.',
      inputSchema: z.object({
        mint: z.string(),
      }),
      handler: async (args) => {
        const { mint } = args as { mint: string };

        const tokenInfo = await geckoTerminalClient.getToken(mint);
        const jupiterPrice = await jupiterClient.getPrice(mint);

        if (!tokenInfo && jupiterPrice <= 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Token ${mint} not found` }),
            }],
          };
        }

        const score = tokenInfo ? geckoTerminalClient.calculateTokenScore(tokenInfo) : 'N/A';

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              mint,
              symbol: tokenInfo?.symbol || 'UNKNOWN',
              name: tokenInfo?.name || 'Unknown Token',
              price_geckoterminal: tokenInfo ? `$${tokenInfo.priceUsd.toFixed(8)}` : 'N/A',
              price_jupiter: jupiterPrice > 0 ? `$${jupiterPrice.toFixed(8)}` : 'N/A',
              change_24h: tokenInfo ? `${tokenInfo.priceChange24h.toFixed(2)}%` : 'N/A',
              volume_24h: tokenInfo ? `$${tokenInfo.volume24h.toLocaleString()}` : 'N/A',
              liquidity: tokenInfo ? `$${tokenInfo.liquidity.toLocaleString()}` : 'N/A',
              fdv: tokenInfo ? `$${(tokenInfo.fdv / 1e6).toFixed(2)}M` : 'N/A',
              score: typeof score === 'number' ? `${score}/100` : score,
              tradeable_on_jupiter: jupiterPrice > 0,
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'simulate_swap',
      description: 'Simulate a token swap to check price impact and output.',
      inputSchema: z.object({
        mint: z.string(),
        amount_usd: z.number().positive(),
        direction: z.enum(['buy', 'sell']).default('buy'),
      }),
      handler: async (args) => {
        const { mint, amount_usd, direction } = args as {
          mint: string;
          amount_usd: number;
          direction: 'buy' | 'sell';
        };

        const inputMint = direction === 'buy' ? TOKENS.USDC : mint;
        const outputMint = direction === 'buy' ? mint : TOKENS.USDC;

        const simulation = await jupiterClient.simulateSwap({
          inputMint,
          outputMint,
          amountUsd: amount_usd,
          slippageBps: 100, // 1%
        });

        if (!simulation) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                error: 'Failed to simulate swap. Token may have insufficient liquidity.',
              }),
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              direction,
              input_amount: `$${amount_usd.toFixed(2)}`,
              output_amount: `$${simulation.outputAmountUsd.toFixed(2)}`,
              price_impact: `${(simulation.priceImpact * 100).toFixed(2)}%`,
              warning: simulation.priceImpact > 0.02 ? 'HIGH PRICE IMPACT - consider smaller size' : null,
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'submit_decision',
      description: `Submit your trading decision. You MUST use this tool to finalize your decision.

Actions:
- buy: Buy a token using USDC
- sell: Sell all of a token position
- partial_sell: Sell a percentage of a position
- hold: Wait and observe (no action)

Required fields:
- reasoning: Explain your thesis and exit strategy (min 10 chars)
- confidence: Your confidence level (0.0-1.0)

For buy:
- mint: The token mint address to buy
- symbol: The token symbol (for reference)
- amount_usd: How much to spend

For sell/partial_sell:
- position_id: The position to sell
- percentage: (for partial_sell) What % to sell`,
      inputSchema: spotDecisionSchema,
      handler: async (args) => {
        const decision = args as z.infer<typeof spotDecisionSchema>;

        // For sell actions, use position_id as target for proper idempotency and position matching
        const target = (decision.action === 'sell' || decision.action === 'partial_sell')
          ? decision.position_id
          : (decision.mint || decision.symbol);

        runtime.decision = {
          domain: 'spot',
          action: decision.action,
          target,
          amountUsd: decision.amount_usd,
          percentage: decision.percentage,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
          metadata: {
            symbol: decision.symbol,
            mint: decision.mint,
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
export async function executeSpotTool(
  toolName: string,
  args: unknown,
  runtime: SpotRuntime
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tools = createSpotTools(runtime);
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
