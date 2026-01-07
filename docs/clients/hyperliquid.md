# Hyperliquid Client

The Hyperliquid client provides access to perpetual futures trading on Hyperliquid.

## Overview

**Mainnet API**: `https://api.hyperliquid.xyz`
**Testnet API**: `https://api.hyperliquid-testnet.xyz`
**Chain**: Hyperliquid L1 (Arbitrum-based)
**Documentation**: https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api

## Initialization

```typescript
import { hyperliquidClient } from './clients/hyperliquid/client';

// Client is pre-configured for paper trading
const markets = await hyperliquidClient.getMarkets();

// For real trading, initialize with wallet
hyperliquidClient.initializeWallet('0x...');
```

## Methods

### `getMarkets(symbols?)`

Get perpetual markets with current prices and metadata.

```typescript
const markets = await hyperliquidClient.getMarkets();
// Or filter by symbols
const markets = await hyperliquidClient.getMarkets(['BTC', 'ETH', 'SOL']);

// Returns
interface Market {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  predictedFunding: number;
  openInterest: number;
  volume24h: number;
  priceChange24h: number;
  maxLeverage: number;
}
```

### `getMarketsWithIndicators(symbols?)`

Get markets with technical indicators.

```typescript
const markets = await hyperliquidClient.getMarketsWithIndicators();

// Returns extended market data
interface MarketWithIndicators extends Market {
  rsi14: number;
  ema20: number;
  ema50: number;
  atr14: number;
  volumeProfile: 'increasing' | 'decreasing' | 'stable';
}
```

### `getMarkPrice(symbol)`

Get current mark price for a symbol.

```typescript
const price = await hyperliquidClient.getMarkPrice('BTC');
// Returns: 45123.50
```

### `getPositions(wallet?)`

Get open positions.

```typescript
// Paper trading - uses stored positions
const positions = await hyperliquidClient.getPositions();

// Real trading - queries API
const positions = await hyperliquidClient.getPositions(walletAddress);

// Returns
interface Position {
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice: number;
  marginUsed: number;
}
```

### `getBalance(wallet?)`

Get account balance and margin info.

```typescript
const balance = await hyperliquidClient.getBalance();

// Returns
interface Balance {
  equity: number;
  availableBalance: number;
  usedMargin: number;
  marginRatio: number;
}
```

### `simulateOrder(symbol, side, sizeUsd, leverage?)` (Paper Trading)

Simulate opening a position.

```typescript
const result = await hyperliquidClient.simulateOrder('ETH', 'long', 500, 5);

// Returns
interface SimulationResult {
  orderId: string; // paper_xxx
  symbol: string;
  side: 'long' | 'short';
  size: number;
  entryPrice: number;
  leverage: number;
  liquidationPrice: number;
  marginUsed: number;
}
```

### `simulateClose(symbol)` (Paper Trading)

Simulate closing a position.

```typescript
const result = await hyperliquidClient.simulateClose('ETH');

// Returns
interface CloseResult {
  symbol: string;
  side: 'long' | 'short';
  closedSize: number;
  exitPrice: number;
  realizedPnl: number;
  holdingPeriodHours: number;
}
```

## Real Trading Methods

### `initializeWallet(privateKey)`

Initialize wallet for real trading.

```typescript
hyperliquidClient.initializeWallet(process.env.HYPERLIQUID_PRIVATE_KEY);
```

### `placeOrder(symbol, side, sizeUsd, leverage, options?)`

Place a market order.

```typescript
const result = await hyperliquidClient.placeOrder('BTC', 'long', 1000, 5, {
  reduceOnly: false,
  stopLoss: 44000,
  takeProfit: 48000,
});

// Returns
interface OrderResult {
  orderId: string;
  status: 'filled' | 'partial' | 'pending';
  filledSize: number;
  avgFillPrice: number;
  fee: number;
}
```

### `placeLimitOrder(symbol, side, sizeUsd, price, leverage, options?)`

Place a limit order.

```typescript
const result = await hyperliquidClient.placeLimitOrder(
  'ETH',
  'long',
  500,
  1900,  // limit price
  5,
  { timeInForce: 'GTC' }
);
```

### `closePosition(symbol, options?)`

Close an open position.

```typescript
const result = await hyperliquidClient.closePosition('ETH', {
  reduceOnly: true,
});

// Returns
interface CloseResult {
  orderId: string;
  exitPrice: number;
  realizedPnl: number;
  fee: number;
}
```

### `setStopLoss(symbol, price)`

Set stop loss for a position.

```typescript
await hyperliquidClient.setStopLoss('BTC', 44000);
```

### `setTakeProfit(symbol, price)`

Set take profit for a position.

```typescript
await hyperliquidClient.setTakeProfit('BTC', 48000);
```

## Funding Rate

### `getFundingRate(symbol)`

Get current and predicted funding rate.

```typescript
const funding = await hyperliquidClient.getFundingRate('BTC');

// Returns
interface FundingInfo {
  current: number;      // Current rate (8h)
  predicted: number;    // Predicted next rate
  nextFundingTime: Date;
}
```

## Order Book

### `getOrderBook(symbol, depth?)`

Get order book data.

```typescript
const book = await hyperliquidClient.getOrderBook('BTC', 10);

// Returns
interface OrderBook {
  bids: Array<{ price: number; size: number }>;
  asks: Array<{ price: number; size: number }>;
  spread: number;
  midPrice: number;
}
```

## Error Handling

```typescript
try {
  const result = await hyperliquidClient.placeOrder('BTC', 'long', 1000, 10);
} catch (error) {
  if (error.code === 'INSUFFICIENT_MARGIN') {
    console.log('Not enough margin for this position');
  } else if (error.code === 'MAX_LEVERAGE_EXCEEDED') {
    console.log('Leverage too high');
  } else if (error.code === 'RATE_LIMITED') {
    await sleep(1000);
    // Retry
  }
}
```

## Types

```typescript
// Position side
type Side = 'long' | 'short';

// Order type
type OrderType = 'market' | 'limit';

// Time in force
type TimeInForce = 'GTC' | 'IOC' | 'FOK';

// Market
interface Market {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  predictedFunding: number;
  openInterest: number;
  volume24h: number;
  priceChange24h: number;
  maxLeverage: number;
}

// Position
interface Position {
  symbol: string;
  side: Side;
  size: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnl: number;
  leverage: number;
  liquidationPrice: number;
  marginUsed: number;
}
```

## Related Documentation

- [Perps Domain](../domains/perps.md) - Trading strategies
- [Paper Trading](../trading/paper-trading.md) - Testing mode
- [Risk Management](../trading/risk-management.md) - Risk controls
