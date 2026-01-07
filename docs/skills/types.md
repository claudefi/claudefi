# Skill Types

claudefi generates four types of skills, each serving a different purpose in the learning system.

## Warning Skills

**Purpose**: Prevent repeating mistakes that led to losses.

**Trigger**: Position closes with loss > 10%

**TTL**: 60 days

**Structure**:
```markdown
# Warning: [Domain] [Pattern Name]

*Generated from loss on [date]*
*P&L: -$X (-X%)*
*Domain: [domain]*

---

## Pattern to Recognize

[What conditions led to this loss]

## What Went Wrong

[Analysis of the mistake]

## Better Approach

[How to avoid this in the future]

## Checklist

[Verification steps before similar trades]
```

**Example**:
```markdown
# Warning: DLMM Declining Volume Entry

*Generated from loss on 2025-01-07*
*P&L: -$89.50 (-11.2%)*
*Domain: dlmm*

---

## Pattern to Recognize

- High APR (>100%) on low-volume pool
- Volume trending down over 7 days
- Fee income primarily from single large trader

## What Went Wrong

Entered a pool with attractive APR that was artificially inflated
by promotional incentives and single-whale activity. When the whale
left, volume collapsed and fees dried up.

## Better Approach

1. Check 7-day volume trend, not just current snapshot
2. Verify fee income comes from diverse trading activity
3. Be skeptical of APRs > 100% without clear catalyst

## Checklist

- [ ] 7d volume trend: stable or increasing
- [ ] Top trader < 30% of volume
- [ ] APR sustainable without incentives
```

## Pattern Skills

**Purpose**: Replicate conditions that led to successful trades.

**Trigger**: Position closes with profit > 20%

**TTL**: 90 days

**Structure**:
```markdown
# Pattern: [Domain] [Pattern Name]

*Generated from win on [date]*
*P&L: +$X (+X%)*
*Domain: [domain]*

---

## Pattern Conditions

[Market conditions and signals present]

## Why It Worked

[Analysis of success factors]

## Entry Criteria

[When to look for this pattern]

## Risk Management

[Position sizing and exits]
```

**Example**:
```markdown
# Pattern: Perps Funding Rate Reversal

*Generated from win on 2025-01-04*
*P&L: +$210.00 (+28.5%)*
*Domain: perps*

---

## Pattern Conditions

- Funding rate > 0.1% (extremely high)
- Open interest at local highs
- Price extended from 20-day MA
- RSI > 75 on 4h chart

## Why It Worked

Extreme funding rates indicate overcrowded positioning. When funding
exceeds 0.1%, the cost of holding becomes unsustainable and triggers
unwinds. Combined with extended price action, this creates high-probability
short setups.

## Entry Criteria

1. Funding rate > 0.08%
2. Price > 5% above 20-day MA
3. Open interest increasing (crowding)
4. Enter short on first red 1h candle after funding peak

## Risk Management

- Stop loss: 2% above entry
- Take profit: Target -5% to -10% move
- Position size: 10-15% of balance
- Leverage: Max 5x
```

## Strategy Skills

**Purpose**: Comprehensive playbooks based on accumulated experience.

**Trigger**: After every 10 trades in a domain (periodic generation)

**TTL**: 180 days

**Structure**:
```markdown
# Strategy: [Domain] [Strategy Name]

*Generated from [N] trades, [date range]*
*Win Rate: X%, Avg P&L: X%*
*Domain: [domain]*

---

## Market Context

[When this strategy applies]

## Core Approach

[The fundamental strategy]

## Entry Rules

[Specific entry criteria]

## Exit Rules

[Position management]

## Position Sizing

[How to size positions]

## What to Avoid

[Common pitfalls]

## Performance Notes

[Observations from trades]
```

**Example**:
```markdown
# Strategy: Polymarket Election Season

*Generated from 15 trades, Oct-Nov 2024*
*Win Rate: 73%, Avg P&L: +12.5%*
*Domain: polymarket*

---

## Market Context

Election markets during final 3 weeks before resolution.
Markets become more efficient but also more volatile.

## Core Approach

Focus on state-level races where polling is more reliable than
national aggregates. Look for markets lagging behind recent polling shifts.

## Entry Rules

1. Poll aggregate moved >5% in past week
2. Market hasn't fully adjusted to new polls
3. Edge > 10% between estimate and market price
4. Resolution within 21 days

## Exit Rules

- Exit at 50% profit
- Exit if edge drops below 5%
- Exit if new information contradicts thesis

## Position Sizing

- Kelly half: Use half-Kelly for election markets
- Max position: 15% of balance
- Diversify across 3-5 races

## What to Avoid

- Late-breaking news periods (48h before election)
- Highly correlated bets (all same-party races)
- Contested/ambiguous resolution markets

## Performance Notes

- Highest success on state races with clear polling
- Lower success on binary national outcomes
- Best entries 7-14 days before resolution
```

## Evolved Skills

**Purpose**: Combined wisdom from multiple similar skills.

**Trigger**: Skill merger finds 2+ similar skills

**TTL**: 180 days

**Structure**:
```markdown
# Evolved: [Domain] [Topic]

*Merged from [N] skills on [date]*
*Source skills: [skill names]*
*Combined effectiveness: X%*
*Domain: [domain]*

---

## Synthesized Insight

[Core lesson from combined experience]

## When This Applies

[Conditions where this wisdom is relevant]

## Key Principles

[Distilled guidance]

## Evidence

[Summary of supporting trades]
```

**Example**:
```markdown
# Evolved: DLMM Volume Quality

*Merged from 3 skills on 2025-01-08*
*Source skills: warning-dlmm-low-tvl, warning-dlmm-whale-volume, pattern-dlmm-organic-growth*
*Combined effectiveness: 78%*
*Domain: dlmm*

---

## Synthesized Insight

Volume QUALITY matters more than volume QUANTITY. A pool with $500k
daily volume from diverse traders consistently outperforms one with
$2M from a single whale.

## When This Applies

- Evaluating any DLMM pool for entry
- Comparing pools with similar APRs
- Deciding position size

## Key Principles

1. **Diversification**: Top trader should be < 20% of volume
2. **Consistency**: Volume should be stable across 7+ days
3. **Organic**: Growth should come from many small trades, not few large ones
4. **Sustainability**: High volume should generate proportional fees

## Evidence

- 3 losses from whale-dominated pools (avg -14%)
- 5 wins from diversified pools (avg +18%)
- Volume diversity correlates 0.7 with positive outcomes
```

## TTL Configuration

```typescript
const SKILL_TTL_DAYS = {
  warning: 60,    // Market conditions change; warnings become stale
  pattern: 90,    // Patterns have medium shelf life
  strategy: 180,  // Comprehensive strategies last longer
  evolved: 180,   // Merged wisdom is durable
};
```

## Related Documentation

- [Skills Overview](./overview.md) - System introduction
- [Skill Generation](./generation.md) - Creation process
- [Skill Effectiveness](./effectiveness.md) - Tracking performance
