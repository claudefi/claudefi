---
name: solana-trading
description: |
  Master skill for autonomous Solana trading across multiple domains. Combines
  DLMM liquidity provision, spot memecoin trading, perps, and prediction markets.
  Use this skill for portfolio-level decisions, cross-domain analysis, or when
  unsure which specific domain applies. Triggers on general trading questions,
  portfolio management, or Claudefi usage.
version: 1.0.0
author: claudefi
tags: [solana, trading, portfolio, defi, autonomous]
---

# Solana Trading (Master Skill)

Comprehensive trading system for autonomous multi-domain trading on Solana.

## When to Use This Skill

- General trading questions without specific domain
- Portfolio-level allocation decisions
- Cross-domain strategy considerations
- Understanding the Claudefi trading system
- Setting up or configuring trading domains

## Trading Domains

Claudefi operates across four trading domains, each with specialized strategies:

### 1. DLMM Liquidity (`dlmm-liquidity` skill)
- **Platform**: Meteora
- **Strategy**: Concentrated liquidity provision
- **Risk Level**: Medium (IL risk)
- **Reward**: Fee APR (10-200%+)
- **Best For**: Passive yield, market-neutral exposure

### 2. Spot Memecoin (`spot-memecoin` skill)
- **Platform**: Jupiter DEX
- **Strategy**: Momentum trading
- **Risk Level**: High (volatile assets)
- **Reward**: Price appreciation
- **Best For**: Active trading, catching runners

### 3. Perpetual Futures (`perps-trading` skill)
- **Platform**: Hyperliquid
- **Strategy**: Leveraged directional bets
- **Risk Level**: Very High (leverage)
- **Reward**: Magnified gains/losses
- **Best For**: Strong convictions, hedging

### 4. Prediction Markets (`polymarket-trading` skill)
- **Platform**: Polymarket
- **Strategy**: Probability edge trading
- **Risk Level**: Medium (binary outcomes)
- **Reward**: Edge extraction
- **Best For**: Information advantages, event trading

## Portfolio Allocation

### Conservative Allocation
```
DLMM:       50% (stable yield)
Spot:       30% (moderate upside)
Perps:      10% (small directional bets)
Polymarket: 10% (information edge)
```

### Aggressive Allocation
```
Spot:       40% (catch runners)
DLMM:       25% (base yield)
Perps:      25% (leverage plays)
Polymarket: 10% (high-conviction bets)
```

### Market-Adaptive
- **Bull Market**: More spot/perps long exposure
- **Bear Market**: More DLMM/perps short exposure
- **Sideways**: More DLMM (range-bound = good for LP)

## The Ralph Loop

Claudefi's autonomous trading loop runs on a 5-minute cycle:

```
┌─────────────────────────────────────────────────┐
│              THE RALPH LOOP                     │
│                                                 │
│  1. OBSERVE  ──→  Fetch live market data       │
│       ↓                                         │
│  2. THINK    ──→  Claude decides (with skills) │
│       ↓                        ↑               │
│  3. ACT      ──→  Execute trade │               │
│       ↓                        │               │
│  4. LEARN    ──→  Skills feed back             │
│       ↓           into THINK                   │
│  5. REPEAT                                      │
└─────────────────────────────────────────────────┘
```

## Risk Management (Portfolio Level)

### Position Limits
- **Max per position**: 25% of domain balance
- **Max positions per domain**: 3
- **Total portfolio exposure**: Varies by risk tolerance

### Correlation Management
- Don't overload correlated bets (e.g., all SOL exposure)
- Diversify across domains
- Balance long/short exposure in perps

### Drawdown Rules
- **-20% domain drawdown**: Reduce position sizes
- **-30% domain drawdown**: Pause domain trading
- **-50% portfolio drawdown**: Full pause, reassess

## Configuration

### Environment Variables
```bash
PAPER_TRADING=false          # Real trading mode
MAX_POSITION_PCT=0.25        # 25% max per position
MAX_POSITIONS_PER_DOMAIN=3   # Diversification
CONFIDENCE_THRESHOLD=0.6     # 60% min confidence
```

### Domain Activation
```bash
ACTIVE_DOMAINS=dlmm,spot     # Enable specific domains
```

## Decision Priority

When multiple opportunities exist:

1. **Exit losers first** - Cut losses quickly
2. **Take profits on big winners** - Lock in gains
3. **Add to winning domains** - Follow momentum
4. **Deploy idle capital** - Put cash to work

## Tools Available

When running Claudefi:
- All domain-specific tools from each skill
- `get_portfolio_status` - Overview of all positions
- `get_domain_balance` - Balance per domain
- `log_decision` - Record decisions to database

## Starting Claudefi

```bash
# Start the autonomous trading loop
npm run claudefi

# Expected output:
# [DataProvider] Using Supabase
# Starting Ralph Loop (Agent SDK Mode)
#    Domains: dlmm, spot (PARALLEL)
#    Mode: REAL
#    Cycle interval: 5 minutes
```

## Monitoring

- **Frontend**: claudefi.com shows all trades
- **Database**: Supabase stores decisions and positions
- **Logs**: Real-time output shows agent reasoning

## Related Skills

- `dlmm-liquidity` - Deep dive on DLMM
- `spot-memecoin` - Deep dive on spot trading
- `perps-trading` - Deep dive on perpetuals
- `polymarket-trading` - Deep dive on prediction markets
- `skill-creator` - How to create new skills from trades
