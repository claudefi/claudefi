# Custom Tools

This guide explains how to add custom tools to claudefi's MCP servers.

## Tool Structure

Every tool follows this interface:

```typescript
interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  handler: (args: unknown, runtime: DomainRuntime) => Promise<McpResult>;
}

interface McpResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}
```

## Adding a New Tool

### Step 1: Define the Tool

Create your tool with a clear description and typed schema:

```typescript
// src/subagents/mcp-servers/dlmm-server.ts

import { z } from 'zod';

const getPoolHistoryTool: McpTool = {
  name: 'get_pool_history',

  description: `
    Get historical data for a Meteora DLMM pool.
    Returns price, volume, and fees over the specified time period.
    Useful for analyzing trends before entering positions.
  `,

  inputSchema: z.object({
    pool_address: z.string().describe('The pool address'),
    period: z.enum(['1h', '24h', '7d', '30d']).default('24h').describe('Time period'),
    interval: z.enum(['5m', '1h', '4h', '1d']).default('1h').describe('Data interval'),
  }),

  handler: async (args, runtime) => {
    // Implementation
    const history = await runtime.meteoraClient.getPoolHistory(
      args.pool_address,
      args.period,
      args.interval
    );

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(history, null, 2),
      }],
    };
  },
};
```

### Step 2: Register the Tool

Add the tool to the server's tool list:

```typescript
// src/subagents/mcp-servers/dlmm-server.ts

export function createDlmmTools(runtime: DlmmRuntime): McpTool[] {
  return [
    fetchPoolsTool,
    getPoolDetailsTool,
    getPositionsTool,
    getBalanceTool,
    submitDecisionTool,
    getPoolHistoryTool,  // Add your new tool
  ];
}
```

### Step 3: Implement Client Method (if needed)

If your tool needs new API functionality:

```typescript
// src/clients/meteora/client.ts

export class MeteoraClient {
  // ... existing methods

  async getPoolHistory(
    poolAddress: string,
    period: '1h' | '24h' | '7d' | '30d',
    interval: '5m' | '1h' | '4h' | '1d'
  ): Promise<PoolHistory> {
    const response = await this.api.get(`/pools/${poolAddress}/history`, {
      params: { period, interval },
    });
    return response.data;
  }
}
```

## Best Practices

### Clear Descriptions

Write descriptions that help Claude understand when and how to use the tool:

```typescript
// Good - Clear and actionable
description: `
  Get historical price and volume data for a pool.
  Use this BEFORE entering a position to check:
  - Price trend direction
  - Volume consistency
  - Fee generation patterns
  Returns: Array of { time, price, volume, fees }
`,

// Bad - Vague
description: 'Gets pool history data',
```

### Typed Schemas

Use Zod's description feature to explain parameters:

```typescript
inputSchema: z.object({
  pool_address: z.string()
    .describe('The Meteora pool address (base58 encoded)'),

  period: z.enum(['1h', '24h', '7d', '30d'])
    .default('24h')
    .describe('Time period to fetch. Use 24h for recent trends, 7d for longer patterns'),

  include_fees: z.boolean()
    .default(true)
    .describe('Whether to include fee data in the response'),
}),
```

### Error Handling

Always handle errors gracefully:

```typescript
handler: async (args, runtime) => {
  try {
    const data = await runtime.client.getData(args);

    if (!data || data.length === 0) {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            error: 'No data available for this pool',
            suggestion: 'The pool may be too new or inactive',
          }),
        }],
      };
    }

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(data),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: JSON.stringify({
          error: error.message,
          suggestion: 'Check pool address and try again',
        }),
      }],
      isError: true,
    };
  }
},
```

### Consistent Output Format

Return structured data that's easy to parse:

```typescript
// Good - Structured and consistent
return {
  content: [{
    type: 'text',
    text: JSON.stringify({
      pool: poolAddress,
      period: period,
      data_points: history.length,
      history: history.map(h => ({
        time: h.timestamp,
        price: h.price,
        volume: h.volume,
        fees: h.fees,
      })),
      summary: {
        avg_price: average(history.map(h => h.price)),
        total_volume: sum(history.map(h => h.volume)),
        total_fees: sum(history.map(h => h.fees)),
      },
    }, null, 2),
  }],
};
```

## Example: Analytics Tool

Here's a complete example of a more complex analytics tool:

```typescript
const analyzePoolTool: McpTool = {
  name: 'analyze_pool',

  description: `
    Perform comprehensive analysis on a DLMM pool.
    Returns scoring and recommendations based on:
    - TVL stability
    - Volume trends
    - Fee consistency
    - Impermanent loss risk
    Use this when deciding whether to enter a pool.
  `,

  inputSchema: z.object({
    pool_address: z.string().describe('Pool to analyze'),
    position_size: z.number()
      .default(500)
      .describe('Intended position size in USD for IL calculations'),
  }),

  handler: async (args, runtime) => {
    try {
      // Fetch required data
      const [pool, history, positions] = await Promise.all([
        runtime.meteoraClient.getPool(args.pool_address),
        runtime.meteoraClient.getPoolHistory(args.pool_address, '7d', '1h'),
        runtime.db.getPositionsByPool(args.pool_address),
      ]);

      // Calculate metrics
      const analysis = {
        pool: {
          name: pool.name,
          address: pool.address,
        },

        scores: {
          tvl_stability: calculateTvlStability(history),
          volume_trend: calculateVolumeTrend(history),
          fee_consistency: calculateFeeConsistency(history),
          il_risk: calculateILRisk(pool, args.position_size),
        },

        overall_score: 0, // Calculated below

        recommendation: '',
        warnings: [] as string[],
      };

      // Calculate overall score
      analysis.overall_score =
        (analysis.scores.tvl_stability * 0.2) +
        (analysis.scores.volume_trend * 0.3) +
        (analysis.scores.fee_consistency * 0.3) +
        ((100 - analysis.scores.il_risk) * 0.2);

      // Generate recommendation
      if (analysis.overall_score >= 70) {
        analysis.recommendation = 'FAVORABLE - Good candidate for LP';
      } else if (analysis.overall_score >= 50) {
        analysis.recommendation = 'NEUTRAL - Proceed with caution';
      } else {
        analysis.recommendation = 'UNFAVORABLE - Consider other pools';
      }

      // Add warnings
      if (pool.tvl < 100000) {
        analysis.warnings.push('Low TVL - higher slippage risk');
      }
      if (analysis.scores.volume_trend < 30) {
        analysis.warnings.push('Declining volume trend');
      }

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(analysis, null, 2),
        }],
      };
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Analysis failed: ${error.message}`,
        }],
        isError: true,
      };
    }
  },
};
```

## Testing Tools

Test your tools before deploying:

```typescript
// tests/tools/dlmm-tools.test.ts

import { createDlmmTools } from '../../src/subagents/mcp-servers/dlmm-server';

describe('DLMM Tools', () => {
  const mockRuntime = createMockRuntime();

  it('analyze_pool returns valid analysis', async () => {
    const tools = createDlmmTools(mockRuntime);
    const analyzeTool = tools.find(t => t.name === 'analyze_pool');

    const result = await analyzeTool.handler({
      pool_address: 'test-pool-address',
      position_size: 500,
    }, mockRuntime);

    expect(result.isError).toBeFalsy();

    const data = JSON.parse(result.content[0].text);
    expect(data.scores).toBeDefined();
    expect(data.recommendation).toBeDefined();
  });
});
```

## Related Documentation

- [MCP Server Overview](./overview.md) - Architecture
- [Tool Reference](./tools.md) - Existing tools
- [Hooks System](../hooks/overview.md) - Tool interception
