# Directory Structure

claudefi follows a modular directory structure organized by concern.

## Overview

```
claudefi/
├── src/
│   ├── orchestrator/           # Ralph Loop (main execution cycle)
│   ├── subagents/              # Domain-specific Claude agents
│   ├── clients/                # Live API clients
│   ├── skills/                 # Self-improvement system
│   ├── hooks/                  # Event-driven middleware
│   ├── learning/               # Judge feedback system
│   ├── services/               # Background services
│   ├── prompts/                # Domain-specific prompts
│   ├── db/                     # Database layer
│   ├── telegram/               # Telegram bot notifications
│   └── types/                  # TypeScript definitions
│
├── prisma/
│   └── schema.prisma           # Database schema
│
├── .claude/
│   └── skills/                 # Generated skills (runtime)
│
└── frontend/                   # Optional dashboard
```

## Source Code (`src/`)

### `orchestrator/`

The main execution engine:

```
orchestrator/
└── ralph-loop.ts       # Continuous trading loop
```

This is the entry point that coordinates all other components.

### `subagents/`

Domain-specific Claude agents and MCP servers:

```
subagents/
├── index.ts                    # Subagent configurations
├── executor.ts                 # Agent SDK execution engine
├── session-store.ts            # Session persistence
├── portfolio-coordinator.ts    # Cross-domain intelligence
└── mcp-servers/                # MCP tool servers per domain
    ├── dlmm-server.ts
    ├── perps-server.ts
    ├── polymarket-server.ts
    └── spot-server.ts
```

**Key files:**
- `index.ts` - Defines each subagent's configuration (prompt, tools, model)
- `executor.ts` - Runs multi-turn conversations via Agent SDK
- `mcp-servers/*` - Expose domain-specific tools to Claude

### `clients/`

Direct API clients for each trading platform:

```
clients/
├── meteora/            # Meteora DLMM pools
│   ├── client.ts
│   └── types.ts
├── hyperliquid/        # Perpetual futures
│   ├── client.ts
│   └── types.ts
├── polymarket/         # Gamma API for prediction markets
│   ├── client.ts
│   └── types.ts
├── geckoterminal/      # Spot token discovery
│   └── client.ts
└── jupiter/            # Solana swaps
    ├── client.ts
    └── types.ts
```

Each client handles:
- API authentication
- Rate limiting
- Response parsing
- Paper vs real trading modes

### `skills/`

Self-improvement system:

```
skills/
├── skill-creator.ts           # Generate skills from outcomes
├── skill-merger.ts            # Deduplicate similar skills
└── cross-domain-patterns.ts   # Cross-domain learning
```

### `hooks/`

Event-driven middleware:

```
hooks/
├── index.ts            # Hook registry exports
├── registry.ts         # Registration logic
├── built-in.ts         # Default hooks
└── types.ts            # Hook type definitions
```

### `learning/`

Decision evaluation system:

```
learning/
├── index.ts
└── judge-feedback.ts   # Decision quality evaluation
```

### `services/`

Background services:

```
services/
└── position-monitor.ts # Exit conditions monitoring
```

### `prompts/`

Domain-specific system prompts:

```
prompts/
├── dlmm.ts
├── perps.ts
├── polymarket.ts
└── spot.ts
```

Each prompt includes:
- Domain-specific strategies
- Risk guidelines
- Tool usage instructions
- Decision format requirements

### `db/`

Database layer:

```
db/
├── index.ts            # Database operations
├── prisma.ts           # Prisma client singleton
└── cache.ts            # Caching layer
```

### `telegram/`

Notification system:

```
telegram/
├── bot.ts
├── commands.ts
└── alerts.ts
```

### `types/`

Shared TypeScript definitions:

```
types/
└── index.ts
```

## Prisma (`prisma/`)

Database schema and migrations:

```
prisma/
├── schema.prisma       # Database models
├── migrations/         # Migration history
└── dev.db             # SQLite database (local)
```

## Skills Directory (`.claude/`)

Runtime-generated skills:

```
.claude/
└── skills/
    ├── archive/                    # Expired skills
    ├── general/                    # Cross-domain skills
    ├── warning-dlmm-*.md          # Domain warnings
    ├── pattern-perps-*.md         # Domain patterns
    └── strategy-polymarket-*.md   # Domain strategies
```

This directory is:
- Git-ignored (skills are unique to each instance)
- Auto-populated by the skill creator
- Read by subagents at context build time

## Adding New Components

### New Domain

1. Create client: `src/clients/newdomain/client.ts`
2. Create MCP server: `src/subagents/mcp-servers/newdomain-server.ts`
3. Create prompt: `src/prompts/newdomain.ts`
4. Add to subagent config: `src/subagents/index.ts`
5. Add to active domains: `ACTIVE_DOMAINS=dlmm,perps,...,newdomain`

### New Hook

1. Add to `src/hooks/built-in.ts` or create custom file
2. Register in `src/hooks/index.ts`

### New Skill Type

1. Update `src/skills/skill-creator.ts`
2. Add TTL config if different from existing types

## Related Documentation

- [Architecture Overview](./overview.md) - How components interact
- [MCP Server Overview](../mcp-server/overview.md) - Tool system
- [Database Schema](../database/schema.md) - Data models
