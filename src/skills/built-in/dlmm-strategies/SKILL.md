---
name: dlmm-strategies
description: Concentrated liquidity strategies for Meteora DLMM pools. Use when adding liquidity, analyzing bin strategies, optimizing LP positions, or evaluating pool opportunities.
allowed-tools: dlmm_fetch_pools, dlmm_add_liquidity, dlmm_remove_liquidity, dlmm_get_positions
---

# DLMM Liquidity Provision Strategy

## When to Use
- Opening new DLMM positions
- Rebalancing existing LP positions
- Analyzing bin distribution
- Evaluating pool APR opportunities

## Key Principles

### 1. Bin Width Selection
- **Majors (SOL, ETH, BTC)**: Concentrate within 2-5% of current price
- **Stablecoins**: Tight bins, 0.1-0.5% range
- **Volatile memecoins**: Wider bins, 5-15% range
- **New tokens**: Start wide (10%+), tighten as volatility stabilizes

### 2. Entry Criteria
- Volume/TVL ratio > 0.3 (indicates active trading)
- 24h fees > $1000 (ensures meaningful yield)
- APR between 50-500% (too high = red flag)
- Bin step appropriate for asset volatility

### 3. Warning Signs
- APR > 1000% usually means low liquidity or high IL risk
- Volume/TVL ratio < 0.1 = dead pool
- Large price gaps between bins = manipulation risk
- Single-sided liquidity = impending dump

### 4. Position Sizing
- Max 20% of domain balance per position
- Split across 2-3 pools for diversification
- Never more than 3 active DLMM positions

## Rebalancing Rules

### When to Rebalance
- Price moves >50% outside your concentrated range
- APR drops below 30% of entry APR
- Better opportunities emerge in same pair

### When NOT to Rebalance
- Price temporarily spikes (wait for stability)
- Gas costs exceed expected gains
- Within 24h of opening (let position settle)

## Checklist Before Adding Liquidity
- [ ] Pool TVL > $100k
- [ ] 24h volume > $50k
- [ ] APR realistic (50-500%)
- [ ] Bin step matches volatility
- [ ] No recent rug signs on token
- [ ] Position size < 20% of balance
