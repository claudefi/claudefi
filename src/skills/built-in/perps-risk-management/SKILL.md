---
name: perps-risk-management
description: Risk management and position sizing for Hyperliquid perpetual futures. Use when opening longs/shorts, setting leverage, managing open positions, or evaluating market conditions.
allowed-tools: perps_fetch_markets, perps_open_position, perps_close_position, perps_get_positions
---

# Perps Risk Management Strategy

## When to Use
- Opening any leveraged position
- Deciding on position size
- Setting stop-loss levels
- Managing multiple open positions

## Core Risk Rules

### 1. Leverage Limits
- **Max leverage**: 5x for majors (BTC, ETH, SOL)
- **Max leverage**: 3x for altcoins
- **Never**: Use max available leverage regardless of confidence
- **Exception**: 1x "leverage" is just spot with funding exposure

### 2. Position Sizing
- Single position max: 20% of perps balance
- Total exposure max: 60% of perps balance
- Max concurrent positions: 3
- Scale in: Open 50% initially, add on confirmation

### 3. Entry Criteria
- Funding rate direction aligns with trade (negative = long, positive = short)
- Volume > $10M in last 24h
- Open interest not at extreme levels
- Clear technical setup or catalyst

## Funding Rate Strategies

### Long Bias (Negative Funding)
- Funding < -0.01% per 8h = strong long signal
- You get PAID to hold longs
- Best for range-bound markets

### Short Bias (Positive Funding)
- Funding > 0.05% per 8h = crowded long
- Market vulnerable to liquidation cascade
- Consider contrarian short with tight stop

### Neutral (Funding ~0)
- No funding edge either way
- Rely on directional conviction only

## Position Management

### Stop Loss Rules
- BTC/ETH: 3-5% from entry
- Altcoins: 5-8% from entry
- Memes: 10-15% or don't trade

### Take Profit Rules
- Scale out at 1:1 risk/reward (50% of position)
- Move stop to break-even
- Let remainder run with trailing stop

### Liquidation Awareness
- Know exact liquidation price BEFORE entering
- Never let position get within 20% of liquidation
- Reduce size if margin ratio drops below 50%

## Warning Signs

### Don't Trade When
- Funding rate is extreme (>0.1% or <-0.1% per 8h)
- Open interest at all-time highs
- Major news event imminent
- Market in rapid directional move (chase = death)

### Exit Immediately If
- Position moves against you 50% of stop distance on entry candle
- Funding rate flips aggressively against your position
- Liquidations cascading in your direction

## Checklist Before Opening Position
- [ ] Leverage <= 5x (majors) or 3x (alts)
- [ ] Size <= 20% of balance
- [ ] Know exact liquidation price
- [ ] Stop loss set (in system or mental)
- [ ] Funding rate favorable or neutral
- [ ] Not chasing momentum
- [ ] < 3 open positions total
