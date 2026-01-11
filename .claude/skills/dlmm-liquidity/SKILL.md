---
name: dlmm-liquidity
description: |
  Meteora DLMM liquidity provision on Solana. Use for concentrated liquidity
  decisions, pool analysis, LP strategy selection (spot/curve/bid-ask), and
  impermanent loss management. Triggers on LP questions, yield farming,
  Meteora pools, or liquidity provision requests.
version: 1.0.0
author: claudefi
tags: [solana, dlmm, meteora, liquidity, defi, yield]
---

# DLMM Liquidity Provision

Specialized knowledge for providing liquidity on Meteora DLMM (Dynamic Liquidity Market Maker).

## When to Use This Skill

- User asks about liquidity provision on Solana
- Analyzing Meteora pools for yield opportunities
- Deciding LP strategy (spot vs curve vs bid-ask)
- Managing impermanent loss risk
- Questions about concentrated liquidity

## Core Concepts

### What is DLMM?

DLMM is an advanced AMM that provides **concentrated liquidity**. Instead of spreading liquidity across all prices, you concentrate it in specific price ranges to earn more fees.

**Key Terms:**
- **Bins**: Discrete price points where liquidity lives
- **Active Bin**: Current market price bin - ONLY this bin earns fees
- **Fee APR**: Annual return from trading fees
- **Impermanent Loss (IL)**: Value change vs just holding the tokens

### Strategies

| Strategy | Risk | Reward | Best For |
|----------|------|--------|----------|
| **Spot** | High IL | Max fees | Stable pairs, range-bound markets |
| **Curve** | Lower IL | Moderate fees | Volatile pairs, uncertain direction |
| **Bid-Ask** | Directional | Variable | Strong directional conviction |

## Decision Framework

### Entry Criteria

1. **Pool Quality**
   - TVL > $100k (liquidity trap protection)
   - 24h Volume > $50k (fee generation)
   - APR sustainable (not just incentives)

2. **Token Requirements**
   - Must hold BOTH tokens in the pool
   - SOL-USDC pools safest (you likely have both)
   - For other pools: acquire tokens via Jupiter first

3. **Strategy Selection**
   ```
   Stable pair (USDC-USDT)?     -> Spot strategy
   Major pair (SOL-USDC)?       -> Curve strategy (default)
   Directional view?            -> Bid-Ask strategy
   Unsure?                      -> Curve (safest)
   ```

### Exit Criteria

- IL exceeds 20% of position value
- TVL drops 80%+ (liquidity leaving)
- APR drops below opportunity cost
- Better opportunities elsewhere

## Risk Management

- **Max 20% of capital per pool** - diversify
- **Minimum TVL**: $100k (prevents liquidity traps)
- **Position sizing**: $50-200 for testing, scale up with confidence
- **Monitor IL**: Exit if IL exceeds fees earned

## Common Pools

### Safest Options (You Likely Have These Tokens)
- **SOL-USDC**: `BGm1tav58oGcsQJehL9WXBFXF7D27vZsKefj4xJKD5Y`
- **SOL-USDT**: Various pools available

### High APR (Requires Token Acquisition)
- Check current pools for best opportunities
- Higher APR often = higher IL risk
- Meme pools volatile but lucrative

## Decision Format

```json
{
  "action": "add_liquidity" | "remove_liquidity" | "hold",
  "target": "FULL_POOL_ADDRESS",
  "amountUsd": 100,
  "strategy": "curve",
  "reasoning": "Why this pool, why now",
  "confidence": 0.75
}
```

## Tools Available

When integrated with Claudefi MCP:
- `get_meteora_pools` - Fetch top pools with metrics
- `simulate_swap` - Preview token buys for LP
- `add_liquidity` - Execute LP position
- `remove_liquidity` - Exit LP position
- `get_positions` - View current LP positions

## Learning Resources

- Meteora Docs: https://docs.meteora.ag/
- DLMM Strategies: https://docs.meteora.ag/dlmm/dlmm-strategies
