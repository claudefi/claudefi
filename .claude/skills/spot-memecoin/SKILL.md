---
name: spot-memecoin
description: |
  Solana memecoin and spot trading via Jupiter. Use for token analysis,
  momentum trading, identifying runners, risk management on volatile assets.
  Triggers on memecoin questions, token trading, Jupiter swaps, or
  Solana token analysis.
version: 1.0.0
author: claudefi
tags: [solana, memecoin, trading, jupiter, spot, defi]
---

# Memecoin & Spot Trading

Specialized knowledge for trading memecoins and spot tokens on Solana via Jupiter.

## When to Use This Skill

- Analyzing trending Solana tokens
- Momentum trading decisions
- Identifying potential runners
- Risk management for volatile assets
- Token swap execution via Jupiter

## Core Concepts

### Memecoin Characteristics

Memecoins are high-risk, high-reward tokens driven by:
- Community strength and engagement
- Meme virality and narrative
- Speculation and momentum
- Social media buzz

### Key Metrics

| Metric | What It Tells You |
|--------|-------------------|
| **Volume** | High = momentum, Low = dying |
| **Liquidity** | Exit ability, slippage impact |
| **Price Action** | 24h change shows direction |
| **Market Cap** | Lower = more upside, more risk |

## Decision Framework

### Entry Signals (Need 2+ of these)

1. **Volume Surge**: 3x+ normal volume
2. **Social Buzz**: Twitter/Discord activity spiking
3. **Narrative**: New catalyst or meme moment
4. **Technical**: Healthy pullback in uptrend
5. **Liquidity**: >$100k (safe exit)

### Exit Signals

1. **Volume Death**: Declining with no bounce
2. **Failed Breakout**: Rejected at resistance
3. **Better Opportunity**: Capital reallocation
4. **Profit Target**: Hit planned exit
5. **Stop Loss**: -15% from entry

## Risk Management

- **Max 20% per token** - memecoins are volatile
- **Mental stops**: Exit losers quickly (-15%)
- **Take profits**: Memecoins dump fast (+50-100%)
- **Liquidity check**: Always verify exit liquidity
- **Position count**: Max 3 positions open

## Position Sizing Guide

| Confidence | Signal Strength | Size |
|------------|-----------------|------|
| High (>80%) | 3+ signals | $150-200 |
| Medium (60-80%) | 2 signals | $75-100 |
| Low (<60%) | 1 signal | Skip or $50 max |

## Token Categories

### Blue Chips (Lower Risk)
- BONK, WIF, POPCAT
- Established communities
- Higher liquidity
- Lower upside, lower downside

### Mid-Caps (Balanced)
- $1M-$50M market cap
- Growing communities
- Moderate liquidity
- Good risk/reward

### Low-Caps (High Risk)
- <$1M market cap
- New or small communities
- Lower liquidity
- Max upside, max risk

## Decision Format

```json
{
  "action": "buy" | "sell" | "hold",
  "target": "TOKEN_MINT_ADDRESS",
  "amountUsd": 100,
  "reasoning": "Why this token, why now",
  "confidence": 0.75
}
```

## Common Mistakes to Avoid

1. **FOMO Buying**: Chasing after 100%+ pumps
2. **No Stop Loss**: Holding losers hoping for recovery
3. **Overconcentration**: Too much in one token
4. **Low Liquidity**: Stuck in illiquid positions
5. **Ignoring Volume**: Trading dead coins

## Tools Available

When integrated with Claudefi MCP:
- `get_trending_tokens` - Fetch hot tokens from GeckoTerminal
- `get_token_info` - Detailed token metrics
- `simulate_swap` - Preview swap with slippage
- `execute_swap` - Execute via Jupiter
- `get_positions` - View current holdings

## Research Sources

- DexScreener: https://dexscreener.com/solana
- Birdeye: https://birdeye.so/
- GeckoTerminal: https://www.geckoterminal.com/solana
