# Tool Reference

Complete reference for all MCP tools available in claudefi.

## Common Tools (All Domains)

### `get_balance`

Get available balance for the domain.

**Input:**
```typescript
{} // No arguments
```

**Output:**
```typescript
{
  balance_usd: number;
  available_usd: number;
  reserved_usd: number;  // In pending orders
}
```

### `get_positions`

Get all open positions in this domain.

**Input:**
```typescript
{} // No arguments
```

**Output:**
```typescript
[
  {
    id: string;
    target: string;
    entry_value_usd: number;
    current_value_usd: number;
    unrealized_pnl: number;
    unrealized_pnl_pct: number;
    opened_at: string;
    // Domain-specific fields...
  }
]
```

### `get_portfolio`

Get full portfolio view across all domains.

**Input:**
```typescript
{} // No arguments
```

**Output:**
```typescript
{
  total_value_usd: number;
  total_pnl: number;
  domains: {
    dlmm: { balance: number, positions: number, pnl: number },
    perps: { balance: number, positions: number, pnl: number },
    polymarket: { balance: number, positions: number, pnl: number },
    spot: { balance: number, positions: number, pnl: number },
  }
}
```

### `submit_decision`

Record and optionally execute a trading decision.

**Input:**
```typescript
{
  action: string;          // Domain-specific action
  target?: string;         // Asset/pool/market identifier
  amount_usd?: number;     // Position size
  confidence: number;      // 0-1, must be >= 0.6
  reasoning: string;       // Detailed reasoning
  // Domain-specific fields...
}
```

**Output:**
```typescript
{
  decision_id: string;
  status: 'executed' | 'pending' | 'rejected';
  execution_result?: {
    order_id: string;
    filled_price: number;
    // ...
  };
  rejection_reason?: string;
}
```

---

## DLMM Tools

### `fetch_pools`

Get top Meteora DLMM pools.

**Input:**
```typescript
{
  limit?: number;         // Default: 20
  min_tvl?: number;       // Default: 50000
  sort_by?: 'fees' | 'tvl' | 'volume';  // Default: 'fees'
}
```

**Output:**
```typescript
[
  {
    address: string;
    name: string;
    token_x: { symbol: string, address: string };
    token_y: { symbol: string, address: string };
    current_price: number;
    tvl: number;
    volume_24h: number;
    fees_24h: number;
    apr: number;
    bin_step: number;
  }
]
```

### `get_pool_details`

Get detailed pool information.

**Input:**
```typescript
{
  pool_address: string;
}
```

**Output:**
```typescript
{
  address: string;
  name: string;
  current_price: number;
  current_bin_id: number;
  bin_step: number;
  fee_rate: number;
  tvl: number;
  volume_24h: number;
  volume_7d: number;
  fees_24h: number;
  liquidity_distribution: Array<{ bin_id: number, liquidity: number }>;
  recent_trades: Array<{ price: number, size: number, side: string, time: string }>;
}
```

### DLMM `submit_decision`

**Additional Input Fields:**
```typescript
{
  action: 'add_liquidity' | 'remove_liquidity' | 'partial_remove' | 'rebalance' | 'hold';
  pool_address?: string;
  strategy?: 'spot' | 'curve' | 'bid_ask';
  bin_range?: { lower: number, upper: number };  // Relative to current bin
}
```

---

## Perps Tools

### `fetch_markets`

Get perpetual markets with indicators.

**Input:**
```typescript
{
  symbols?: string[];      // Filter to specific symbols
  include_indicators?: boolean;  // Default: true
}
```

**Output:**
```typescript
[
  {
    symbol: string;
    mark_price: number;
    index_price: number;
    funding_rate: number;
    predicted_funding: number;
    open_interest: number;
    volume_24h: number;
    price_change_24h: number;
    rsi_14?: number;
    // Other indicators...
  }
]
```

### Perps `submit_decision`

**Additional Input Fields:**
```typescript
{
  action: 'open_long' | 'open_short' | 'close_position' | 'partial_close' | 'add_to_position' | 'hold';
  leverage?: number;       // 1-10, default: 3
  stop_loss?: number;      // Price level
  take_profit?: number;    // Price level
}
```

---

## Spot Tools

### `fetch_tokens`

Get trending or new tokens.

**Input:**
```typescript
{
  category: 'trending' | 'new' | 'top';  // Default: 'trending'
  limit?: number;          // Default: 20
}
```

**Output:**
```typescript
[
  {
    address: string;
    symbol: string;
    name: string;
    price: number;
    price_change_24h: number;
    volume_24h: number;
    market_cap: number;
    liquidity: number;
    holder_count: number;
    age_days: number;
    organic_score?: number;
  }
]
```

### `get_token_details`

Get detailed token information.

**Input:**
```typescript
{
  token_address: string;
}
```

**Output:**
```typescript
{
  address: string;
  symbol: string;
  name: string;
  price: number;
  price_history: Array<{ time: string, price: number }>;
  top_holders: Array<{ address: string, percent: number }>;
  recent_transactions: Array<{ type: string, amount: number, price: number }>;
  social_links: { twitter?: string, telegram?: string, website?: string };
  organic_score: number;
  mint_authority: boolean;
  freeze_authority: boolean;
}
```

### Spot `submit_decision`

**Additional Input Fields:**
```typescript
{
  action: 'buy' | 'sell' | 'partial_sell' | 'hold';
  token_address?: string;
  slippage_bps?: number;   // Default: 100 (1%)
}
```

---

## Polymarket Tools

### `fetch_markets`

Get prediction markets.

**Input:**
```typescript
{
  category?: 'trending' | 'ending_soon' | 'popular' | 'new';
  limit?: number;          // Default: 20
}
```

**Output:**
```typescript
[
  {
    id: string;
    question: string;
    yes_price: number;
    no_price: number;
    volume: number;
    liquidity: number;
    end_date: string;
    category: string;
    description: string;
  }
]
```

### `web_search`

Search the web for market research.

**Input:**
```typescript
{
  query: string;
}
```

**Output:**
```typescript
{
  results: [
    {
      title: string;
      url: string;
      snippet: string;
      date?: string;
    }
  ]
}
```

### Polymarket `submit_decision`

**Additional Input Fields:**
```typescript
{
  action: 'buy_yes' | 'buy_no' | 'sell' | 'partial_sell' | 'hold';
  market_id?: string;
  estimated_probability?: number;  // Your probability estimate
  market_price?: number;           // Current market price
}
```

---

## Tool Response Format

All tools return responses in this format:

```typescript
{
  content: [
    {
      type: 'text',
      text: string  // JSON-encoded data
    }
  ],
  isError?: boolean
}
```

For errors:

```typescript
{
  content: [
    {
      type: 'text',
      text: 'Error: Description of what went wrong'
    }
  ],
  isError: true
}
```

## Related Documentation

- [MCP Server Overview](./overview.md) - Architecture
- [Custom Tools](./custom-tools.md) - Adding new tools
- [Domain Documentation](../domains/overview.md) - Domain details
