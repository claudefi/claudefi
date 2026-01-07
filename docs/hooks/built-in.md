# Built-in Hooks

claudefi includes several built-in hooks for risk management, validation, and logging.

## Risk Control Hooks

### `global-drawdown-limit`

Pauses all trading when portfolio drawdown exceeds 15%.

**Event**: `PreDecision`
**Priority**: 5

```typescript
hookRegistry.register({
  name: 'global-drawdown-limit',
  event: 'PreDecision',
  priority: 5,
  hook: async (ctx) => {
    const { peak, current } = await getPortfolioValue();
    const drawdown = (peak - current) / peak;

    if (drawdown > 0.15) {
      return {
        proceed: false,
        reason: `Portfolio drawdown ${(drawdown * 100).toFixed(1)}% exceeds 15% limit`,
      };
    }
    return { proceed: true };
  },
});
```

### `domain-drawdown-limit`

Reduces exposure when a single domain is down 20%+.

**Event**: `PreDecision`
**Priority**: 6

```typescript
hookRegistry.register({
  name: 'domain-drawdown-limit',
  event: 'PreDecision',
  priority: 6,
  hook: async (ctx) => {
    const { peak, current } = await getDomainValue(ctx.domain);
    const drawdown = (peak - current) / peak;

    if (drawdown > 0.20) {
      // Allow exits, block new entries
      if (['buy', 'open_long', 'open_short', 'add_liquidity'].includes(ctx.decision.action)) {
        return {
          proceed: false,
          reason: `Domain ${ctx.domain} down ${(drawdown * 100).toFixed(1)}%, blocking new entries`,
        };
      }
    }
    return { proceed: true };
  },
});
```

### `balance-check`

Ensures sufficient balance for the trade.

**Event**: `PreDecision`
**Priority**: 10

```typescript
hookRegistry.register({
  name: 'balance-check',
  event: 'PreDecision',
  priority: 10,
  hook: async (ctx) => {
    if (!ctx.decision.amountUsd) {
      return { proceed: true };
    }

    const balance = await getDomainBalance(ctx.domain);

    if (ctx.decision.amountUsd > balance) {
      return {
        proceed: false,
        reason: `Insufficient balance: $${ctx.decision.amountUsd} > $${balance}`,
      };
    }
    return { proceed: true };
  },
});
```

### `position-limit`

Limits concurrent positions per domain to 3.

**Event**: `PreDecision`
**Priority**: 20

```typescript
hookRegistry.register({
  name: 'position-limit',
  event: 'PreDecision',
  priority: 20,
  hook: async (ctx) => {
    // Only check for new positions
    const openingActions = ['buy', 'open_long', 'open_short', 'add_liquidity'];
    if (!openingActions.includes(ctx.decision.action)) {
      return { proceed: true };
    }

    const positions = await getOpenPositions(ctx.domain);

    if (positions.length >= 3) {
      return {
        proceed: false,
        reason: `Max positions reached (${positions.length}/3) for ${ctx.domain}`,
      };
    }
    return { proceed: true };
  },
});
```

### `confidence-threshold`

Requires minimum 60% confidence for trades.

**Event**: `PreDecision`
**Priority**: 30

```typescript
hookRegistry.register({
  name: 'confidence-threshold',
  event: 'PreDecision',
  priority: 30,
  hook: async (ctx) => {
    if (ctx.decision.action === 'hold') {
      return { proceed: true };
    }

    if (ctx.decision.confidence < 0.60) {
      return {
        proceed: false,
        reason: `Confidence ${(ctx.decision.confidence * 100).toFixed(0)}% below 60% threshold`,
      };
    }
    return { proceed: true };
  },
});
```

## Approval Hooks

### `human-approval`

Requires manual approval for trades over $500.

**Event**: `PreDecision`
**Priority**: 100

```typescript
hookRegistry.register({
  name: 'human-approval',
  event: 'PreDecision',
  priority: 100,
  hook: async (ctx) => {
    if (!ctx.decision.amountUsd || ctx.decision.amountUsd <= 500) {
      return { proceed: true };
    }

    // Check for pre-approved decision
    const preApproved = await checkPreApproval(ctx.decision.id);
    if (preApproved) {
      return { proceed: true };
    }

    // Queue for approval
    await queueForApproval(ctx.decision);

    return {
      proceed: false,
      reason: `Trade >$500 requires approval (queued)`,
    };
  },
});
```

## Logging Hooks

### `session-start-logger`

Logs session start with context.

**Event**: `SessionStart`
**Priority**: 10

