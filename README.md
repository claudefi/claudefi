# <img src="icon.png" width="32" height="32" alt="claudefi" /> claudefi

[![npm](https://img.shields.io/npm/v/claudefi)](https://www.npmjs.com/package/claudefi)
[![Built with Claude Agent SDK](https://img.shields.io/badge/Built%20with-Claude%20Agent%20SDK-cc785c)](https://docs.anthropic.com/en/docs/agents-and-tools/claude-agent-sdk)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

**the open source claude agent that learns to trade defi**

```bash
bunx claudefi
```

four domains. self-improving memory. extensible with claude code skills.

claudefi runs a continuous 30-minute loop—observing markets, making decisions, executing trades, and building memory from outcomes. losses become warnings. wins become patterns. the agent that runs today is smarter than the one that ran yesterday.

## Domains

| Domain | Protocol | Strategy |
|--------|----------|----------|
| **DLMM** | Meteora | Concentrated liquidity provision |
| **Perps** | Hyperliquid | Leveraged futures (max 5x) |
| **Spot** | Jupiter | Memecoin momentum trading |
| **Polymarket** | Polymarket | Prediction market arbitrage |

## Built With

- **Claude Agent SDK** - multi-turn tool conversations with full context
- **MCP Server** - custom model context protocol exposing domain-specific trading tools
- **Parallel Subagents** - one per domain, running concurrently
- **Hooks System** - validation middleware for risk controls and guardrails
- **Memory System** - self-improving from every trade outcome

## Quick Start

```bash
bunx claudefi
```

that's it. paper trading is on by default.

<details>
<summary>from source</summary>

```bash
git clone https://github.com/claudefi/claudefi
cd claudefi && bun i
cp .env.example .env  # add ANTHROPIC_API_KEY
bun run ralph
```
</details>

## The Ralph Loop

Named after Ralph Wiggum. Not because he's smart, but because he's relentlessly persistent.

```
OBSERVE → THINK → ACT → LEARN → REPEAT
```

Every 30 minutes:
1. Fetch live market data across all domains
2. Run parallel Claude subagents (one per domain)
3. Validate decisions through hooks
4. Execute approved trades
5. Build memory from outcomes

## Memory

after every trade, the agent builds memory from what happened:

```
"Entered SOL pool at 847% APR. TVL dropped 40% in 2 hours.
IL exceeded fees. Lesson: high APR without volume confirmation is a trap."
```

memory has TTL. warnings expire after 60 days. patterns last 90. the agent knows when to forget.

similar memories merge at 70% similarity. ineffective patterns (< 30% success rate) get pruned.

## Skills

claudefi is built on claude code. extend it with skills.

skills are markdown files in `.claude/skills/` that teach the agent new strategies, risk rules, or domain knowledge. write your own or install from the community.

```bash
# install a community skill
claudefi skill install @community/dlmm-rebalancing

# create your own
claudefi skill create my-strategy
```

share back what works. everyone's agent gets smarter.

## Risk Infrastructure

- **Global drawdown limit**: -15% stops all new positions
- **Domain drawdown limit**: -20% halves position sizes
- **Position cap**: Max 3 per domain
- **Confidence threshold**: Minimum 60% to execute
- **Human approval**: Required for trades > $500
- **Trade idempotency**: Prevents duplicate executions

## Resilience

Built for unreliable networks and rate limits:

- **Exponential backoff**: Retries with jitter on transient failures
- **Rate limit handling**: Respects 429 responses and Retry-After headers
- **Model fallback**: Opus → Sonnet → Sonnet 3.5 on overload
- **Context pruning**: Automatic summarization to prevent overflow
- **JSONL transcripts**: Full audit trail of every decision

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                  Ralph Loop (30 min)                │
├─────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌────────┐ │
│  │  DLMM   │  │  Perps  │  │  Poly   │  │  Spot  │ │
│  │ Subagent│  │ Subagent│  │ Subagent│  │Subagent│ │
│  └────┬────┘  └────┬────┘  └────┬────┘  └───┬────┘ │
│       │            │            │            │      │
│       └────────────┴─────┬──────┴────────────┘      │
│                          │                          │
│                    ┌─────▼─────┐                    │
│                    │   Hooks   │                    │
│                    │ (validate)│                    │
│                    └─────┬─────┘                    │
│                          │                          │
│                    ┌─────▼─────┐                    │
│                    │  Execute  │                    │
│                    └─────┬─────┘                    │
│                          │                          │
│                    ┌─────▼─────┐                    │
│                    │  Memory   │                    │
│                    │ (learn)   │                    │
│                    └───────────┘                    │
└─────────────────────────────────────────────────────┘
```

## Commands

```bash
npm run ralph              # Run all domains (parallel)
npm run claudefi:dlmm      # Single domain
npm run claudefi:perps
npm run claudefi:spot
npm run claudefi:polymarket
npm run tui                # Terminal dashboard
npm run db:studio          # Database browser
```

## Configuration

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
DATABASE_URL="file:./claudefi.db"
DATA_PROVIDER=prisma              # prisma (local) or supabase

# Optional
PAPER_TRADING=true              # Default: true
ACTIVE_DOMAINS=dlmm,perps       # Default: all four
CYCLE_INTERVAL_MS=1800000       # Default: 30 minutes
CONFIDENCE_THRESHOLD=0.6        # Default: 0.6
CLAUDE_MODEL=claude-opus-4-5-20251101  # See models below

# Supabase (only if deploying with shared backend)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

### Agent SDK Compatible Models

| Model | Best For |
|-------|----------|
| `claude-opus-4-5-20251101` | Best quality (default) |
| `claude-sonnet-4-20250514` | Balance of quality/speed |
| `claude-3-5-sonnet-20241022` | Fast, cost-effective |

## Costs

~$13/day. less than most signal services. except you can tweak this one to fit your strategy.

## Sovereignty

Everything runs locally. Your API keys never leave your machine. No cloud, no backend, no "connect wallet." Clone, configure, run.

## Documentation

Full docs at [claudefi.com](https://claudefi.com) or in the [`docs/`](./docs/) directory.

## Community

join the trenches.

[![Discord](https://img.shields.io/badge/Discord-Join-5865F2?logo=discord&logoColor=white)](https://discord.gg/nzW8srS9)

share strategies. contribute skills. build together.

## License

MIT

---

*built for the trenches*
