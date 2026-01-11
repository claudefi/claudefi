---
name: perps-trading
description: |
  Perpetual futures trading on Hyperliquid. Use for leveraged trading,
  technical analysis, funding rate strategies, and position management.
  Triggers on perps questions, leverage trading, shorts, or futures.
version: 1.0.0
author: claudefi
tags: [perps, futures, leverage, hyperliquid, trading]
---

# Perpetual Futures Trading

Specialized knowledge for trading perpetual futures on Hyperliquid.

## When to Use This Skill

- Opening leveraged long/short positions
- Analyzing funding rate opportunities
- Technical analysis for entry/exit
- Position and risk management
- Understanding liquidation mechanics

## Core Concepts

### What are Perpetuals?

Perps let you trade price movements with **leverage** without expiration.

**Key Features:**
- **Leverage**: Control large positions with small margin (up to 50x)
- **Long or Short**: Profit from price going up OR down
- **Funding Rates**: Periodic payments between longs and shorts
- **Liquidation**: Auto-close if price moves too far against you

### Funding Rate Mechanics

Funding rates balance long/short demand:
- **Positive Funding**: Longs pay shorts (bullish crowding)
- **Negative Funding**: Shorts pay longs (bearish crowding)
- **Strategy**: Go against the crowd to earn funding

## Technical Indicators

### RSI (Relative Strength Index)

| RSI Value | Interpretation |
|-----------|----------------|
| < 30 | OVERSOLD - consider longs |
| 30-40 | Weak, potential bounce |
| 40-60 | Neutral |
| 60-70 | Strong, watch for exhaustion |
| > 70 | OVERBOUGHT - consider shorts |

### Momentum Signal (0-100)

| Score | Signal | Action |
|-------|--------|--------|
| 70-100 | STRONG_BULLISH | Aggressive longs |
| 60-70 | BULLISH | Standard longs |
| 45-55 | NEUTRAL | Wait for clarity |
| 30-40 | BEARISH | Standard shorts |
| 0-30 | STRONG_BEARISH | Aggressive shorts |

## Decision Framework

### Entry Criteria

1. **Technical Alignment**
   - RSI supporting direction
   - Momentum signal confirming
   - Volume trend validating

2. **Funding Rate Check**
   - Negative funding + long = earn while positioned
   - Positive funding + short = earn while positioned

3. **Risk/Reward**
   - Minimum 2:1 reward to risk
   - Clear invalidation level

### Position Sizing

```
Margin = Position Size / Leverage
Max Position = Balance * 0.3 / (1 / Leverage)

Example: $100 balance, 5x leverage
Max Margin = $30
Max Position = $150
```

## Risk Management

### Leverage Guidelines

| Asset Type | Max Leverage | Why |
|------------|-------------|-----|
| Majors (BTC, ETH) | 10x | Lower volatility |
| Alt-coins | 5x | Higher volatility |
| Meme coins | 2-3x | Extreme volatility |

### Stop Loss Rules

- **Majors**: -8% to -12% position P&L
- **Alts**: -10% to -15% position P&L
- **Always use stops**: Never let a trade run without limits

### Liquidation Buffer

- Maintain >15% distance to liquidation price
- Account for volatility spikes
- Never add to losing positions

## Decision Format

```json
{
  "action": "open_long" | "open_short" | "close_position" | "hold",
  "target": "BTC",
  "amountUsd": 100,
  "leverage": 5,
  "reasoning": "Technical analysis explanation",
  "confidence": 0.75
}
```

**Note**: `amountUsd` is POSITION SIZE, not margin. Margin = amountUsd / leverage.

## Common Mistakes to Avoid

1. **Over-leveraging**: Using max leverage on volatile assets
2. **No Stop Loss**: Hoping losers recover
3. **Fighting Funding**: Holding against extreme funding
4. **Ignoring Liquidation**: Not checking liquidation price
5. **Over-trading**: Taking low-quality setups

## Profit Taking Strategy

- **Don't exit small wins**: +5% with momentum = HOLD
- **Trail stops on big winners**: Move stop to breakeven at +20%
- **Target 2R minimum**: Risk $50 to make $100+
- **Let winners run**: Don't cut profits short

## Tools Available

When integrated with Claudefi MCP:
- `get_perp_markets` - Fetch market data with indicators
- `open_position` - Open long/short with leverage
- `close_position` - Exit position
- `get_positions` - View open positions with P&L
- `get_funding_rates` - Current funding across markets
