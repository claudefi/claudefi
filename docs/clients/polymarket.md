# Polymarket Client (Gamma API)

The Polymarket client provides access to prediction markets via the Gamma Markets API.

## Overview

**API Base**: `https://gamma-api.polymarket.com`
**Chain**: Polygon
**Documentation**: https://docs.polymarket.com/#gamma-markets-api

## Initialization

```typescript
import { gammaClient } from './clients/polymarket/client';

// Client is pre-configured
const markets = await gammaClient.getTrendingMarkets(20);
```

## Methods

### `getTrendingMarkets(limit?)`

Get trending prediction markets.

```typescript
const markets = await gammaClient.getTrendingMarkets(20);

// Returns
interface Market {
  id: string;
  question: string;
  description: string;
  category: string;
  outcomes: string[];
  outcomePrices: number[];  // Probability as decimal (0.55 = 55%)
  volume: number;
  liquidity: number;
  endDate: Date;
  resolved: boolean;
  resolvedOutcome?: string;
}
```

### `getMarketsEndingSoon(hours?)`

Get markets ending within specified hours.

```typescript
const markets = await gammaClient.getMarketsEndingSoon(72); // Within 72 hours
// Returns same structure as getTrendingMarkets
```

### `getPopularMarkets(limit?)`

Get markets by trading volume.

```typescript
const markets = await gammaClient.getPopularMarkets(20);
```

### `searchMarkets(query)`

Search markets by keyword.

```typescript
const markets = await gammaClient.searchMarkets('bitcoin');

// Returns markets where question or description contains 'bitcoin'
```

### `getMarket(marketId)`

Get detailed information about a specific market.

```typescript
const market = await gammaClient.getMarket('market_id');

// Returns extended market info
interface MarketDetails extends Market {
  resolutionSource: string;
  rules: string;
  orderBook: {
    bids: Array<{ price: number; size: number }>;
    asks: Array<{ price: number; size: number }>;
  };
  recentTrades: Array<{
    price: number;
    size: number;
    side: 'yes' | 'no';
    timestamp: Date;
  }>;
}
```

### `getPositions(wallet?)`

Get open positions.

```typescript
// Paper trading - uses stored positions
const positions = await gammaClient.getPositions();

// Real trading - queries API
const positions = await gammaClient.getPositions(walletAddress);

// Returns
interface Position {
  marketId: string;
  question: string;
  outcome: 'yes' | 'no';
  shares: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  valueUsd: number;
}
```

### `calculateKellyBet(probability, marketPrice, bankroll)`

Calculate optimal position size using Kelly criterion.

```typescript
const betSize = gammaClient.calculateKellyBet(
  70,     // Your probability estimate (%)
  0.55,   // Market price (55%)
  1000    // Bankroll
);

// Returns recommended bet size in USD
// Uses half-Kelly for safety
```

### `calculateEdge(yourProbability, marketPrice, side)`

Calculate your edge on a position.

```typescript
const edge = gammaClient.calculateEdge(0.70, 0.55, 'yes');
// Returns: 0.15 (15% edge)

const edge = gammaClient.calculateEdge(0.30, 0.55, 'no');
// Returns: 0.15 (15% edge on NO)
```

### `simulateBuy(marketId, outcome, amountUsd)` (Paper Trading)

Simulate buying shares.

```typescript
const result = await gammaClient.simulateBuy('market_id', 'yes', 100);

// Returns
interface SimulationResult {
  orderId: string; // paper_xxx
  marketId: string;
  outcome: 'yes' | 'no';
  shares: number;
  avgPrice: number;
  totalCost: number;
}
```

### `simulateSell(marketId)` (Paper Trading)

Simulate selling a position.

```typescript
const result = await gammaClient.simulateSell('market_id');

// Returns
interface SellResult {
  marketId: string;
  outcome: 'yes' | 'no';
  shares: number;
  exitPrice: number;
  proceeds: number;
  realizedPnl: number;
}
```

## Real Trading Methods

For real trading on Polymarket, you need to use the CLOB (Central Limit Order Book) API.

### `initializeWallet(privateKey)`

Initialize wallet for real trading.

```typescript
gammaClient.initializeWallet(process.env.POLYMARKET_PRIVATE_KEY);
```

### `buyShares(marketId, outcome, amountUsd)`

Buy shares in a market.

```typescript
const result = await gammaClient.buyShares('market_id', 'yes', 100);

// Returns
interface OrderResult {
  orderId: string;
  shares: number;
  avgPrice: number;
  fee: number;
}
```

### `sellShares(marketId, shares?)`

Sell shares in a market.

```typescript
// Sell all shares
const result = await gammaClient.sellShares('market_id');

// Sell specific amount
const result = await gammaClient.sellShares('market_id', 50);
```

## Web Search Integration

The Polymarket domain includes web search for research:

```typescript
import { webSearch } from './clients/polymarket/search';

const results = await webSearch('Fed interest rate decision January 2025');

// Returns
interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  date?: string;
}
```

## Error Handling

```typescript
try {
  const market = await gammaClient.getMarket('invalid_id');
} catch (error) {
  if (error.code === 'MARKET_NOT_FOUND') {
    console.log('Market does not exist');
  } else if (error.code === 'MARKET_RESOLVED') {
    console.log('Market has already resolved');
  } else if (error.code === 'INSUFFICIENT_LIQUIDITY') {
    console.log('Not enough liquidity for this order');
  }
}
```

## Probability and Pricing

Polymarket prices represent implied probabilities:

```typescript
// Price interpretation
const yesPrice = 0.55;  // Market thinks 55% chance of YES
const noPrice = 0.45;   // Market thinks 45% chance of NO

// Note: yesPrice + noPrice may not equal 1.00 due to spread

// Your edge calculation
const yourEstimate = 0.70;  // You think 70% chance
const edge = yourEstimate - yesPrice;  // 15% edge
```

## Types

```typescript
// Market
interface Market {
  id: string;
  question: string;
  description: string;
  category: string;
  outcomes: string[];
  outcomePrices: number[];
  volume: number;
  liquidity: number;
  endDate: Date;
  resolved: boolean;
  resolvedOutcome?: string;
}

// Position
interface Position {
  marketId: string;
  question: string;
  outcome: 'yes' | 'no';
  shares: number;
  avgEntryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  valueUsd: number;
}

// Outcome
type Outcome = 'yes' | 'no';

// Category
type Category =
  | 'politics'
  | 'crypto'
  | 'sports'
  | 'science'
  | 'business'
  | 'entertainment'
  | 'other';
```

## Related Documentation

- [Polymarket Domain](../domains/polymarket.md) - Trading strategies
- [Paper Trading](../trading/paper-trading.md) - Testing mode
- [MCP Server Tools](../mcp-server/tools.md) - Tool reference
