# Polymarket Domain

The Polymarket domain trades prediction markets based on probability estimation and research.

## Overview

**Platform**: Polymarket
**Chain**: Polygon
**Strategy**: Identify mispriced markets through research

Polymarket is a prediction market where you buy YES or NO shares on real-world events. Shares pay $1 if correct, $0 if wrong.

## Core Concept

```
Market: "Will Bitcoin reach $100k by end of 2025?"
YES price: $0.55 (market says 55% probability)
Your estimate: 70% probability

Edge = Your estimate - Market price = 15%
Action: BUY YES
```

## Strategies

### Probability Edge

Find markets where your estimate differs significantly from the market.

```
Minimum edge: 10%+ before considering
High conviction: 20%+ edge
Position size: Based on Kelly criterion

Kelly % = (edge / odds) * bankroll
```

### Near-Resolution Plays

Markets close to their resolution date often have the clearest edge.

```
Focus on:
- Markets resolving within 72 hours
- Clear resolution criteria
- Unambiguous outcomes

Example: "Will it rain in NYC tomorrow?" (weather data is definitive)
```

### Research-Based Edge

Use web search to gather information the market may not have priced in.

```
Research triggers:
- Recent news affecting the market
- Expert opinions
- Historical base rates
- Comparable events
```

## Available Tools

### `fetch_markets`

Get active prediction markets.

```typescript
{
  name: 'fetch_markets',
  args: {
    category: 'trending',  // 'trending' | 'ending_soon' | 'popular'
    limit: 20
  }
}
```

Returns:
- Market ID
- Question
- YES/NO prices
- Volume
- Liquidity
- End date
- Category

### `web_search`

Research market topics.

```typescript
{
  name: 'web_search',
  args: {
    query: 'Fed interest rate decision January 2025'
  }
}
```

Returns:
- Search results
- Snippets
- Dates
- Sources

### `get_positions`

View current market positions.

```typescript
{
  name: 'get_positions',
  args: {}
}
```

Returns:
- Market info
- Position (YES/NO)
- Shares held
- Entry price
- Current price
- Unrealized P&L

### `get_balance`

Check available USDC balance.

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
    action: 'buy_yes',
    target: 'Will Bitcoin reach $100k?',
    market_id: 'xxx',
    amount_usd: 150,
    estimated_probability: 0.70,
    market_price: 0.55,
    confidence: 0.75,
    reasoning: 'Based on historical patterns and ETF flows...'
  }
}
```

## Actions

| Action | Description |
|--------|-------------|
| `buy_yes` | Buy YES shares |
| `buy_no` | Buy NO shares |
| `sell` | Sell entire position |
| `partial_sell` | Sell portion of position |
| `hold` | No action |

## Edge Calculation

```typescript
function calculateEdge(yourEstimate: number, marketPrice: number, side: 'yes' | 'no'): number {
  if (side === 'yes') {
    return yourEstimate - marketPrice;
  } else {
    return (1 - yourEstimate) - (1 - marketPrice);
  }
}

// Example
const edge = calculateEdge(0.70, 0.55, 'yes');
// edge = 0.15 (15%)
```

## Kelly Criterion

Position sizing based on edge and odds:

```typescript
function kellyBet(yourProbability: number, marketPrice: number, bankroll: number): number {
  // Kelly formula: (bp - q) / b
  // where b = odds, p = probability of winning, q = probability of losing

  const odds = (1 / marketPrice) - 1;
  const p = yourProbability;
  const q = 1 - p;

  const kellyFraction = (odds * p - q) / odds;

  // Use half-Kelly for safety
  const halfKelly = kellyFraction / 2;

  return Math.max(0, bankroll * halfKelly);
}

// Example
const betSize = kellyBet(0.70, 0.55, 1000);
// Suggests ~$150 bet
```

## Example Decision Flow

```
1. Claude calls fetch_markets(category: 'ending_soon', limit: 15)
   -> Returns markets ending within 72 hours

2. Claude identifies interesting market:
   "Will Fed cut rates in January 2025?"
   YES: $0.45, NO: $0.55

3. Claude calls web_search('Fed January 2025 rate decision')
   -> Gathers recent news, Fed statements, economist forecasts

4. Claude estimates:
   - Recent Fed rhetoric: hawkish
   - Inflation data: still elevated
   - Historical base rate: ~30% for cuts
   -> Estimate: 35% YES

5. Claude calculates:
   - My estimate: 35% YES (65% NO)
   - Market: 45% YES (55% NO)
   - Edge on NO: 10%

6. Claude calls submit_decision:
   action: buy_no
   target: 'Will Fed cut rates?'
   amount_usd: 120
   estimated_probability: 0.35
   market_price: 0.45
   confidence: 0.72
```

## Research Guidelines

When researching markets:

1. **Check recency** - Recent news matters most
2. **Multiple sources** - Don't rely on single source
3. **Expert opinions** - Weight credible experts higher
4. **Base rates** - Historical frequency of similar events
5. **Resolution criteria** - Understand exactly what triggers YES/NO

## Common Warning Skills

```markdown
# Warning: Ambiguous Resolution

Avoid markets with unclear resolution criteria:
- "Will X be successful?" (subjective)
- Complex multi-condition markets
- Markets with disputed outcomes history

# Warning: Low Liquidity Markets

Thin markets can move against you:
- Check order book depth
- Large orders may get poor fills
- Exit may be difficult
```

## Metrics Tracked

| Metric | Description |
|--------|-------------|
| Brier score | Calibration of probability estimates |
| ROI | Return on investment |
| Win rate | % of correct predictions |
| Average edge | Mean edge when entering |
| Resolution accuracy | How close estimates were to outcomes |

## Related Documentation

- [Polymarket Client](../clients/polymarket.md) - API details
- [Risk Management](../trading/risk-management.md) - Risk controls
- [Paper Trading](../trading/paper-trading.md) - Testing positions
