---
name: risk-assessment
description: Portfolio-wide risk assessment and management. Use when evaluating overall risk exposure, before major trades, or during market volatility.
---

# Risk Assessment Framework

## When to Use
- Before any trade >10% of domain balance
- Daily portfolio review
- During high volatility periods
- After significant losses

## Risk Metrics to Monitor

### Position-Level Risk
- Individual position size vs balance
- Leverage used (perps)
- Liquidation distance (perps)
- IL exposure (DLMM)
- Time to resolution (polymarket)

### Portfolio-Level Risk
- Total capital at risk
- Correlation between positions
- Concentration in single asset/event
- Cash buffer available

### Market-Level Risk
- Overall crypto market trend
- Volatility regime (VIX equivalent)
- Funding rates across perps
- Liquidity conditions

## Risk Limits

### Hard Limits (Never Exceed)
- Single position: 20% of domain balance
- Single domain: 40% of total portfolio
- Total leverage exposure: 2x portfolio value
- Cash buffer: Always keep 10% liquid

### Soft Limits (Require Justification)
- Correlated positions: 30% of portfolio
- Same asset across domains: 25% of portfolio
- High-risk positions (memes, high leverage): 15% of portfolio

## Risk Scenarios

### Scenario 1: Market Crash (-30%)
Calculate impact on each position:
- DLMM: IL + potential LP loss
- Perps: Liquidation risk
- Polymarket: Usually uncorrelated
- Spot: Full exposure to drop

### Scenario 2: Flash Crash (-50% then recovery)
- Perps positions likely liquidated
- DLMM IL crystalized if panic removed
- Spot depends on if held or panic sold

### Scenario 3: Specific Asset Collapse
- How much exposure to that asset across all domains?
- If >20% portfolio, overexposed

## Risk Reduction Actions

### Immediate (Crisis Mode)
- Close all leveraged positions
- Remove concentrated liquidity
- Move to stables
- Wait for clarity

### Gradual (Risk Management)
- Reduce position sizes by 50%
- Lower leverage
- Widen DLMM ranges
- Add stop losses

### Preventive (Before Risk Events)
- No new positions before known volatility events
- Reduce leverage ahead of announcements
- Keep higher cash buffer
- Avoid illiquid positions

## Daily Risk Checklist
- [ ] Total portfolio value calculated
- [ ] Per-domain allocation checked
- [ ] No position >20% of domain
- [ ] Perps liquidation prices reviewed
- [ ] Market conditions assessed
- [ ] Upcoming risk events identified
- [ ] Cash buffer adequate (>10%)

## When to Stop Trading

### Pause Conditions
- Portfolio down >10% in single day
- 3+ consecutive losing trades
- High uncertainty about market direction
- Personal emotional state compromised

### Resume Conditions
- Market stabilized
- Clear thesis for next trade
- Position sizes reduced
- Risk limits re-established
