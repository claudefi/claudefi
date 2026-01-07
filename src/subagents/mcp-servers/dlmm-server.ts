/**
 * DLMM MCP Server
 *
 * Provides MCP tools for the DLMM (Meteora) liquidity provision subagent.
 * Each tool returns structured data for agent decision-making.
 */

import { z } from 'zod';
import { meteoraClient, type MeteoraPool } from '../../clients/meteora/client.js';
import {
  getOpenPositions,
  getDomainBalance,
  createPosition,
  closePosition,
  updateDomainBalance,
} from '../../db/index.js';
import type { AgentDecision, DLMMDecision } from '../../types/index.js';

/**
 * Runtime context shared with the executor
 */
export interface DlmmRuntime {
  decision: DLMMDecision | null;
}

/**
 * MCP Tool definition
 */
interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  handler: (args: unknown, runtime: DlmmRuntime) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

/**
 * Decision schema for submit_decision tool
 */
const dlmmDecisionSchema = z.object({
  action: z.enum(['add_liquidity', 'remove_liquidity', 'partial_remove', 'hold']),
  pool_address: z.string().optional(),
  amount_usd: z.number().positive().optional(),
  percentage: z.number().min(1).max(100).optional(),
  strategy: z.enum(['spot', 'curve', 'bid-ask']).optional(),
  position_id: z.string().optional(),
  reasoning: z.string().min(10),
  confidence: z.number().min(0).max(1),
});

/**
 * Create DLMM MCP tools
 */
