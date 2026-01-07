# MCP Server Overview

claudefi uses the Model Context Protocol (MCP) to expose domain-specific tools to Claude, enabling multi-turn conversations with tool use.

## What is MCP?

MCP (Model Context Protocol) is a standard for connecting AI models to external tools and data sources. In claudefi:

- Each domain has its own MCP server
- Servers expose tools Claude can call
- Tools connect to live APIs and databases
- Results feed back into Claude's reasoning

## Architecture

```
+-------------------+     +-------------------+     +-------------------+
|   Claude Agent    |     |    MCP Server     |     |      Client       |
|   (Subagent)      |<--->|    (Tools)        |<--->|      (API)        |
+-------------------+     +-------------------+     +-------------------+
        |                         |                         |
        |   1. Claude requests    |                         |
        |      tool use           |                         |
        |------------------------>|                         |
        |                         |   2. Server calls       |
        |                         |      client method      |
        |                         |------------------------>|
        |                         |                         |
        |                         |   3. Client returns     |
        |                         |      API data           |
        |                         |<------------------------|
        |                         |                         |
        |   4. Server formats     |                         |
        |      and returns        |                         |
        |<------------------------|                         |
        |                         |                         |
        |   5. Claude continues   |                         |
        |      reasoning          |                         |
+-------------------+     +-------------------+     +-------------------+
```

## MCP Servers

Each domain has a dedicated server:

| Server | File | Domain |
|--------|------|--------|
| DLMM Server | `src/subagents/mcp-servers/dlmm-server.ts` | Meteora LP |
| Perps Server | `src/subagents/mcp-servers/perps-server.ts` | Hyperliquid |
| Polymarket Server | `src/subagents/mcp-servers/polymarket-server.ts` | Predictions |
| Spot Server | `src/subagents/mcp-servers/spot-server.ts` | Jupiter swaps |

## Tool Structure

Tools follow a consistent structure:

```typescript
interface McpTool {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  handler: (args: unknown, runtime: Runtime) => Promise<McpResult>;
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

## Example Tool Definition

```typescript
// src/subagents/mcp-servers/dlmm-server.ts

const fetchPoolsTool: McpTool = {
  name: 'fetch_pools',
  description: `
    Fetch top Meteora DLMM pools sorted by fees, TVL, or volume.
    Returns pool address, token pair, current price, 24h fees, TVL, and APR.
  `,
  inputSchema: z.object({
    limit: z.number().default(20).describe('Maximum pools to return'),
    min_tvl: z.number().default(50000).describe('Minimum TVL filter'),
    sort_by: z.enum(['fees', 'tvl', 'volume']).default('fees'),
  }),
  handler: async (args, runtime) => {
    const pools = await runtime.meteoraClient.getTopPools({
      limit: args.limit,
      minTvl: args.min_tvl,
      sortBy: args.sort_by,
    });

    return {
      content: [{
        type: 'text',
        text: JSON.stringify(pools, null, 2),
      }],
    };
  },
};
```

## Tool Execution Flow

When Claude calls a tool:

```
1. Claude generates tool_use block
   {
     "type": "tool_use",
     "name": "fetch_pools",
     "input": { "limit": 15, "min_tvl": 100000 }
   }

2. Agent executor intercepts
   -> Runs PreToolUse hooks

3. MCP server receives request
   -> Validates input schema
   -> Calls handler function

4. Handler executes
   -> Calls client methods
   -> Formats result

5. Result returns to Claude
   -> Runs PostToolUse hooks
   -> Claude continues reasoning
```

## Hook Integration

Tools can be intercepted by hooks:

```typescript
// PreToolUse - Before tool executes
hookRegistry.register({
  name: 'tool-rate-limiter',
  event: 'PreToolUse',
  priority: 10,
  hook: async (ctx) => {
    if (ctx.toolName === 'submit_decision') {
      // Add validation
      if (ctx.args.amount_usd > 500) {
        return { proceed: false, reason: 'Requires approval' };
      }
    }
    return { proceed: true };
  },
});

// PostToolUse - After tool executes
hookRegistry.register({
  name: 'tool-logger',
  event: 'PostToolUse',
  priority: 10,
  hook: async (ctx) => {
    console.log(`Tool ${ctx.toolName} returned:`, ctx.result);
    return { proceed: true };
  },
});
```

## Common Tools

Tools available across all domains:

| Tool | Description |
|------|-------------|
| `get_balance` | Get available balance for the domain |
| `get_positions` | Get open positions |
| `get_portfolio` | Full portfolio across all domains |
| `submit_decision` | Record and execute a trading decision |

## The submit_decision Tool

The most important tool - records Claude's trading decision:

```typescript
const submitDecisionTool: McpTool = {
  name: 'submit_decision',
  description: 'Submit your trading decision for this cycle',
  inputSchema: z.object({
    action: z.enum(['buy', 'sell', 'hold', /* domain-specific */]),
    target: z.string().describe('Asset/pool/market identifier'),
    amount_usd: z.number().optional(),
    confidence: z.number().min(0).max(1),
    reasoning: z.string().describe('Detailed reasoning'),
    // Domain-specific fields...
  }),
  handler: async (args, runtime) => {
    // Record decision to database
    const decision = await runtime.db.createDecision({
      domain: runtime.domain,
      ...args,
    });

    // Execute if not hold
    if (args.action !== 'hold') {
      const result = await runtime.executor.execute(decision);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    }

    return { content: [{ type: 'text', text: 'Decision recorded: HOLD' }] };
  },
};
```

## Error Handling

Tools should handle errors gracefully:

```typescript
handler: async (args, runtime) => {
  try {
    const data = await runtime.client.getData(args);
    return { content: [{ type: 'text', text: JSON.stringify(data) }] };
  } catch (error) {
    return {
      content: [{
        type: 'text',
        text: `Error fetching data: ${error.message}`,
      }],
      isError: true,
    };
  }
},
```

## Related Documentation

- [Tool Reference](./tools.md) - Complete tool reference
- [Custom Tools](./custom-tools.md) - How to add new tools
- [Hooks System](../hooks/overview.md) - Tool interception
