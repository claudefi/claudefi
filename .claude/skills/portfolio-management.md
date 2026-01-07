# Portfolio Management Skill

## Cross-Domain Risk Management

### Target Allocation

**Default allocation (balanced):**
- DLMM: 25% - Steady yield from LP fees
- Perps: 25% - High-risk directional trades
- Polymarket: 25% - Information-based bets
- Spot: 25% - Memecoin momentum plays

**Adjust based on conditions:**
- Risk-off: Increase DLMM (stable yields)
- Trending market: Increase Perps + Spot
- Event-driven: Increase Polymarket
- Volatility spike: Reduce all, hold cash

### Position Limits per Domain

| Domain | Max Positions | Max per Position |
|--------|--------------|------------------|
| DLMM | 3 | 30% of domain balance |
| Perps | 3 | 20% of domain balance |
| Polymarket | 3 | 20% of domain balance |
| Spot | 3 | 20% of domain balance |

### Rebalancing Rules

**When to rebalance:**
- Domain drifts >10% from target (e.g., 35% instead of 25%)
- After major win/loss (>20% portfolio change)
- Weekly review

**How to rebalance:**
1. Calculate current allocation
2. Identify overweight/underweight domains
3. Close positions in overweight domain
4. Open positions in underweight domain
5. Log rebalance decision

### Risk Assessment

**Portfolio health indicators:**

| Metric | Healthy | Warning | Critical |
|--------|---------|---------|----------|
| Total exposure | <80% | 80-95% | >95% |
| Single position | <15% | 15-25% | >25% |
| Domain concentration | <35% | 35-50% | >50% |
| Correlated positions | <3 | 3-5 | >5 |

### Daily Checklist

1. Check all open positions
2. Update current prices
3. Calculate unrealized P&L
4. Review liquidation distances (perps)
5. Check expiring markets (polymarket)
6. Identify underperforming positions
7. Look for new opportunities

### Decision Priority

When multiple opportunities exist:

1. **Risk reduction first**: Close dangerous positions
2. **Take profits**: Lock in gains >20%
3. **Cut losses**: Exit positions down >15%
4. **New entries**: Only if risk budget allows

### Correlation Awareness

**Correlated positions to avoid:**
- Multiple SOL pairs (DLMM + Spot)
- Long BTC perps + crypto polymarket YES
- Multiple memecoins from same narrative
- All positions in same direction (all longs)

### Emergency Procedures

**If portfolio drops >10% in 24h:**
1. Reduce all positions by 50%
2. Close any position at stop loss
3. Hold cash until conditions improve
4. Review what went wrong

**If single position drops >30%:**
1. Close position immediately
2. Log the loss and reason
3. Generate learning skill
4. Wait before re-entering
