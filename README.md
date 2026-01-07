# <img src="icon.png" width="32" height="32" alt="claudefi" /> claudefi

**Autonomous DeFi trading agent that learns from every trade.**

claudefi runs a continuous loop across four DeFi domains—making decisions, executing trades, and generating "skills" from outcomes. Losses become warnings. Wins become patterns. The agent that runs today is smarter than the one that ran yesterday, all made possible by the claude agent sdk.

## Domains

| Domain | Protocol | Strategy |
|--------|----------|----------|
| **DLMM** | Meteora | Concentrated liquidity provision |
| **Perps** | Hyperliquid | Leveraged futures (max 5x) |
| **Spot** | Jupiter | Memecoin momentum trading |
| **Polymarket** | Polymarket | Prediction market arbitrage |

## Quick Start

```bash
git clone https://github.com/claudefi/claudefi
cd claudefi && npm install
cp .env.example .env  # add ANTHROPIC_API_KEY
npm run db:setup
npm run ralph
```

Paper trading is on by default. Watch it think before risking real money.

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
5. Generate skills from outcomes

## Skills System

After every trade, the agent writes a skill explaining what happened:

```
"Entered SOL pool at 847% APR. TVL dropped 40% in 2 hours.
IL exceeded fees. Lesson: high APR without volume confirmation is a trap."
```

Skills have TTL. Warnings expire after 60 days. Patterns last 90. The agent knows when to forget.

Similar skills merge at 70% similarity. Ineffective skills (< 30% success rate) get pruned.

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
│                    │  Skills   │                    │
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

# Optional
PAPER_TRADING=true              # Default: true
ACTIVE_DOMAINS=dlmm,perps       # Default: all four
CYCLE_INTERVAL_MS=1800000       # Default: 30 minutes
CONFIDENCE_THRESHOLD=0.6        # Default: 0.6
CLAUDE_MODEL=claude-opus-4-5-20251101  # See models below
```

### Agent SDK Compatible Models

| Model | Best For |
|-------|----------|
| `claude-opus-4-5-20251101` | Best quality (default) |
| `claude-sonnet-4-20250514` | Balance of quality/speed |
| `claude-3-5-sonnet-20241022` | Fast, cost-effective |

## Costs

~$13/day total API usage across all four domains. Less than most signal services, except this one learns.

## Sovereignty

Everything runs locally. Your API keys never leave your machine. No cloud, no backend, no "connect wallet." Clone, configure, run.

## Documentation

Full docs at [claudefi.com](https://claudefi.com) or in the [`docs/`](./docs/) directory.

## License

MIT

---

*built for the trenches*
