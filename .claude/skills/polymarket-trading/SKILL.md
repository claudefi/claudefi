---
name: polymarket-trading
description: |
  Prediction market trading on Polymarket. Use for probability assessment,
  edge finding, event analysis, and position management on binary outcomes.
  Triggers on prediction markets, Polymarket, betting, or probability questions.
version: 1.0.0
author: claudefi
tags: [polymarket, prediction, betting, probability, events]
---

# Prediction Market Trading

Specialized knowledge for trading prediction markets on Polymarket.

## When to Use This Skill

- Analyzing prediction market opportunities
- Finding mispriced probabilities
- Event outcome assessment
- Position sizing based on edge
- Managing prediction market portfolio

## Core Concepts

### How Prediction Markets Work

- **YES/NO Shares**: Buy YES if event happens, NO if it won't
- **Price = Probability**: YES at $0.60 = market thinks 60% likely
- **Payout**: Correct shares pay $1, incorrect pay $0
- **Edge**: Profit when YOUR probability differs from market

### Finding Edge

You have edge when:
```
Your Estimated Probability > Market Price → Buy YES
Your Estimated Probability < (1 - Market Price) → Buy NO
```

**Example:**
- Market: YES at $0.40 (40% implied)
- Your estimate: 60% likely
- Edge: +20% → Strong BUY YES

## Decision Framework

### Where to Look for Edge

1. **Extreme Probabilities**
   - <15% YES: Potential contrarian YES plays
   - >85% YES: Potential contrarian NO plays
   - Market often overconfident at extremes

2. **News Events**
   - Breaking news not yet priced in
   - Misinterpreted announcements
   - Time zone arbitrage

3. **Domain Expertise**
   - Categories you understand deeply
   - Information advantages
   - Specialist knowledge

### What to Avoid

- Markets closing <24h without strong conviction
- Low liquidity markets (hard to exit)
- Events outside your knowledge
- Correlated positions (same risk)

## Risk Management

### Position Sizing (Simplified Kelly)

| Edge | Confidence | Suggested Size |
|------|------------|----------------|
| >30% | High | 15-20% of portfolio |
| 20-30% | High | 10-15% |
| 10-20% | Medium | 5-10% |
| <10% | Low | Skip or 2-5% max |

**Never full Kelly** - use half or quarter Kelly for safety.

### Portfolio Rules

- **Max 20% per market** - diversify
- **Max 40% correlated** - don't overload on related events
- **Watch time decay** - markets near expiry are risky
- **Liquidity buffer** - always be able to exit

## Decision Format

```json
{
  "action": "buy_yes" | "buy_no" | "sell" | "hold",
  "target": "CONDITION_ID",
  "amountUsd": 100,
  "reasoning": "Why market is mispriced",
  "confidence": 0.75
}
```

## Categories to Watch

### Politics
- Elections, policy decisions
- High liquidity, lots of edge opportunities
- Research polling, expert analysis

### Crypto
- Price predictions, protocol events
- Domain expertise advantage
- Technical knowledge helps

### Sports
- Game outcomes, player performance
- Requires sports knowledge
- Often efficient (hard to beat)

### Events
- Product launches, court cases
- Insider knowledge edges
- Time-sensitive information

## Common Mistakes to Avoid

1. **Overconfidence**: Your estimate isn't always better
2. **Ignoring Base Rates**: Rare events are usually rare
3. **Recency Bias**: One data point isn't a trend
4. **Confirmation Bias**: Seeking confirming evidence
5. **Early Exit**: Selling winners before resolution

## Holding Strategy

- **Let winners ride**: If thesis intact, hold to resolution
- **Don't exit for small gains**: +10-20% unrealized isn't reason to sell
- **Only sell when**: Thesis invalidated, market at fair value, rebalancing
- **Binary resolution**: Hold conviction positions if thesis strong

## Research Process

1. **Read the question** carefully - exact wording matters
2. **Check resolution criteria** - how is YES/NO determined?
3. **Research current state** - what does latest info say?
4. **Estimate probability** - your honest assessment
5. **Compare to market** - is there edge?
6. **Size appropriately** - based on edge and confidence

## Tools Available

When integrated with Claudefi MCP:
- `get_polymarket_markets` - Fetch markets with prices
- `buy_shares` - Purchase YES or NO shares
- `sell_shares` - Exit positions
- `get_positions` - View current positions
- `firecrawl_search` - Research events (when available)