```typescript
hookRegistry.register({
  name: 'session-start-logger',
  event: 'SessionStart',
  priority: 10,
  hook: async (ctx) => {
    console.log(`[${ctx.domain}] Session ${ctx.sessionId} started`);
    console.log(`[${ctx.domain}] Active skills: ${ctx.skills.length}`);
    console.log(`[${ctx.domain}] Open positions: ${ctx.positions.length}`);
    return { proceed: true };
  },
});
```

### `decision-logger`

Logs all decisions.

**Event**: `PostDecision`
**Priority**: 10

```typescript
hookRegistry.register({
  name: 'decision-logger',
  event: 'PostDecision',
  priority: 10,
  hook: async (ctx) => {
    const { decision, result } = ctx;

    console.log(`[${decision.domain}] Decision: ${decision.action}`);
    console.log(`  Target: ${decision.target}`);
    console.log(`  Amount: $${decision.amountUsd}`);
    console.log(`  Confidence: ${(decision.confidence * 100).toFixed(0)}%`);
    console.log(`  Result: ${result.status}`);

    // Also log to database
    await logDecision(decision, result);

    return { proceed: true };
  },
});
```

### `session-end-logger`

Logs session summary.

**Event**: `SessionEnd`
**Priority**: 10

```typescript
hookRegistry.register({
  name: 'session-end-logger',
  event: 'SessionEnd',
  priority: 10,
  hook: async (ctx) => {
    const duration = ctx.endTime.getTime() - ctx.startTime.getTime();
    console.log(`[${ctx.domain}] Session ${ctx.sessionId} ended`);
    console.log(`  Duration: ${(duration / 1000).toFixed(1)}s`);
    console.log(`  Decisions: ${ctx.decisions.length}`);
    return { proceed: true };
  },
});
```

### `error-logger`

Logs and optionally alerts on errors.

**Event**: `OnError`
**Priority**: 10

```typescript
hookRegistry.register({
  name: 'error-logger',
  event: 'OnError',
  priority: 10,
  hook: async (ctx) => {
    console.error(`[ERROR] ${ctx.phase}: ${ctx.error.message}`);
    console.error(ctx.error.stack);

    // Send Telegram alert for critical errors
    if (isCriticalError(ctx.error)) {
      await sendTelegramAlert(`Critical error in ${ctx.phase}: ${ctx.error.message}`);
    }

    return { proceed: true };
  },
});
```

## Tool Hooks

### `tool-rate-limiter`

Prevents excessive tool calls.

**Event**: `PreToolUse`
**Priority**: 10

```typescript
hookRegistry.register({
  name: 'tool-rate-limiter',
  event: 'PreToolUse',
  priority: 10,
  hook: async (ctx) => {
    const key = `${ctx.domain}:${ctx.toolName}`;
    const calls = await getRecentCalls(key, 60000); // Last minute

    if (calls > 20) {
      return {
        proceed: false,
        reason: `Rate limit: ${ctx.toolName} called ${calls} times in last minute`,
      };
    }

    await recordCall(key);
    return { proceed: true };
  },
});
```

## Built-in Hook Summary

| Hook | Event | Priority | Purpose |
|------|-------|----------|---------|
| `global-drawdown-limit` | PreDecision | 5 | Block at -15% portfolio |
| `domain-drawdown-limit` | PreDecision | 6 | Reduce at -20% domain |
| `balance-check` | PreDecision | 10 | Ensure sufficient balance |
| `position-limit` | PreDecision | 20 | Max 3 positions per domain |
| `confidence-threshold` | PreDecision | 30 | Min 60% confidence |
| `human-approval` | PreDecision | 100 | Approval for >$500 trades |
| `session-start-logger` | SessionStart | 10 | Log session start |
| `decision-logger` | PostDecision | 10 | Log all decisions |
| `session-end-logger` | SessionEnd | 10 | Log session end |
| `error-logger` | OnError | 10 | Log and alert errors |
| `tool-rate-limiter` | PreToolUse | 10 | Prevent spam |

## Configuring Built-in Hooks

Thresholds can be configured via environment variables:

```bash
# Risk thresholds
MAX_DRAWDOWN=0.15
DOMAIN_MAX_DRAWDOWN=0.20
MAX_POSITIONS_PER_DOMAIN=3
CONFIDENCE_THRESHOLD=0.60

# Approval threshold
HUMAN_APPROVAL_THRESHOLD=500
```

## Related Documentation

- [Hooks Overview](./overview.md) - System introduction
- [Custom Hooks](./custom-hooks.md) - Creating your own
- [Risk Management](../trading/risk-management.md) - Risk controls
