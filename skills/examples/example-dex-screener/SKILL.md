# DEX Screener Analysis

Fetch and analyze token data from DEX Screener for informed trading decisions.

## When to Use

Use this skill when you need to:
- Analyze a token's trading metrics (volume, liquidity, price action)
- Compare tokens across different DEXes
- Identify trending tokens on specific chains

## How It Works

1. Fetch token data from DEX Screener API
2. Parse key metrics: price, volume, liquidity, holders
3. Compare against baseline thresholds
4. Generate trading signals based on metrics

## Commands

- `/dex-screener <token_address>` - Analyze a specific token
- `/dex-screener trending <chain>` - Get trending tokens on a chain
- `/dex-screener compare <token1> <token2>` - Compare two tokens

## Example Usage

```
/dex-screener So11111111111111111111111111111111111111112

Analyzing SOL/USDC on Raydium...
- Price: $180.50
- 24h Volume: $45.2M
- Liquidity: $12.5M
- 24h Change: +5.2%

Signal: BULLISH - High volume with strong liquidity
```

## Configuration

No API key required - DEX Screener is a free API.

## Thresholds

| Metric | Minimum | Good | Excellent |
|--------|---------|------|-----------|
| 24h Volume | $100k | $1M | $10M |
| Liquidity | $50k | $500k | $5M |
| Holders | 100 | 1,000 | 10,000 |

## Notes

- Always verify token addresses to avoid scam tokens
- Consider volume/liquidity ratio for slippage estimation
- Check holder distribution for rug pull risks
