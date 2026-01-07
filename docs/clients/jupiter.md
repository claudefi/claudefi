# Jupiter Client

The Jupiter client provides access to token swaps and pricing on Solana via Jupiter aggregator.

## Overview

**Swap API**: `https://quote-api.jup.ag/v6`
**Tokens API**: `https://tokens.jup.ag/tokens/v2`
**Chain**: Solana
**Documentation**: https://dev.jup.ag/docs/swap-api

## Initialization

```typescript
import { jupiterClient, TOKENS } from './clients/jupiter/client';

// Client is pre-configured
const price = await jupiterClient.getPrice(TOKENS.SOL);
```

## Common Token Addresses

```typescript
const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  // ... more tokens
};
```

## Methods

### `getPrice(tokenMint)`

Get current price for a token in USD.

```typescript
const price = await jupiterClient.getPrice(TOKENS.SOL);
// Returns: 123.45
```

### `getPrices(tokenMints)`

Get prices for multiple tokens.

```typescript
const prices = await jupiterClient.getPrices([TOKENS.SOL, TOKENS.BONK]);

// Returns
interface PriceMap {
  [tokenMint: string]: number;
}
```

### `getTrendingTokens(limit?)`

Get trending tokens from Jupiter Tokens V2 API.

```typescript
const tokens = await jupiterClient.getTrendingTokens(20);

// Returns
interface TrendingToken {
  address: string;
  symbol: string;
  name: string;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
  holderCount: number;
  ageDays: number;
}
```

### `getNewTokens(limit?)`

Get recently listed tokens.

```typescript
const tokens = await jupiterClient.getNewTokens(20);
// Returns same structure as getTrendingTokens
```

### `getTokenInfo(tokenMint)`

Get detailed token information.

```typescript
const info = await jupiterClient.getTokenInfo(tokenMint);

// Returns
interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  fdv: number;
  liquidity: number;
  holderCount: number;
  topHolders: Array<{ address: string; percent: number }>;
  social: {
    twitter?: string;
    telegram?: string;
    website?: string;
  };
  mintAuthority: boolean;
  freezeAuthority: boolean;
}
```

### `getQuote(params)`

Get a swap quote.

```typescript
const quote = await jupiterClient.getQuote({
  inputMint: TOKENS.USDC,
  outputMint: tokenMint,
  amount: 100000000, // 100 USDC (6 decimals)
  slippageBps: 100, // 1%
});

// Returns
interface Quote {
  inputMint: string;
  outputMint: string;
  inputAmount: string;
  outputAmount: string;
  otherAmountThreshold: string;
  priceImpactPct: number;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
  }>;
}
```

### `getQuoteUsd(params)`

Get a quote using USD amount.

```typescript
const quote = await jupiterClient.getQuoteUsd({
  inputMint: TOKENS.USDC,
  outputMint: tokenMint,
  amountUsd: 100, // $100
  slippageBps: 100,
});
```

### `simulateSwap(params)` (Paper Trading)

Simulate a swap without executing.

```typescript
const result = await jupiterClient.simulateSwap({
  inputMint: TOKENS.USDC,
  outputMint: tokenMint,
  amountUsd: 100,
});

// Returns
interface SimulationResult {
  orderId: string; // paper_xxx
  inputMint: string;
  outputMint: string;
  inputAmount: number;
  outputAmount: number;
  executionPrice: number;
  priceImpact: number;
}
```

## Real Trading Methods

### `initializeWallet(keypair)`

Initialize wallet for real trading.

```typescript
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const keypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
jupiterClient.initializeWallet(keypair);
```

### `buyToken(params)`

Execute a buy swap.

```typescript
const result = await jupiterClient.buyToken({
  tokenMint: tokenMint,
  amountUsd: 100,
  slippageBps: 100,
});

// Returns
interface SwapResult {
  signature: string;
  inputAmount: number;
  outputAmount: number;
  executionPrice: number;
  fee: number;
}
```

### `sellToken(params)`

Execute a sell swap.

```typescript
const result = await jupiterClient.sellToken({
  tokenMint: tokenMint,
  amount: tokenAmount, // In token units
  slippageBps: 100,
});
```

### `sellAllToken(tokenMint)`

Sell entire balance of a token.

```typescript
const result = await jupiterClient.sellAllToken(tokenMint);
```

## Wallet Operations

### `getWalletBalance()`

Get SOL and token balances.

```typescript
const balances = await jupiterClient.getWalletBalance();

// Returns
interface WalletBalance {
  sol: number;
  tokens: Array<{
    mint: string;
    symbol: string;
    amount: number;
    valueUsd: number;
  }>;
  totalValueUsd: number;
}
```

### `getTokenBalance(tokenMint)`

Get balance for a specific token.

```typescript
const balance = await jupiterClient.getTokenBalance(TOKENS.BONK);
// Returns: 1000000 (raw amount)
```

## Error Handling

```typescript
try {
  const quote = await jupiterClient.getQuote(params);
} catch (error) {
  if (error.code === 'NO_ROUTE') {
    console.log('No swap route available for this pair');
  } else if (error.code === 'INSUFFICIENT_LIQUIDITY') {
    console.log('Not enough liquidity for this size');
  } else if (error.code === 'SLIPPAGE_EXCEEDED') {
    console.log('Price moved too much');
  }
}
```

## Types

```typescript
// Quote parameters
interface QuoteParams {
  inputMint: string;
  outputMint: string;
  amount: number; // In smallest units
  slippageBps?: number; // Default: 50 (0.5%)
}

// USD quote parameters
interface QuoteUsdParams {
  inputMint: string;
  outputMint: string;
  amountUsd: number;
  slippageBps?: number;
}

// Swap parameters
interface SwapParams {
  tokenMint: string;
  amountUsd?: number;
  amount?: number;
  slippageBps?: number;
}

// Token info
interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  price: number;
  priceChange24h: number;
  volume24h: number;
  marketCap: number;
  liquidity: number;
  holderCount: number;
  mintAuthority: boolean;
  freezeAuthority: boolean;
}
```

## Related Documentation

- [Spot Domain](../domains/spot.md) - Trading strategies
- [Paper Trading](../trading/paper-trading.md) - Testing mode
- [MCP Server Tools](../mcp-server/tools.md) - Tool reference
