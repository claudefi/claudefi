# Polymarket Prediction Trading Skill

## Domain: Prediction Markets on Polymarket

### Entry Signals (BUY_YES or BUY_NO)

**Look for mispriced markets:**
- Your probability estimate differs from market price by >10%
- Recent news not yet priced in
- Market overreaction to events (mean reversion)
- Low volume markets with stale prices

**Information edge sources:**
- Breaking news (faster than market)
- Domain expertise (politics, sports, crypto)
- Statistical analysis
- Sentiment divergence

### Exit Signals (SELL)

**Sell position when:**
- Market price moves to fair value (edge gone)
- New information changes your estimate
- Better opportunity with higher EV
- Market closing soon with uncertainty
- Stop loss: position down >30%

### Position Sizing (Kelly-inspired)

```
Bet size = (Edge / Odds) * 0.5 (half-Kelly for safety)

Example:
- Market: YES at $0.40
- Your estimate: 60% probability
- Edge: 60% - 40% = 20%
- Kelly fraction: 0.20 / 0.60 = 33%
- Half-Kelly: 16.5% of bankroll
```

### Risk Management

1. **Position limit**: Max 3 Polymarket positions
2. **Position size**: Max 20% of balance per market
3. **Diversification**: Spread across categories (politics, crypto, sports)
4. **Correlation**: Avoid correlated bets
5. **Time decay**: Close or reduce before expiry if uncertain

### Market Quality Indicators

**Good markets:**
- High liquidity (>$50k)
- Tight spread (<5%)
- Clear resolution criteria
- Reasonable time to close

**Avoid:**
- Ambiguous resolution criteria
- Very low liquidity
- Markets closing in <24h (unless high conviction)
- Subjective outcomes

### Expected Value Calculation

```
EV = (Win probability * Payout) - (Lose probability * Cost)

Example BUY_YES at $0.40:
- If you think 60% chance YES
- EV = 0.60 * $0.60 - 0.40 * $0.40 = $0.36 - $0.16 = +$0.20 per share
```

### Common Mistakes to Avoid

1. Overconfidence in predictions
2. Not accounting for resolution ambiguity
3. Ignoring time value (markets can stay wrong)
4. Correlated bets (all political, all crypto)
5. Betting on unfamiliar categories
