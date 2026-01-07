# Perps Domain (Hyperliquid)

The Perps domain trades perpetual futures on Hyperliquid using technical analysis and leverage.

## Overview

**Platform**: Hyperliquid
**Chain**: Hyperliquid L1 (Arbitrum-based)
**Strategy**: Technical analysis with momentum and mean reversion

Perpetual futures allow leveraged exposure to crypto assets without expiration dates, using funding rates to keep prices aligned with spot.

## Strategies

### RSI Mean Reversion

Trade reversals at extreme RSI levels.

```
Oversold (RSI < 30): Look for long entries
Overbought (RSI > 70): Look for short entries

Entry: Wait for RSI to cross back (e.g., RSI crosses above 30)
Exit: Target 2-3% move or RSI reaches opposite extreme
```

### Funding Rate Arbitrage

Exploit extreme funding rates.

```
High positive funding (>0.05%): Market is too bullish, consider shorts
High negative funding (<-0.05%): Market is too bearish, consider longs

Collect funding while betting on mean reversion
```

### Momentum + Trend

Follow strong trends with technical confluence.

```
Trend: Price above/below key moving averages
Momentum: RSI showing strength in trend direction
Volume: Confirmation of interest

Enter in trend direction on pullbacks
```

## Available Tools

### `fetch_markets`

Get perpetual markets with prices and indicators.

```typescript
{
  name: 'fetch_markets',
  args: {
    symbols: ['BTC', 'ETH', 'SOL'],  // Optional filter
    include_indicators: true
  }
}
```

Returns:
- Symbol
- Mark price
- Index price
- Funding rate (current and predicted)
- Open interest
- 24h volume
- RSI (14)
- Price change %

### `get_positions`

View open perpetual positions.

```typescript
{
  name: 'get_positions',
  args: {}
}
```

Returns:
- Symbol
- Side (long/short)
- Size (USD)
- Entry price
- Mark price
- Unrealized P&L
- Liquidation price
- Leverage

### `get_balance`

Check margin balance.

```typescript
{
  name: 'get_balance',
  args: {}
}
```

Returns:
- Available balance
- Used margin
- Total equity
- Margin ratio

### `submit_decision`

Record a trading decision.

```typescript
{
  name: 'submit_decision',
  args: {
    action: 'open_long',
    target: 'ETH',
    amount_usd: 300,
    leverage: 5,
    stop_loss: 1850,
    take_profit: 2100,
    confidence: 0.72,
    reasoning: 'RSI oversold at 28, funding negative, support holding...'
  }
}
```

## Actions

| Action | Description |
|--------|-------------|
| `open_long` | Open long position |
| `open_short` | Open short position |
| `close_position` | Close entire position |
| `partial_close` | Close portion of position |
| `add_to_position` | Increase position size |
| `hold` | No action |

## Risk Rules

### Leverage Limits

```
Maximum leverage: 10x (hard limit)
Recommended: 3-5x for most trades
High conviction only: 5-10x
```

### Position Sizing

```
Max position: 20% of domain balance
Typical: 10-15% for normal confidence
Small: 5-10% for lower confidence
```

### Stop Loss Requirements

All positions should have defined exits:

```typescript
{
  stop_loss: entryPrice * (side === 'long' ? 0.95 : 1.05), // 5% stop
  take_profit: entryPrice * (side === 'long' ? 1.10 : 0.90) // 10% target
}
```

## Example Decision Flow

```
1. Claude calls fetch_markets(include_indicators: true)
   -> Returns BTC, ETH, SOL with RSI, funding, etc.

2. Claude identifies ETH:
   - RSI: 28 (oversold)
   - Funding: -0.03% (negative)
   - Price: Near $1900 support

3. Claude checks get_positions()
   -> 1 open BTC long, room for more

4. Claude analyzes:
   - Active skills: pattern-perps-rsi-oversold (success rate: 67%)
   - Domain balance: $2,100
   - Position budget: $300 (14%)

5. Claude calls submit_decision:
   action: open_long
   target: ETH
   amount_usd: 300
   leverage: 5
   stop_loss: 1850
   take_profit: 2050
   confidence: 0.72
```

## Metrics Tracked

| Metric | Description |
|--------|-------------|
| Win rate | % of profitable trades |
| Average P&L | Mean return per trade |
| Sharpe ratio | Risk-adjusted returns |
| Max drawdown | Largest peak-to-trough |
| Funding collected | Net funding payments |

## Common Warning Skills

```markdown
# Warning: High Leverage in Volatile Markets

Avoid >5x leverage when:
- BTC 24h range > 8%
- Major news pending
- Weekend liquidity (lower)

# Warning: Fighting the Trend

RSI can stay oversold/overbought in strong trends.
Wait for price confirmation before counter-trend trades.
```

## Liquidation Monitoring

The position monitor service tracks liquidation risk:

```typescript
// Automatic alerts at these levels
const LIQUIDATION_THRESHOLDS = {
  warning: 0.70,  // 70% to liquidation price
  danger: 0.85,   // 85% to liquidation price
  critical: 0.95  // 95% to liquidation price
};
```

## Related Documentation

- [Hyperliquid Client](../clients/hyperliquid.md) - API details
- [Risk Management](../trading/risk-management.md) - Risk controls
- [Paper Trading](../trading/paper-trading.md) - Testing positions
