/**
 * Claudefi MCP Server
 * Custom MCP server with DeFi trading tools for Claude Agent SDK
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from '@modelcontextprotocol/sdk/types.js';

// Import tools
import { dlmmTools, handleDLMMTool } from './tools/dlmm/index.js';
import { perpsTools, handlePerpsTool } from './tools/perps/index.js';
import { polymarketTools, handlePolymarketTool } from './tools/polymarket/index.js';
import { spotTools, handleSpotTool } from './tools/spot/index.js';
import { portfolioTools, handlePortfolioTool } from './tools/portfolio/index.js';

// Combine all tools
const allTools: Tool[] = [
  ...dlmmTools,
  ...perpsTools,
  ...polymarketTools,
  ...spotTools,
  ...portfolioTools,
];

// Tool handler router
async function handleToolCall(name: string, args: Record<string, unknown>): Promise<unknown> {
  // Route to appropriate handler based on tool prefix
  if (name.startsWith('dlmm_')) {
    return handleDLMMTool(name, args);
  }
  if (name.startsWith('perps_')) {
    return handlePerpsTool(name, args);
  }
  if (name.startsWith('polymarket_')) {
    return handlePolymarketTool(name, args);
  }
  if (name.startsWith('spot_')) {
    return handleSpotTool(name, args);
  }
  if (name.startsWith('portfolio_') || name === 'get_portfolio' || name === 'get_balances') {
    return handlePortfolioTool(name, args);
  }

  throw new Error(`Unknown tool: ${name}`);
}

/**
 * Create and start the MCP server
 */
export async function createMCPServer(): Promise<Server> {
  const server = new Server(
    {
      name: 'claudefi',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List available tools
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: allTools,
  }));

  // Handle tool calls
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      const result = await handleToolCall(name, args as Record<string, unknown>);
      return {
        content: [
          {
            type: 'text',
            text: typeof result === 'string' ? result : JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return {
        content: [
          {
            type: 'text',
            text: `Error: ${message}`,
          },
        ],
        isError: true,
      };
    }
  });

  return server;
}

/**
 * Run the MCP server via stdio (for Agent SDK integration)
 */
export async function runMCPServer(): Promise<void> {
  const server = await createMCPServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('Claudefi MCP server running on stdio');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMCPServer().catch(console.error);
}
