# Paper Trading

Paper trading lets you test claudefi with live market data but simulated execution - no real money at risk.

## Overview

In paper trading mode:

- **Market Data**: Live prices, volumes, and indicators from real APIs
- **Execution**: Simulated orders with realistic fills
- **Positions**: Tracked in local database
- **Learning**: Full skill generation and effectiveness tracking
- **Risk**: Zero - no real funds used

## Enabling Paper Trading

Paper trading is the default mode. Verify with:

```bash
# .env
TRADING_MODE=paper
```

Or check the database:

```typescript
const config = await prisma.agentConfig.findFirst();
console.log(config.paperTrading); // true
```

## How It Works

### Order Simulation

When Claude decides to trade, the system simulates execution:

```typescript
// Example: DLMM add liquidity
const result = await meteoraClient.simulateAddLiquidity({
  poolAddress: 'xxx',
  amountUsd: 500,
  strategy: 'spot',
  binRange: { lower: -5, upper: 5 },
});

// Returns
{
  positionId: 'paper_1704672000000_abc123',
  poolAddress: 'xxx',
  amountX: 2.5,      // Calculated from current price
  amountY: 250,
  bins: [...],
  estimatedDailyFees: 3.50
}
```

### Position Tracking

Paper positions are stored in the database:

```typescript
// Position record
{
  id: 'paper_1704672000000_abc123',
  domain: 'dlmm',
  target: 'SOL-USDC',
  targetAddress: 'pool_address',
  entryValueUsd: 500,
  currentValueUsd: 512.50,  // Updated with live prices
  unrealizedPnl: 12.50,
  status: 'open',
  openedAt: '2025-01-07T10:00:00Z',
  metadata: '{"strategy":"spot","binRange":{"lower":-5,"upper":5}}'
}
```

### Price Updates

Position values update with live market data:

```typescript
async function updatePaperPositions(): Promise<void> {
  const positions = await getOpenPositions();

  for (const position of positions) {
    const currentPrice = await getCurrentPrice(position);
    const newValue = calculateCurrentValue(position, currentPrice);

    await prisma.position.update({
      where: { id: position.id },
      data: {
        currentPrice,
        currentValueUsd: newValue,
        unrealizedPnl: newValue - position.entryValueUsd,
      },
    });
  }
}
```

### Closing Positions

Paper positions close with simulated fills:

```typescript
const result = await hyperliquidClient.simulateClose('ETH');

// Updates position
{
  status: 'closed',
  closedAt: '2025-01-07T14:00:00Z',
  realizedPnl: 45.00,  // Based on entry vs current price
}

// Updates domain balance
dlmmBalance += 500 + 45.00;  // Return capital + profit
```

## Realistic Simulation

Paper trading includes realistic market conditions:

### Slippage

```typescript
function simulateSlippage(quote: Quote, sizeUsd: number): number {
  // Base slippage from price impact
  let slippage = quote.priceImpactPct;

  // Add random component (0-0.5%)
  slippage += Math.random() * 0.005;

  // Larger orders get more slippage
  if (sizeUsd > 1000) {
    slippage += (sizeUsd - 1000) * 0.0001;
  }

  return slippage;
}
```

### Fees

```typescript
function calculateFees(domain: Domain, sizeUsd: number): number {
  const feeRates = {
    dlmm: 0.0025,       // 0.25% LP fee
    perps: 0.0006,      // 0.06% taker fee
    polymarket: 0.02,   // 2% fee
    spot: 0.003,        // 0.3% swap fee
  };

  return sizeUsd * feeRates[domain];
}
```

### Liquidation

Perps positions track liquidation prices:

```typescript
function checkLiquidation(position: PerpsPosition): boolean {
  const currentPrice = await getMarkPrice(position.symbol);

  if (position.side === 'long' && currentPrice <= position.liquidationPrice) {
    return true;
  }
  if (position.side === 'short' && currentPrice >= position.liquidationPrice) {
    return true;
  }

  return false;
}
```

## Benefits of Paper Trading

### Risk-Free Testing

- Test strategies without financial risk
- Validate configuration and hooks
- Debug issues safely

### Full Feature Parity

- All hooks run (validation, logging)
- Skills generate from outcomes
- Judge evaluates decisions
- Performance tracking works

### Live Market Conditions

- Real price movements
- Actual volatility
- True market hours
- Current liquidity levels

## Limitations

Paper trading has some differences from live trading:

| Aspect | Paper | Live |
|--------|-------|------|
| Price data | Real | Real |
| Execution | Simulated | Real |
| Slippage | Estimated | Variable |
| Liquidity | Assumed | Can fail |
| Fees | Estimated | Exact |
| Network | N/A | Can fail |

## Transitioning to Live

Before switching to live trading:

1. **Review paper performance** over multiple cycles
2. **Verify hook configurations** are appropriate
3. **Start with small sizes** on testnet first
4. **Monitor closely** during initial live cycles

See [Real Trading](./real-trading.md) for live setup.

## Monitoring Paper Trading

### Prisma Studio

```bash
npm run db:studio
```

View:
- Open positions
- Decision history
- P&L tracking
- Skill effectiveness

### Console Output

```
[Ralph] Paper Trading Mode
[DLMM] Simulating add_liquidity for $500 on SOL-USDC
[DLMM] Position opened: paper_1704672000000_abc123
[DLMM] Estimated daily fees: $3.50
```

### Performance Snapshots

Query historical performance:

```typescript
const history = await prisma.performanceSnapshot.findMany({
  orderBy: { timestamp: 'desc' },
  take: 48, // Last 24 hours (30min cycles)
});

const returns = history.map(h => ({
  time: h.timestamp,
  value: h.totalValueUsd,
  pnl: h.totalPnlPercent,
}));
```

## Related Documentation

- [Configuration](../getting-started/configuration.md) - Trading mode setup
- [Real Trading](./real-trading.md) - Live trading guide
- [Risk Management](./risk-management.md) - Risk controls