export function createDlmmTools(runtime: DlmmRuntime): McpTool[] {
  return [
    {
      name: 'fetch_pools',
      description: `Fetch top Meteora DLMM pools sorted by fees.
Returns: address, name, TVL, 24h fees, 24h volume, APR, current price, bin step.
Use this to discover profitable pools for liquidity provision.`,
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
        min_tvl: z.number().default(50000),
      }),
      handler: async (args) => {
        const { limit, min_tvl } = args as { limit: number; min_tvl: number };

        const pools = await meteoraClient.getTopPools(limit * 2);
        const filtered = pools
          .filter(p => parseFloat(p.liquidity) >= min_tvl)
          .slice(0, limit);

        const formatted = filtered.map(p => ({
          address: p.address,
          name: p.name,
          tvl: `$${parseFloat(p.liquidity).toLocaleString()}`,
          fees_24h: `$${p.fees_24h.toLocaleString()}`,
          volume_24h: `$${p.trade_volume_24h.toLocaleString()}`,
          apr: `${meteoraClient.calculateApr(p).toFixed(1)}%`,
          price: p.current_price,
          bin_step: p.bin_step,
          // Calculated scores
          fee_tvl_ratio: (p.fees_24h / parseFloat(p.liquidity) * 100).toFixed(3),
        }));

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              count: formatted.length,
              source: 'LIVE Meteora API',
              pools: formatted,
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'get_positions',
      description: 'Get your open DLMM liquidity positions with current values.',
      inputSchema: z.object({}),
      handler: async () => {
        const positions = await getOpenPositions('dlmm');

        if (positions.length === 0) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ count: 0, message: 'No open DLMM positions' }),
            }],
          };
        }

        const formatted = positions.map(p => ({
          id: p.id,
          pool: p.target,
          entry_value: `$${p.entryValueUsd.toFixed(2)}`,
          current_value: `$${p.currentValueUsd.toFixed(2)}`,
          pnl: `$${(p.currentValueUsd - p.entryValueUsd).toFixed(2)}`,
          pnl_percent: `${((p.currentValueUsd - p.entryValueUsd) / p.entryValueUsd * 100).toFixed(1)}%`,
          opened_at: p.openedAt,
          metadata: p.metadata,
        }));

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
      description: 'Get your available balance for DLMM operations.',
      inputSchema: z.object({}),
      handler: async () => {
        const balance = await getDomainBalance('dlmm');
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
      name: 'get_pool_details',
      description: 'Get detailed information about a specific pool by address.',
      inputSchema: z.object({
        pool_address: z.string(),
      }),
      handler: async (args) => {
        const { pool_address } = args as { pool_address: string };
        const pool = await meteoraClient.getPool(pool_address);

        if (!pool) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({ error: `Pool ${pool_address} not found` }),
            }],
          };
        }

        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              address: pool.address,
              name: pool.name,
              tvl: `$${parseFloat(pool.liquidity).toLocaleString()}`,
              fees_24h: `$${pool.fees_24h.toLocaleString()}`,
              volume_24h: `$${pool.trade_volume_24h.toLocaleString()}`,
              apr: `${meteoraClient.calculateApr(pool).toFixed(1)}%`,
              price: pool.current_price,
              bin_step: pool.bin_step,
              base_fee: pool.base_fee_percentage,
              max_fee: pool.max_fee_percentage,
            }, null, 2),
          }],
        };
      },
    },
    {
      name: 'submit_decision',
      description: `Submit your trading decision. You MUST use this tool to finalize your decision.

Actions:
- add_liquidity: Open a new position in a pool
- remove_liquidity: Close an entire position
- partial_remove: Remove a percentage of a position
- hold: Wait and observe (no action)

Required fields:
- reasoning: Explain your decision (min 10 chars)
- confidence: Your confidence level (0.0-1.0)

For add_liquidity:
- pool_address: The pool to add liquidity to
- amount_usd: How much to add
- strategy: 'spot' (tight range), 'curve' (bell curve), or 'bid-ask' (wide range)

For remove_liquidity/partial_remove:
- position_id: The position to remove from
- percentage: (for partial_remove) What % to remove`,
      inputSchema: dlmmDecisionSchema,
      handler: async (args) => {
        const decision = args as z.infer<typeof dlmmDecisionSchema>;

        // Store in runtime for executor to pick up
        runtime.decision = {
          domain: 'dlmm',
          action: decision.action,
          target: decision.pool_address,
          amountUsd: decision.amount_usd,
          percentage: decision.percentage,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
          metadata: {
            poolAddress: decision.pool_address,
            strategy: decision.strategy,
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
export async function executeDlmmTool(
  toolName: string,
  args: unknown,
  runtime: DlmmRuntime
): Promise<{ content: Array<{ type: 'text'; text: string }> }> {
  const tools = createDlmmTools(runtime);
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
export function getDlmmToolDefinitions(): Array<{
  name: string;
  description: string;
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] };
}> {
  const tools = createDlmmTools({ decision: null });

  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    inputSchema: {
      type: 'object' as const,
      properties: zodToJsonSchema(tool.inputSchema),
      required: getRequiredFields(tool.inputSchema),
    },
  }));
}

// Helper to convert Zod schema to JSON schema (simplified)
function zodToJsonSchema(schema: z.ZodType<unknown>): Record<string, unknown> {
  // This is a simplified conversion - in production use zod-to-json-schema
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape;
    const props: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(shape)) {
      props[key] = zodTypeToJson(value as z.ZodType<unknown>);
    }
    return props;
  }
  return {};
}

function zodTypeToJson(schema: z.ZodType<unknown>): unknown {
  if (schema instanceof z.ZodString) return { type: 'string' };
  if (schema instanceof z.ZodNumber) return { type: 'number' };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean' };
  if (schema instanceof z.ZodEnum) return { type: 'string', enum: schema.options };
  if (schema instanceof z.ZodOptional) return zodTypeToJson(schema.unwrap());
  if (schema instanceof z.ZodDefault) return zodTypeToJson(schema._def.innerType);
  return { type: 'string' };
}

function getRequiredFields(schema: z.ZodType<unknown>): string[] {
  if (schema instanceof z.ZodObject) {
    const required: string[] = [];
    for (const [key, value] of Object.entries(schema.shape)) {
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }
    return required;
  }
  return [];
}
