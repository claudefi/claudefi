# Claudefi

**Autonomous DeFi Trading Agent powered by Claude Agent SDK**

Claudefi is a self-improving autonomous trading agent that runs a continuous loop across four DeFi domains. It observes markets, makes decisions with Claude, executes trades, and learns from outcomes to improve future performance.

## Quick Start

```bash
# Clone
git clone https://github.com/claudefi/claudefi
cd claudefi

# Install
npm install

# Configure
cp .env.example .env
# Edit .env with your ANTHROPIC_API_KEY

# Setup database
npm run db:setup

# Run (paper trading)
npm run ralph
```

## Documentation

Full documentation is available in the [`docs/`](./docs/) directory:

- **[Getting Started](./docs/getting-started/quick-start.md)** - Installation and first run
- **[Architecture](./docs/architecture/overview.md)** - How Claudefi works
- **[Trading Domains](./docs/domains/overview.md)** - DLMM, Perps, Spot, Polymarket
- **[Skills System](./docs/skills/overview.md)** - Self-improvement from outcomes
- **[Risk Management](./docs/trading/risk-management.md)** - Guard rails and limits

## Features

- **4 Trading Domains**: DLMM liquidity provision, perpetual futures, spot memecoins, prediction markets
- **Continuous Loop**: 30-minute decision cycles (configurable)
- **Self-Improving**: Generates "skills" from wins and losses
- **Risk Controls**: Multiple layers of validation and limits
- **Paper Trading**: Safe testing with live market data

## How It Works

```
Trade -> Outcome -> Analysis -> Skill -> Better Future Trades
           |                      ^
           +----------------------+
              Feedback Loop
```

When trades close, Claudefi analyzes outcomes and generates skills:
- **Warning skills** from losses prevent similar mistakes
- **Pattern skills** from wins replicate success

## Commands

```bash
npm run ralph              # Run all domains
npm run claudefi:dlmm      # Run single domain
npm run db:studio          # Database browser
npm run test               # Run tests
```

## Requirements

- Node.js 18+
- Anthropic API key

## License

MIT

---

*Built for the trenches*
