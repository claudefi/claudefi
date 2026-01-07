# Installation

This guide walks you through installing claudefi and its dependencies.

## Prerequisites

- **Node.js** 18+ (LTS recommended)
- **npm** or **pnpm**
- **Git**

## Clone the Repository

```bash
git clone https://github.com/claudefi/claudefi
cd claudefi
```

## Install Dependencies

```bash
npm install
```

This installs:
- `@anthropic-ai/sdk` - Claude Agent SDK
- `prisma` - Database ORM
- `zod` - Schema validation
- Domain-specific SDKs (Solana, Hyperliquid, etc.)

## Environment Setup

Copy the example environment file:

```bash
cp .env.example .env
```

At minimum, you need:

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
```

See [Configuration](./configuration.md) for all available options.

## Database Setup

claudefi uses SQLite by default (no external database required):

```bash
npm run db:setup
```

This creates:
- `prisma/dev.db` - Local SQLite database
- All required tables (positions, decisions, skills, etc.)

### Using PostgreSQL (Optional)

For production, you can use PostgreSQL via Supabase:

```bash
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Then run:

```bash
npm run db:generate
npm run db:push
```

## Verify Installation

Run a quick test to verify everything is set up:

```bash
# Check TypeScript compilation
npm run typecheck

# Run tests
npm run test

# Test individual API connections
npm run test:api:meteora
npm run test:api:hyperliquid
```

## Troubleshooting

### "Cannot find module" Errors

Regenerate the Prisma client:

```bash
npm run db:generate
```

### API Key Issues

Verify your Anthropic API key is valid:

```bash
# Quick test
curl https://api.anthropic.com/v1/messages \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"claude-3-haiku-20240307","max_tokens":10,"messages":[{"role":"user","content":"Hi"}]}'
```

### Database Locked

If you see "database is locked" errors with SQLite, ensure only one instance of claudefi is running.

## Next Steps

- [Configuration](./configuration.md) - Configure trading parameters
- [Quick Start](./quick-start.md) - Run your first trading cycle
