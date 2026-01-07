# Trading Domains Overview

claudefi trades across four distinct DeFi domains, each with its own strategies, tools, and risk characteristics.

## The Four Domains

| Domain | Platform | Asset Type | Strategy Focus |
|--------|----------|------------|----------------|
| [DLMM](./dlmm.md) | Meteora | Liquidity Pools | Fee capture, IL management |
| [Perps](./perps.md) | Hyperliquid | Perpetual Futures | Technical analysis, leverage |
| [Spot](./spot.md) | Jupiter | Memecoins | Momentum, trend following |
| [Polymarket](./polymarket.md) | Polymarket | Prediction Markets | Probability estimation |

## Domain Architecture

Each domain has:

1. **Client** - API wrapper for the platform
2. **MCP Server** - Tools exposed to Claude
3. **Prompt** - Domain-specific strategies and guidelines
4. **Skills** - Learned patterns and warnings

```
+------------+     +------------+     +------------+
|   Client   |---->| MCP Server |---->|   Claude   |
| (API calls)|     | (Tools)    |     | (Decisions)|
+------------+     +------------+     +------------+
                         |
                         v
                   +------------+
                   |   Skills   |
                   | (Learning) |
                   +------------+
```

## Common Actions

All domains support these base actions:

| Action | Description |
|--------|-------------|
| `hold` | No action, maintain current positions |
| Various entry actions | Domain-specific (buy, open_long, add_liquidity, etc.) |
| Various exit actions | Domain-specific (sell, close, remove_liquidity, etc.) |

## Common Tools

Every domain has access to:

| Tool | Purpose |
|------|---------|
| `get_balance` | Check available balance for the domain |
| `get_positions` | View current open positions |
| `get_portfolio` | Full portfolio view across all domains |
| `submit_decision` | Record and execute trading decision |

## Risk Controls

Each domain operates under global and domain-specific risk limits:

```typescript
// Global limits (apply to all domains)
const GLOBAL_MAX_DRAWDOWN = 0.15;      // 15% portfolio drawdown pauses trading
const MAX_POSITION_PCT = 0.20;          // 20% max per position
const CONFIDENCE_THRESHOLD = 0.60;      // 60% minimum confidence

// Per-domain limits
const MAX_POSITIONS_PER_DOMAIN = 3;     // Max 3 concurrent positions
const DOMAIN_MAX_DRAWDOWN = 0.20;       // 20% domain drawdown reduces exposure
```

## Domain Selection

claudefi can run all domains or a subset:

```bash
# All domains (default)
ACTIVE_DOMAINS=dlmm,perps,polymarket,spot

# Subset
ACTIVE_DOMAINS=dlmm,perps

# Single domain
ACTIVE_DOMAINS=polymarket
```

Or run single domains directly:

```bash
npm run claudefi:dlmm
npm run claudefi:perps
npm run claudefi:polymarket
npm run claudefi:spot
```

## Cross-Domain Intelligence

The Portfolio Coordinator analyzes all domains together:

```typescript
const portfolioDirective = await getPortfolioDirective(marketSummary);
// Returns guidance like:
// - "Reduce perps exposure, market showing weakness"
// - "Correlation between DLMM and Spot positions is high"
// - "Consider hedging long bias with perps short"
```

This directive is passed to each subagent as additional context.

## Default Allocations

Each domain starts with equal allocation:

| Domain | Default Balance |
|--------|----------------|
| DLMM | $2,500 |
| Perps | $2,500 |
| Polymarket | $2,500 |
| Spot | $2,500 |
| **Total** | **$10,000** |

These can be adjusted via the database or admin API.

## Adding a New Domain

To add a new trading domain:

1. **Create Client** (`src/clients/newdomain/client.ts`)
   - API authentication
   - Data fetching methods
   - Paper/real trading execution

2. **Create MCP Server** (`src/subagents/mcp-servers/newdomain-server.ts`)
   - Define tools (fetch_data, get_positions, submit_decision)
   - Wire tools to client methods

3. **Create Prompt** (`src/prompts/newdomain.ts`)
   - Trading strategies
   - Risk guidelines
   - Tool usage instructions

4. **Register Subagent** (`src/subagents/index.ts`)
   - Add subagent configuration
   - Specify model, prompt, tools

5. **Update Config**
   ```bash
   ACTIVE_DOMAINS=dlmm,perps,polymarket,spot,newdomain
   ```

## Related Documentation

- [DLMM](./dlmm.md) - Meteora liquidity provision
- [Perps](./perps.md) - Hyperliquid perpetuals
- [Spot](./spot.md) - Jupiter memecoins
- [Polymarket](./polymarket.md) - Prediction markets
- [MCP Server Overview](../mcp-server/overview.md) - Tool system
