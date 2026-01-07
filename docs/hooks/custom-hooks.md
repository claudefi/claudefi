# Custom Hooks

This guide shows how to create custom hooks for claudefi.

## Basic Structure

```typescript
import { hookRegistry, HookContext, HookResult } from './hooks';

hookRegistry.register({
  name: 'my-custom-hook',
  event: 'PreDecision',
  priority: 50,
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    // Your logic here
    return { proceed: true };
  },
});
```

## Examples

### Time-Based Trading Restrictions

Block trading during low-liquidity hours:

```typescript
hookRegistry.register({
  name: 'trading-hours',
  event: 'PreDecision',
  priority: 15,
  enabled: true,
  hook: async (ctx) => {
    const hour = new Date().getUTCHours();

    // Block trades between 2-6 UTC (low liquidity)
    if (hour >= 2 && hour < 6) {
      if (['buy', 'open_long', 'open_short'].includes(ctx.decision.action)) {
        return {
          proceed: false,
          reason: 'Low liquidity hours (02:00-06:00 UTC). Only exits allowed.',
        };
      }
    }

    return { proceed: true };
  },
});
```

### Correlation Check

Prevent correlated positions:

```typescript
hookRegistry.register({
  name: 'correlation-check',
  event: 'PreDecision',
  priority: 25,
  enabled: true,
  hook: async (ctx) => {
    if (ctx.decision.action !== 'open_long' && ctx.decision.action !== 'open_short') {
      return { proceed: true };
    }

    const positions = await getOpenPositions();
    const newAsset = ctx.decision.target;

    // Check if we already have correlated exposure
    for (const pos of positions) {
      const correlation = await getCorrelation(pos.target, newAsset);

      if (correlation > 0.8) {
        return {
          proceed: false,
          reason: `High correlation (${correlation.toFixed(2)}) with existing ${pos.target} position`,
        };
      }
    }

    return { proceed: true };
  },
});
```

### Volatility Gate

Reduce position sizes during high volatility:

```typescript
hookRegistry.register({
  name: 'volatility-gate',
  event: 'PreDecision',
  priority: 35,
  enabled: true,
  hook: async (ctx) => {
    if (!ctx.decision.amountUsd) {
      return { proceed: true };
    }

    const volatility = await getMarketVolatility(); // Returns daily % move

    if (volatility > 5) {
      const maxAmount = ctx.balance * 0.10; // Reduce to 10% max

      if (ctx.decision.amountUsd > maxAmount) {
        return {
          proceed: false,
          reason: `High volatility (${volatility.toFixed(1)}%). Max position: $${maxAmount.toFixed(0)}`,
        };
      }
    }

    return { proceed: true };
  },
});
```

### Notification Hook

Send notifications on significant trades:

```typescript
hookRegistry.register({
  name: 'trade-notifications',
  event: 'PostDecision',
  priority: 90,
  enabled: true,
  hook: async (ctx) => {
    const { decision, result } = ctx;

    // Only notify on executed trades
    if (result.status !== 'executed') {
      return { proceed: true };
    }

    // Only notify on significant amounts
    if (decision.amountUsd && decision.amountUsd > 200) {
      await sendTelegramMessage(`
        **${decision.domain.toUpperCase()} Trade Executed**
        Action: ${decision.action}
        Target: ${decision.target}
        Amount: $${decision.amountUsd}
        Confidence: ${(decision.confidence * 100).toFixed(0)}%
      `);
    }

    return { proceed: true };
  },
});
```

### Custom Validation

Domain-specific validation:

```typescript
hookRegistry.register({
  name: 'dlmm-tvl-check',
  event: 'PreDecision',
  priority: 40,
  enabled: true,
  hook: async (ctx) => {
    // Only applies to DLMM
    if (ctx.domain !== 'dlmm') {
      return { proceed: true };
    }

    if (ctx.decision.action !== 'add_liquidity') {
      return { proceed: true };
    }

    const pool = await getPoolDetails(ctx.decision.poolAddress);

    if (pool.tvl < 100000) {
      return {
        proceed: false,
        reason: `Pool TVL $${pool.tvl.toLocaleString()} below $100k minimum`,
      };
    }

    return { proceed: true };
  },
});
```

