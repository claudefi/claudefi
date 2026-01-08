# Quick Start

Get claudefi running in 5 minutes with paper trading.

## 1. Clone and Install

```bash
git clone https://github.com/claudefi/claudefi
cd claudefi
npm install
```

## 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and add your Anthropic API key:

```bash
ANTHROPIC_API_KEY=sk-ant-api03-your-key-here
DATA_PROVIDER=prisma
```

`DATA_PROVIDER=prisma` uses the local SQLite database. Switch to `supabase` only if you're deploying with the hosted backend.

## 3. Initialize Database

```bash
npm run db:setup
```

## 4. Run

```bash
npm run ralph
```

That's it! claudefi will start running in paper trading mode across all four domains.

## What Happens Next?

1. **Skill Loading** - Existing skills are loaded into memory
2. **Portfolio Coordination** - Cross-domain analysis runs
3. **Context Building** - Live market data is fetched for each domain
4. **Decision Making** - Claude analyzes data and makes decisions
5. **Execution** - Approved trades are simulated
6. **Learning** - Outcomes are analyzed for skill generation

## Watching the Output

You'll see output like:

```
[Ralph] Starting cycle 1...
[Ralph] Loading skills... 12 active skills
[Ralph] Building contexts for 4 domains...
[DLMM] Fetching top pools...
[Perps] Fetching markets with indicators...
[Polymarket] Fetching trending markets...
[Spot] Fetching trending tokens...
[Ralph] Executing subagents in parallel...
[DLMM] Decision: ADD_LIQUIDITY on SOL-USDC (confidence: 0.78)
[Perps] Decision: HOLD (confidence: 0.65)
[Ralph] Cycle 1 complete. Next cycle in 30 minutes.
```

## Running a Single Domain

To test one domain at a time:

```bash
# Run only DLMM
npm run claudefi:dlmm

# Run only Perps
npm run claudefi:perps

# Run only Polymarket
npm run claudefi:polymarket

# Run only Spot
npm run claudefi:spot
```

## Viewing Data

### Prisma Studio

Open a visual database browser:

```bash
npm run db:studio
```

This shows:
- Open positions
- Decision history
- Active skills
- Performance snapshots

### Skills Directory

Generated skills are stored in `.claude/skills/`:

```
.claude/skills/
├── warning-dlmm-low-tvl-2025-01-07.md
├── pattern-perps-rsi-oversold-2025-01-06.md
└── archive/
    └── expired-skills...
```

## Stopping

Press `Ctrl+C` to stop the loop. Positions are preserved in the database.

## Next Steps

- [Configuration](./configuration.md) - Customize trading parameters
- [The Ralph Loop](../architecture/ralph-loop.md) - Understand the execution cycle
- [Skills System](../skills/overview.md) - How learning works
- [Paper Trading](../trading/paper-trading.md) - Detailed paper trading info
