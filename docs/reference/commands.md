# Commands Reference

All available npm commands for claudefi.

## Main Commands

### Running the Agent

```bash
# Run all domains (main loop)
npm run ralph

# Run single domains
npm run claudefi:dlmm         # DLMM only
npm run claudefi:perps        # Perps only
npm run claudefi:polymarket   # Polymarket only
npm run claudefi:spot         # Spot only
```

### Development

```bash
# Watch mode (auto-restart on changes)
npm run dev

# Build TypeScript
npm run build

# TypeScript type checking
npm run typecheck

# Lint code
npm run lint

# Format code
npm run format
```

### Database

```bash
# Initial setup (create tables)
npm run db:setup

# Generate Prisma client
npm run db:generate

# Push schema changes to database
npm run db:push

# Open Prisma Studio (database GUI)
npm run db:studio

# Create migration
npm run db:migrate -- --name migration_name

# Apply migrations
npm run db:migrate:deploy

# Reset database (destructive!)
npm run db:reset
```

### Testing

```bash
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run specific test file
npm run test -- path/to/test.ts

# API connection tests
npm run test:api:meteora
npm run test:api:hyperliquid
npm run test:api:polymarket
npm run test:api:geckoterminal
npm run test:api:jupiter
```

### Utilities

```bash
# Check skill effectiveness
npm run skills:report

# Archive expired skills
npm run skills:archive

# View portfolio summary
npm run portfolio

# Export data to CSV
npm run export -- --from 2025-01-01 --to 2025-01-07
```

## Command Details

### `npm run ralph`

Starts the main Ralph Loop with all active domains.

```bash
npm run ralph

# With custom domains
ACTIVE_DOMAINS=dlmm,perps npm run ralph

# With shorter cycle
CYCLE_INTERVAL_MS=900000 npm run ralph  # 15 minutes
```

Output:
```
[Ralph] Starting claudefi...
[Ralph] Mode: paper
[Ralph] Active domains: dlmm, perps, polymarket, spot
[Ralph] Cycle interval: 30 minutes
[Ralph] Loading skills... 12 active skills
[Ralph] Starting cycle 1...
```

### `npm run db:studio`

Opens Prisma Studio, a visual database browser.

```bash
npm run db:studio

# Opens http://localhost:5555
```

Allows you to:
- Browse all tables
- View and edit records
- Run ad-hoc queries
- Export data

### `npm run test:api:*`

Tests connectivity to external APIs.

```bash
# Test Meteora DLMM API
npm run test:api:meteora
# Output: Fetched 20 pools. Top: SOL-USDC ($1.2M TVL)

# Test Hyperliquid API
npm run test:api:hyperliquid
# Output: Fetched 50 markets. BTC: $45,123.50

# Test Gamma (Polymarket) API
npm run test:api:polymarket
# Output: Fetched 25 trending markets.

# Test Jupiter API
npm run test:api:jupiter
# Output: SOL price: $123.45
```

### `npm run skills:report`

Generates a report of skill effectiveness.

```bash
npm run skills:report
```

Output:
```
SKILL EFFECTIVENESS REPORT
==========================

Domain: dlmm
  warning-dlmm-low-tvl       Applied: 8   Success: 75%
  pattern-dlmm-high-volume   Applied: 5   Success: 80%

Domain: perps
  pattern-perps-rsi          Applied: 12  Success: 67%
  warning-perps-leverage     Applied: 3   Success: 100%

Domain: polymarket
  strategy-poly-elections    Applied: 15  Success: 73%

Overall: 43 applications, 74% success rate
```

### `npm run portfolio`

Shows current portfolio status.

```bash
npm run portfolio
```

Output:
```
PORTFOLIO SUMMARY
=================

Total Value: $10,450.00
Total P&L: +$450.00 (+4.5%)

Domain Breakdown:
  DLMM:       $2,650  (+6.0%)  2 positions
  Perps:      $2,350  (-6.0%)  1 position
  Polymarket: $2,700  (+8.0%)  2 positions
  Spot:       $2,750  (+10.0%) 1 position

Open Positions: 6
```

## Environment Variables in Commands

Commands respect environment variables:

```bash
# Override trading mode
TRADING_MODE=testnet npm run ralph

# Override domains
ACTIVE_DOMAINS=perps npm run ralph

# Override cycle time
CYCLE_INTERVAL_MS=60000 npm run ralph  # 1 minute cycles

# Combine
TRADING_MODE=testnet ACTIVE_DOMAINS=perps LOG_LEVEL=debug npm run ralph
```

## Scripts Location

Commands are defined in `package.json`:

```json
{
  "scripts": {
    "ralph": "tsx src/orchestrator/ralph-loop.ts",
    "claudefi:dlmm": "ACTIVE_DOMAINS=dlmm tsx src/orchestrator/ralph-loop.ts",
    "claudefi:perps": "ACTIVE_DOMAINS=perps tsx src/orchestrator/ralph-loop.ts",
    "claudefi:polymarket": "ACTIVE_DOMAINS=polymarket tsx src/orchestrator/ralph-loop.ts",
    "claudefi:spot": "ACTIVE_DOMAINS=spot tsx src/orchestrator/ralph-loop.ts",
    "dev": "tsx watch src/orchestrator/ralph-loop.ts",
    "build": "tsc",
    "typecheck": "tsc --noEmit",
    "test": "vitest",
    "test:watch": "vitest watch",
    "db:setup": "prisma migrate dev",
    "db:generate": "prisma generate",
    "db:push": "prisma db push",
    "db:studio": "prisma studio"
  }
}
```

## Related Documentation

- [Quick Start](../getting-started/quick-start.md) - Getting started
- [Configuration](../getting-started/configuration.md) - Environment setup
- [Database Schema](../database/schema.md) - Database details