### Analytics Hook

Track custom metrics:

```typescript
hookRegistry.register({
  name: 'analytics-tracker',
  event: 'PostDecision',
  priority: 100, // Run last
  enabled: true,
  hook: async (ctx) => {
    const { decision, result } = ctx;

    // Track to analytics service
    await analytics.track('decision', {
      domain: decision.domain,
      action: decision.action,
      target: decision.target,
      amount: decision.amountUsd,
      confidence: decision.confidence,
      result: result.status,
      timestamp: new Date().toISOString(),
    });

    return { proceed: true };
  },
});
```

## Hook Patterns

### Conditional Logic

```typescript
hook: async (ctx) => {
  // Check multiple conditions
  const checks = [
    { pass: ctx.balance > 100, msg: 'Insufficient balance' },
    { pass: ctx.decision.confidence > 0.5, msg: 'Low confidence' },
    { pass: ctx.positions.length < 5, msg: 'Too many positions' },
  ];

  const failed = checks.find(c => !c.pass);
  if (failed) {
    return { proceed: false, reason: failed.msg };
  }

  return { proceed: true };
},
```

### Passing Data Between Hooks

```typescript
// First hook adds data
hookRegistry.register({
  name: 'enrich-context',
  event: 'PreDecision',
  priority: 1, // Run first
  hook: async (ctx) => {
    const marketData = await fetchMarketData();
    return {
      proceed: true,
      data: { marketData }, // Pass to next hooks
    };
  },
});

// Later hook uses data
hookRegistry.register({
  name: 'use-market-data',
  event: 'PreDecision',
  priority: 50,
  hook: async (ctx) => {
    const { marketData } = ctx.hookData || {};

    if (marketData?.volatility > 10) {
      return { proceed: false, reason: 'Extreme volatility' };
    }

    return { proceed: true };
  },
});
```

### Async Operations

```typescript
hook: async (ctx) => {
  // Parallel async checks
  const [balance, positions, marketStatus] = await Promise.all([
    getBalance(ctx.domain),
    getPositions(ctx.domain),
    checkMarketStatus(),
  ]);

  if (!marketStatus.isOpen) {
    return { proceed: false, reason: 'Market closed' };
  }

  return { proceed: true };
},
```

## Testing Hooks

```typescript
// tests/hooks/custom.test.ts

describe('Custom Hooks', () => {
  beforeEach(() => {
    // Reset hook registry
    hookRegistry.clear();
  });

  it('trading-hours blocks during low liquidity', async () => {
    // Mock time to 3 AM UTC
    jest.useFakeTimers().setSystemTime(new Date('2025-01-07T03:00:00Z'));

    registerTradingHoursHook();

    const result = await hookRegistry.run('PreDecision', {
      decision: { action: 'buy', target: 'BTC' },
      domain: 'spot',
    });

    expect(result.proceed).toBe(false);
    expect(result.reason).toContain('Low liquidity hours');
  });

  it('trading-hours allows exits during any hour', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2025-01-07T03:00:00Z'));

    registerTradingHoursHook();

    const result = await hookRegistry.run('PreDecision', {
      decision: { action: 'sell', target: 'BTC' },
      domain: 'spot',
    });

    expect(result.proceed).toBe(true);
  });
});
```

## Best Practices

1. **Set appropriate priority** - Risk controls should run early (low numbers)
2. **Keep hooks focused** - One responsibility per hook
3. **Handle errors gracefully** - Wrap in try/catch if needed
4. **Log decisions** - Help with debugging
5. **Make hooks configurable** - Use environment variables for thresholds
6. **Test thoroughly** - Hooks can block trades unexpectedly

## Related Documentation

- [Hooks Overview](./overview.md) - System introduction
- [Built-in Hooks](./built-in.md) - Default hooks
- [Risk Management](../trading/risk-management.md) - Risk controls
