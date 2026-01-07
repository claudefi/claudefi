# DLMM Domain (Meteora)

The DLMM domain provides liquidity on Meteora's Dynamic Liquidity Market Maker pools on Solana.

## Overview

**Platform**: Meteora DLMM
**Chain**: Solana
**Strategy**: Liquidity provision with fee capture

DLMM (Dynamic Liquidity Market Maker) pools allow concentrated liquidity placement with customizable bin ranges, enabling higher capital efficiency than traditional AMMs.

## Strategies

### Spot Strategy

Tight range around current price for maximum fee capture.

```
Price: $100
Range: $98 - $102 (2% spread)
Risk: High IL if price moves outside range
Reward: Maximum fee capture while in range
```

Best for:
- Stable pairs (USDC/USDT)
- Low volatility periods
- Short holding periods

### Curve Strategy

Wide bell-curve distribution for better IL protection.

```
Price: $100
Range: $85 - $115 (15% spread)
Risk: Lower IL risk
Reward: Lower but more consistent fees
```

Best for:
- Volatile pairs
- Longer holding periods
- Risk-averse positioning

### Bid-Ask Strategy

Asymmetric placement for directional views.

```
Bullish: Place more liquidity below current price
Bearish: Place more liquidity above current price
```

Best for:
- When you have directional conviction
- Hedging existing positions

## Available Tools

### `fetch_pools`

Get top Meteora DLMM pools sorted by fees or TVL.

```typescript
{
  name: 'fetch_pools',
  args: {
    limit: 20,        // Max pools to return
    min_tvl: 50000,   // Minimum TVL filter
    sort_by: 'fees'   // 'fees' | 'tvl' | 'volume'
  }
}
```

Returns:
- Pool address
- Token pair
- Current price
- 24h fees
- TVL
- Volume
- APR estimate

### `get_pool_details`

Get detailed information about a specific pool.

```typescript
{
  name: 'get_pool_details',
  args: {
    pool_address: 'xxx...'
  }
}
```

Returns:
- Bin configuration
- Current bin ID
- Fee rate
- Liquidity distribution
- Recent trades

### `get_positions`

View current LP positions.

```typescript
{
  name: 'get_positions',
  args: {}
}
```

Returns:
- Position ID
- Pool info
- Entry value
- Current value
- Fees earned
- IL amount
- Time in position

### `get_balance`

Check available balance for DLMM operations.

```typescript
{
  name: 'get_balance',
  args: {}
}
```

### `submit_decision`

Record a trading decision.

```typescript
{
  name: 'submit_decision',
  args: {
    action: 'add_liquidity',
    target: 'SOL-USDC',
    pool_address: 'xxx...',
    amount_usd: 500,
    strategy: 'spot',
    bin_range: { lower: -5, upper: 5 },
    confidence: 0.75,
    reasoning: 'High fee APR with stable price action...'
  }
}
```

## Actions

| Action | Description |
|--------|-------------|
| `add_liquidity` | Open new LP position |
| `remove_liquidity` | Close entire position |
| `partial_remove` | Remove portion of position |
| `rebalance` | Adjust bin range |
| `hold` | No action |

## Risk Checklist

Before adding liquidity, Claude verifies:

- [ ] TVL > $100k (avoid thin pools)
- [ ] 24h volume > 10% of TVL (active trading)
- [ ] Volume trend: stable or increasing
- [ ] Multiple active traders (not single whale)
- [ ] APR is sustainable (not promotional)
- [ ] Position size < 20% of available balance

## Example Decision Flow

```
1. Claude calls fetch_pools(limit: 15, min_tvl: 100000)
   -> Returns top 15 pools by fees

2. Claude identifies SOL-USDC with high APR
   -> Calls get_pool_details(pool_address)

3. Claude analyzes:
   - 24h volume: $5.2M (good)
   - Fee APR: 45% (sustainable)
   - Price stability: low volatility last 4h
   - Active skills: warning-dlmm-low-tvl applies? No

4. Claude calls submit_decision:
   action: add_liquidity
   target: SOL-USDC
   amount_usd: 400
   strategy: spot
   confidence: 0.78
```

## Metrics Tracked

| Metric | Description |
|--------|-------------|
| Fees earned | Total fees captured |
| IL (Impermanent Loss) | Value lost to price divergence |
| Net P&L | Fees - IL |
| Time in range | % of time price stayed in range |
| APR realized | Actual annualized return |

## Common Warning Skills

```markdown
# Warning: Low TVL Pools

Avoid pools with TVL < $50k:
- Thin liquidity = high slippage
- Often promotional APRs that won't last
- Higher IL risk from large trades

# Warning: Declining Volume

Check 7-day volume trend before entry:
- Declining volume = dying pool
- Fees will drop
- May become difficult to exit
```

## Related Documentation

- [Meteora Client](../clients/meteora.md) - API details
- [MCP Server Tools](../mcp-server/tools.md) - All available tools
- [Paper Trading](../trading/paper-trading.md) - Testing positions
