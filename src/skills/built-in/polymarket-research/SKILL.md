---
name: polymarket-research
description: Research and trading strategies for Polymarket prediction markets. Use when evaluating markets, buying YES/NO shares, analyzing event probabilities, or timing entries.
allowed-tools: polymarket_fetch_markets, polymarket_buy_shares, polymarket_sell_shares, polymarket_research
---

# Polymarket Trading Strategy

## When to Use
- Evaluating prediction market opportunities
- Deciding between YES and NO positions
- Timing market entries and exits
- Researching event outcomes

## Core Principles

### 1. Edge Requirements
- Only trade when you have information edge
- Market is efficient - obvious mispricings are rare
- Your edge: faster research, domain expertise, contrarian view

### 2. Position Sizing
- Max 20% of polymarket balance per market
- Diversify across 3-5 uncorrelated events
- Higher confidence = larger position (up to limit)

### 3. Time Horizon
- Short-term (<1 week): News-driven, volatile
- Medium-term (1-4 weeks): Event-driven, research edge
- Long-term (>1 month): Capital inefficient, avoid

## Market Selection Criteria

### Good Markets
- High liquidity (volume > $100k)
- Clear resolution criteria
- Reasonable time to resolution
- Mispriced based on your research

### Avoid These Markets
- Low liquidity (wide spreads eat profits)
- Ambiguous resolution criteria
- Very long duration (capital locked)
- Markets you have no edge on

## Research Framework

### 1. Gather Information
- Official sources (government, organizations)
- Expert opinions
- Historical precedent
- Sentiment analysis

### 2. Assess Market Pricing
- Current YES/NO prices
- Historical price movement
- Volume and liquidity depth
- Spread between bid/ask

### 3. Calculate Expected Value
```
EV = (Your Probability × Win Amount) - (1 - Your Probability × Loss Amount)
```
Only trade if EV > 5% of position size

## Entry Strategies

### Contrarian Entry
- Market overreacts to news
- Price moves >10% on low-quality information
- Fade the move if fundamentals unchanged

### Momentum Entry
- Clear trend forming
- New information validates direction
- Enter on pullback, not breakout

### Value Entry
- Market significantly mispriced vs your research
- No immediate catalyst needed
- Patient accumulation over days

## Exit Strategies

### Take Profit
- Scale out as price approaches your target probability
- Leave 20% runner for full resolution
- Don't get greedy near 90%+ levels

### Stop Loss
- Exit if thesis invalidated by new information
- Exit if better opportunity emerges
- Don't average down on losing thesis

## Warning Signs

### Avoid Markets With
- Resolution disputes ongoing
- Manipulated volume (wash trading)
- Unclear or changing rules
- Your edge is "it feels wrong"

### Red Flags in Pricing
- 95%+ certainty = little upside, max downside
- Price hasn't moved on major news = you're missing something
- Extreme volume spike = informed traders know something

## Checklist Before Buying Shares
- [ ] Liquidity adequate (spread < 5%)
- [ ] Resolution criteria clear
- [ ] Time to resolution reasonable
- [ ] Your probability differs from market by >10%
- [ ] Research documented (not just vibes)
- [ ] Position size <= 20% of balance
- [ ] EV calculation positive
