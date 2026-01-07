# Risk Management

claudefi implements multiple layers of risk management to protect capital and ensure sustainable trading.

## Risk Layers

```
+------------------------------------------------------------------+
|                      RISK MANAGEMENT LAYERS                       |
|                                                                   |
|  +------------------------------------------------------------+  |
|  |  1. GLOBAL LIMITS                                          |  |
|  |     - Portfolio drawdown limit (15%)                       |  |
|  |     - Total exposure caps                                  |  |
|  +------------------------------------------------------------+  |
|                               |                                   |
|  +------------------------------------------------------------+  |
|  |  2. DOMAIN LIMITS                                          |  |
|  |     - Per-domain drawdown (20%)                            |  |
|  |     - Position count limits (3 per domain)                 |  |
|  +------------------------------------------------------------+  |
|                               |                                   |
|  +------------------------------------------------------------+  |
|  |  3. POSITION LIMITS                                        |  |
|  |     - Max position size (20%)                              |  |
|  |     - Leverage limits (10x max)                            |  |
|  +------------------------------------------------------------+  |
|                               |                                   |
|  +------------------------------------------------------------+  |
|  |  4. DECISION VALIDATION                                    |  |
|  |     - Confidence threshold (60%)                           |  |
|  |     - Human approval for large trades                      |  |
|  +------------------------------------------------------------+  |
+------------------------------------------------------------------+
```

## Global Risk Controls

### Portfolio Drawdown Limit

Trading pauses when portfolio is down 15% from peak:

```typescript
// global-drawdown-limit hook
const { peak, current } = await getPortfolioValue();
const drawdown = (peak - current) / peak;

if (drawdown > 0.15) {
  // Block all new trades
  return { proceed: false, reason: 'Portfolio down >15%' };
}
```

This prevents catastrophic losses and allows time for manual review.

### Configuration

```bash
MAX_DRAWDOWN=0.15  # 15% global limit
```

## Domain Risk Controls

### Per-Domain Drawdown

Each domain has its own drawdown limit (20%):

```typescript
// domain-drawdown-limit hook
const { peak, current } = await getDomainValue(domain);
const drawdown = (peak - current) / peak;

if (drawdown > 0.20) {
  // Block new entries, allow exits
  if (['buy', 'open_long', 'open_short', 'add_liquidity'].includes(action)) {
    return { proceed: false, reason: `${domain} down >20%` };
  }
}
```

### Position Count Limits

Maximum 3 positions per domain:

```typescript
// position-limit hook
const positions = await getOpenPositions(domain);

if (positions.length >= 3 && isEntryAction(action)) {
  return { proceed: false, reason: 'Max positions reached' };
}
```

### Configuration

```bash
DOMAIN_MAX_DRAWDOWN=0.20
MAX_POSITIONS_PER_DOMAIN=3
```

## Position Risk Controls

### Maximum Position Size

No single position exceeds 20% of domain balance:

```typescript
function validatePositionSize(amountUsd: number, balance: number): boolean {
  const maxAmount = balance * MAX_POSITION_PCT;
  return amountUsd <= maxAmount;
}
```

### Perps Leverage Limits

Leverage capped at 10x (recommended 3-5x):

```typescript
function validateLeverage(leverage: number): boolean {
  return leverage <= 10;
}

// Prompt also guides toward lower leverage
// "Prefer 3-5x leverage for most trades"
```

### Configuration

```bash
MAX_POSITION_PCT=0.20  # 20% max per position
```

## Decision Validation

### Confidence Threshold

Trades require minimum 60% confidence:

```typescript
// confidence-threshold hook
if (decision.confidence < 0.60) {
  return {
    proceed: false,
    reason: `Confidence ${(decision.confidence * 100).toFixed(0)}% below 60%`,
  };
}
```

### Human Approval

Trades over $500 require manual approval:

```typescript
// human-approval hook
if (decision.amountUsd > 500) {
  await queueForApproval(decision);
  return { proceed: false, reason: 'Requires approval (>$500)' };
}
```

### Configuration

```bash
CONFIDENCE_THRESHOLD=0.60
HUMAN_APPROVAL_THRESHOLD=500
```

## Liquidation Protection

### Perps Monitoring

The position monitor service tracks liquidation risk:

