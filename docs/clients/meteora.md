# Meteora Client

The Meteora client provides access to Meteora DLMM (Dynamic Liquidity Market Maker) pools on Solana.

## Overview

**API Base**: `https://dlmm-api.meteora.ag`
**Chain**: Solana
**Documentation**: https://docs.meteora.ag/dlmm

## Initialization

```typescript
import { meteoraClient } from './clients/meteora/client';

// Client is pre-configured, no initialization needed
const pools = await meteoraClient.getTopPools(20);
```

## Methods

### `getTopPools(limit?, options?)`

Get top DLMM pools sorted by fees, TVL, or volume.

```typescript
const pools = await meteoraClient.getTopPools(20, {
  minTvl: 100000,
  sortBy: 'fees', // 'fees' | 'tvl' | 'volume'
});

// Returns
interface Pool {
  address: string;
  name: string;
  mintX: string;
  mintY: string;
  tokenXSymbol: string;
  tokenYSymbol: string;
  currentPrice: number;
  binStep: number;
  baseFeePercent: number;
  tvl: number;
  volume24h: number;
  fees24h: number;
  apr: number;
}
```

### `getPool(address)`

Get detailed information about a specific pool.

```typescript
const pool = await meteoraClient.getPool('pool_address');

// Returns extended pool info
interface PoolDetails extends Pool {
  currentBinId: number;
  liquidityDistribution: Array<{
    binId: number;
    liquidity: number;
    priceRange: { lower: number; upper: number };
  }>;
  recentTrades: Array<{
    timestamp: Date;
    side: 'buy' | 'sell';
    amount: number;
    price: number;
  }>;
}
```

### `getPositions(wallet?)`

Get LP positions for a wallet.

```typescript
// Paper trading - uses stored positions
const positions = await meteoraClient.getPositions();

// Real trading - queries on-chain
const positions = await meteoraClient.getPositions(walletAddress);

// Returns
interface LPPosition {
  positionAddress: string;
  poolAddress: string;
  poolName: string;
  lowerBinId: number;
  upperBinId: number;
  depositedX: number;
  depositedY: number;
  currentX: number;
  currentY: number;
  feesEarned: { x: number; y: number };
  valueUsd: number;
  impermanentLoss: number;
}
```

### `calculateEstimatedFees(pool, positionSizeUsd, days?)`

Estimate fees for a position.

```typescript
const estimate = meteoraClient.calculateEstimatedFees(pool, 1000, 7);

// Returns
interface FeeEstimate {
  dailyFees: number;
  weeklyFees: number;
  annualizedApr: number;
  assumptions: string;
}
```

### `simulateAddLiquidity(params)` (Paper Trading)

Simulate adding liquidity without executing on-chain.

```typescript
const result = await meteoraClient.simulateAddLiquidity({
  poolAddress: 'xxx',
  amountUsd: 500,
  strategy: 'spot', // 'spot' | 'curve' | 'bid_ask'
  binRange: { lower: -5, upper: 5 },
});

// Returns
interface SimulationResult {
  positionId: string; // paper_xxx
  poolAddress: string;
  amountX: number;
  amountY: number;
  bins: Array<{ binId: number; liquidity: number }>;
  estimatedDailyFees: number;
}
```

### `simulateRemoveLiquidity(positionId)` (Paper Trading)

Simulate removing liquidity.

```typescript
const result = await meteoraClient.simulateRemoveLiquidity('paper_xxx');

// Returns
interface RemovalResult {
  positionId: string;
  amountX: number;
  amountY: number;
  feesEarned: { x: number; y: number };
  totalValueUsd: number;
  pnl: number;
}
```

## Real Trading Methods

For mainnet trading, additional methods require wallet initialization:

### `initializeWallet(privateKey)`

```typescript
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';

const keypair = Keypair.fromSecretKey(bs58.decode(process.env.SOLANA_PRIVATE_KEY));
meteoraClient.initializeWallet(keypair);
```

### `addLiquidity(params)` (Real)

```typescript
const result = await meteoraClient.addLiquidity({
  poolAddress: 'xxx',
  amountUsd: 500,
  strategy: 'spot',
  binRange: { lower: -5, upper: 5 },
});

// Returns
interface TransactionResult {
  signature: string;
  positionAddress: string;
  status: 'confirmed' | 'finalized';
}
```

### `removeLiquidity(positionAddress)` (Real)

```typescript
const result = await meteoraClient.removeLiquidity(positionAddress);

// Returns
interface TransactionResult {
  signature: string;
  amountsReceived: { x: number; y: number };
  feesCollected: { x: number; y: number };
}
```

## Error Handling

```typescript
try {
  const pools = await meteoraClient.getTopPools(20);
} catch (error) {
  if (error.code === 'RATE_LIMITED') {
    // Wait and retry
    await sleep(1000);
    return meteoraClient.getTopPools(20);
  }
  if (error.code === 'NETWORK_ERROR') {
    // Retry with different RPC
  }
  throw error;
}
```

## Types

```typescript
// Pool
interface Pool {
  address: string;
  name: string;
  mintX: string;
  mintY: string;
  tokenXSymbol: string;
  tokenYSymbol: string;
  currentPrice: number;
  binStep: number;
  baseFeePercent: number;
  tvl: number;
  volume24h: number;
  fees24h: number;
  apr: number;
}

// Position
interface LPPosition {
  positionAddress: string;
  poolAddress: string;
  poolName: string;
  lowerBinId: number;
  upperBinId: number;
  depositedX: number;
  depositedY: number;
  currentX: number;
  currentY: number;
  feesEarned: { x: number; y: number };
  valueUsd: number;
  impermanentLoss: number;
}

// Strategy
type LiquidityStrategy = 'spot' | 'curve' | 'bid_ask';

// Bin Range
interface BinRange {
  lower: number; // Relative to current bin (negative = below)
  upper: number; // Relative to current bin (positive = above)
}
```

## Related Documentation

- [DLMM Domain](../domains/dlmm.md) - Trading strategies
- [Paper Trading](../trading/paper-trading.md) - Testing mode
- [MCP Server Tools](../mcp-server/tools.md) - Tool reference
