# Spot Domain (Memecoins)

The Spot domain trades trending tokens on Solana via Jupiter, focusing on momentum and new token opportunities.

## Overview

**Platform**: Jupiter (Solana DEX aggregator)
**Chain**: Solana
**Strategy**: Momentum trading, new token discovery

The spot domain focuses on high-volatility memecoins and trending tokens, using data from Jupiter's Tokens V2 API and GeckoTerminal.

## Data Sources

### Jupiter Tokens V2 API

Provides:
- Trending tokens by volume
- Top traded tokens
- New token listings
- Token metadata and stats

### GeckoTerminal

Provides:
- Detailed price data
- Liquidity information
- Holder statistics
- Trading activity

## Strategies

### Momentum Following

Ride tokens with strong volume and price action.

```
Entry signals:
- 24h volume increase > 200%
- Price up > 30% with increasing volume
- Social mentions rising (if available)

Exit signals:
- Volume declining while price rises
- RSI > 80 on 1h chart
- Holder concentration increasing
```

### New Token Plays

Early entry on promising new listings.

```
Filter criteria:
- Listed within 24-48 hours
- Liquidity > $50k
- Organic holder growth
- Not a known rug pattern

Position sizing: Smaller (5-10%)
Exit: Quick profits, don't hold
```

### Dip Buying

Accumulate quality tokens on pullbacks.

```
Criteria:
- Token with established track record
- Down > 20% from recent high
- Volume still healthy
- No fundamental issues (rugs, etc.)
```

## Available Tools

### `fetch_tokens`

Get trending or new tokens.

```typescript
{
  name: 'fetch_tokens',
  args: {
    category: 'trending',  // 'trending' | 'new' | 'top'
    limit: 20
  }
}
```

Returns:
- Token address (mint)
- Symbol and name
- Price and 24h change
- Volume (24h)
- Market cap
- Liquidity
- Holder count
- Age (days since creation)

### `get_token_details`

Get detailed information about a specific token.

```typescript
{
  name: 'get_token_details',
  args: {
    token_address: 'xxx...'
  }
}
```

Returns:
- Full token metadata
- Price history
- Top holders
- Recent transactions
- Social links
- Organic score

### `get_positions`

View held tokens.

```typescript
{
  name: 'get_positions',
  args: {}
}
```

Returns:
- Token info
- Amount held
- Entry price
- Current price
- Unrealized P&L
- Time held

### `get_balance`

Check USDC balance for trading.

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
    action: 'buy',
    target: 'BONK',
    token_address: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
    amount_usd: 200,
    confidence: 0.68,
    reasoning: 'Volume surge, healthy holder distribution...'
  }
}
```

## Actions

| Action | Description |
|--------|-------------|
| `buy` | Purchase token |
| `sell` | Sell entire position |
| `partial_sell` | Sell portion of position |
| `hold` | No action |

## Risk Checks

Before buying, Claude verifies:

- [ ] Liquidity > $50k (can exit position)
- [ ] Holder count > 1000 (distributed)
- [ ] Top 10 holders < 50% (not concentrated)
- [ ] Contract verified (if applicable)
- [ ] No rug indicators
- [ ] Position size < 15% of balance

## Example Decision Flow

```
1. Claude calls fetch_tokens(category: 'trending', limit: 15)
   -> Returns trending tokens by volume

2. Claude identifies WIF with high momentum:
   - 24h volume: +180%
   - Price: +45%
   - Liquidity: $2.3M

3. Claude calls get_token_details(token_address)
   -> Checks holder distribution, age, etc.

4. Claude analyzes:
   - Holder distribution: healthy (top 10 = 32%)
   - Token age: 14 days (not brand new)
   - Active skills: warning-spot-low-liquidity? No
   - Pattern skills: pattern-spot-volume-surge matches

5. Claude calls submit_decision:
   action: buy
   target: WIF
   amount_usd: 250
   confidence: 0.71
```

## Red Flags

Claude watches for these rug indicators:

| Red Flag | Risk |
|----------|------|
| Top holder > 20% | Dump risk |
| Liquidity < $30k | Can't exit |
| Mint authority active | Can mint more |
| Freeze authority active | Can freeze accounts |
| < 24 hours old | High risk |
| Volume 90%+ from one wallet | Wash trading |

## Metrics Tracked

| Metric | Description |
|--------|-------------|
| Win rate | % of profitable trades |
| Average gain (winners) | Mean profit on wins |
| Average loss (losers) | Mean loss on losses |
| Holding period | Average time in position |
| Best exit timing | Did we exit at good time? |

## Common Warning Skills

```markdown
# Warning: FOMO Buying

Avoid chasing tokens that are already up 100%+:
- Late entries often become exit liquidity
- Wait for pullback or pass

# Warning: Low Liquidity Tokens

Even "trending" tokens can have thin liquidity:
- Always check liquidity before size
- Max position = 2% of liquidity
```

## Related Documentation

- [Jupiter Client](../clients/jupiter.md) - API details
- [Risk Management](../trading/risk-management.md) - Risk controls
- [Paper Trading](../trading/paper-trading.md) - Testing positions
