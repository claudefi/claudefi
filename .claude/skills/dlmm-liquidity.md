# DLMM Liquidity Provision Skill

## Domain: Meteora DLMM Pools on Solana

### Entry Signals (ADD_LIQUIDITY)

**High-quality pool characteristics:**
- APR > 50% (good fee generation)
- 24h fees > $1000 (active trading)
- TVL > $100k (sufficient liquidity)
- Volume/TVL ratio > 0.5 (capital efficiency)
- Stable or trending pair (not dying coins)

**Best pool types:**
1. **SOL pairs**: SOL-USDC, SOL-USDT - high volume, stable
2. **Major tokens**: BTC, ETH pairs - less IL risk
3. **Stablecoin pairs**: USDC-USDT - minimal IL
4. **Trending memes**: High APR but higher risk

### Exit Signals (REMOVE_LIQUIDITY)

**Remove liquidity when:**
- APR drops below 20% for 24+ hours
- Volume drops >50% from entry
- IL exceeds 5% of position
- Better opportunity elsewhere
- Pool TVL dropping rapidly
- Token in pool losing value fast

### Position Management

**Strategies:**
- **Spot**: Equal distribution around current price
- **Curve**: Concentrated around current price (higher fees, more IL)
- **Bid-Ask**: Asymmetric for directional view

### Risk Management

1. **Position limit**: Max 3 DLMM positions
2. **Position size**: Max 30% of DLMM balance per pool
3. **Diversification**: Spread across different pairs
4. **IL monitoring**: Check daily, exit if IL > 5%
5. **Pool health**: Exit if TVL drops >30% suddenly

### Fee Estimation

```
Estimated daily fees = (pool_fees_24h / pool_tvl) * your_position_value
```

Example: $50k fees on $1M TVL pool with $1000 position = $50/day

### Common Mistakes to Avoid

1. Chasing highest APR without checking volume
2. LPing in dying/rugging tokens
3. Ignoring impermanent loss
4. Not monitoring position health
5. Over-concentrating in one pool
