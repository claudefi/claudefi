# Perps Trading Skill

## Domain: Perpetual Futures on Hyperliquid

### Entry Signals (OPEN_LONG or OPEN_SHORT)

**Strong LONG signals:**
- RSI < 30 (oversold) + price at support
- Strong bullish divergence on RSI
- Funding rate very negative (shorts paying longs)
- Volume surge with price bounce from support
- Signal strength > 70 with bullish momentum

**Strong SHORT signals:**
- RSI > 70 (overbought) + price at resistance
- Strong bearish divergence on RSI
- Funding rate very positive (longs paying shorts)
- Volume surge with price rejection from resistance
- Signal strength < 30 with bearish momentum

### Exit Signals (CLOSE_POSITION)

**Close LONG when:**
- RSI > 70 (overbought)
- Price hits resistance
- Funding rate turns very positive
- Profit target reached (10-20% on margin)
- Stop loss triggered (5-10% loss on margin)
- Liquidation price within 10% of current price

**Close SHORT when:**
- RSI < 30 (oversold)
- Price hits support
- Funding rate turns very negative
- Profit target reached (10-20% on margin)
- Stop loss triggered (5-10% loss on margin)
- Liquidation price within 10% of current price

### Risk Management

1. **Leverage**: Use 2-5x max. Higher leverage = faster liquidation
2. **Position size**: Max 20% of balance per position
3. **Position limit**: Max 3 open positions
4. **Liquidation buffer**: Keep at least 15% distance to liquidation price
5. **Funding costs**: Consider 8h funding rate for overnight holds

### Decision Confidence Levels

- **0.9+**: Perfect setup (multiple confirming signals)
- **0.7-0.9**: Good setup (2+ signals aligning)
- **0.5-0.7**: Moderate setup (single signal)
- **< 0.5**: Weak setup (HOLD instead)

### Common Mistakes to Avoid

1. Over-leveraging (never use max leverage)
2. Ignoring funding rates on long holds
3. Not checking liquidation price
4. Adding to losing positions
5. FOMO entries without confirmation
