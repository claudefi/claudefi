---
name: portfolio-rebalance
description: Cross-domain portfolio rebalancing strategies. Use when evaluating portfolio allocation, moving funds between domains, or optimizing overall capital deployment.
---

# Portfolio Rebalancing Strategy

## When to Use
- Portfolio becomes unbalanced (one domain >40% of total)
- Domain underperforming significantly
- Major market condition change
- Quarterly review

## Target Allocation

### Default Balanced
- DLMM: 25%
- Perps: 25%
- Polymarket: 25%
- Spot: 25%

### Conservative (Bear Market)
- DLMM: 40% (stable yield)
- Perps: 10% (reduced risk)
- Polymarket: 30% (uncorrelated)
- Spot: 20% (reduced exposure)

### Aggressive (Bull Market)
- DLMM: 20%
- Perps: 30% (trend following)
- Polymarket: 20%
- Spot: 30% (momentum plays)

## Rebalancing Rules

### Trigger Conditions
- Any domain >40% of total portfolio
- Any domain <15% of total portfolio
- Domain drawdown >20% from peak
- Major market regime change

### Execution
1. Calculate current allocation percentages
2. Identify overweight and underweight domains
3. Close/reduce positions in overweight domain
4. Open/increase positions in underweight domain
5. Target moves of 5-10% at a time (not all at once)

## Domain Performance Assessment

### When to Reduce Allocation
- Win rate < 30% over last 20 trades
- Drawdown > 15% from starting balance
- Market conditions unfavorable for strategy

### When to Increase Allocation
- Win rate > 60% over last 20 trades
- Strategy edge clearly working
- Market conditions favorable

## Cross-Domain Correlation

### Low Correlation Pairs (Good for Diversification)
- DLMM + Polymarket (different drivers)
- Perps + Polymarket (different drivers)

### High Correlation Pairs (Careful of Concentration)
- DLMM + Spot (both affected by Solana market)
- Perps + Spot (both directional crypto bets)

## Checklist for Rebalancing
- [ ] Current allocation calculated
- [ ] Performance per domain reviewed
- [ ] Market conditions assessed
- [ ] Target allocation determined
- [ ] Moves executed gradually (not all at once)
- [ ] New allocation documented