```typescript
const LIQUIDATION_THRESHOLDS = {
  warning: 0.70,   // Alert at 70% to liquidation
  danger: 0.85,    // Urgent alert at 85%
  critical: 0.95,  // Auto-close at 95%
};

async function checkLiquidationRisk(position: PerpsPosition): Promise<void> {
  const distanceToLiq = calculateLiquidationDistance(position);

  if (distanceToLiq < LIQUIDATION_THRESHOLDS.critical) {
    await emergencyClose(position);
    await alert('CRITICAL: Auto-closed position near liquidation');
  } else if (distanceToLiq < LIQUIDATION_THRESHOLDS.danger) {
    await alert('DANGER: Position approaching liquidation');
  } else if (distanceToLiq < LIQUIDATION_THRESHOLDS.warning) {
    await alert('WARNING: Monitor position closely');
  }
}
```

### Stop Loss Enforcement

Perps decisions should include stop losses:

```typescript
// Validated in prompt and hooks
if (action === 'open_long' || action === 'open_short') {
  if (!decision.stopLoss) {
    // Log warning but don't block
    console.warn('Position opened without stop loss');
  }
}
```

## Correlation Risk

### Cross-Domain Awareness

The portfolio coordinator prevents correlated exposure:

```typescript
async function checkCorrelation(newPosition: Position): Promise<void> {
  const existing = await getOpenPositions();

  for (const pos of existing) {
    const correlation = await calculateCorrelation(pos.target, newPosition.target);

    if (correlation > 0.8) {
      console.warn(
        `High correlation (${correlation}) between ${pos.target} and ${newPosition.target}`
      );
    }
  }
}
```

## Risk Dashboard

### Key Metrics

Monitor these risk metrics:

| Metric | Safe | Warning | Danger |
|--------|------|---------|--------|
| Portfolio Drawdown | <5% | 5-10% | >10% |
| Domain Drawdown | <10% | 10-15% | >15% |
| Position Count | 1-6 | 7-9 | 10+ |
| Leverage (avg) | <3x | 3-5x | >5x |
| Liq Distance (min) | >50% | 20-50% | <20% |

### Viewing Metrics

```typescript
async function getRiskDashboard() {
  const portfolio = await getPortfolioValue();
  const positions = await getAllPositions();

  return {
    portfolioDrawdown: (portfolio.peak - portfolio.current) / portfolio.peak,
    domainDrawdowns: await getDomainDrawdowns(),
    totalPositions: positions.length,
    avgLeverage: calculateAvgLeverage(positions),
    minLiqDistance: calculateMinLiqDistance(positions),
    highCorrelations: await findHighCorrelations(positions),
  };
}
```

## Configuring Risk Levels

### Conservative (Recommended for Start)

```bash
MAX_DRAWDOWN=0.10
DOMAIN_MAX_DRAWDOWN=0.15
MAX_POSITION_PCT=0.10
MAX_POSITIONS_PER_DOMAIN=2
CONFIDENCE_THRESHOLD=0.70
HUMAN_APPROVAL_THRESHOLD=100
```

### Moderate

```bash
MAX_DRAWDOWN=0.15
DOMAIN_MAX_DRAWDOWN=0.20
MAX_POSITION_PCT=0.15
MAX_POSITIONS_PER_DOMAIN=3
CONFIDENCE_THRESHOLD=0.65
HUMAN_APPROVAL_THRESHOLD=300
```

### Aggressive (Not Recommended)

```bash
MAX_DRAWDOWN=0.20
DOMAIN_MAX_DRAWDOWN=0.25
MAX_POSITION_PCT=0.25
MAX_POSITIONS_PER_DOMAIN=5
CONFIDENCE_THRESHOLD=0.55
HUMAN_APPROVAL_THRESHOLD=1000
```

## Custom Risk Hooks

Add domain-specific risk controls:

```typescript
// Example: Limit perps leverage during high volatility
hookRegistry.register({
  name: 'volatility-leverage-limit',
  event: 'PreDecision',
  priority: 35,
  hook: async (ctx) => {
    if (ctx.domain !== 'perps') return { proceed: true };
    if (!['open_long', 'open_short'].includes(ctx.decision.action)) {
      return { proceed: true };
    }

    const volatility = await getMarketVolatility(ctx.decision.target);

    if (volatility > 5 && ctx.decision.leverage > 3) {
      return {
        proceed: false,
        reason: `High volatility (${volatility}%), max 3x leverage`,
      };
    }

    return { proceed: true };
  },
});
```

## Related Documentation

- [Hooks System](../hooks/overview.md) - Hook details
- [Built-in Hooks](../hooks/built-in.md) - All risk hooks
- [Paper Trading](./paper-trading.md) - Safe testing
- [Real Trading](./real-trading.md) - Live trading setup
