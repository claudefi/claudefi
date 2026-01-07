# Hooks System Overview

The hooks system provides event-driven middleware for validation, logging, and guard rails throughout claudefi's execution.

## What Are Hooks?

Hooks are functions that run at specific points in the trading lifecycle:

- Before/after tool calls
- Before/after decisions
- At session start/end
- On errors

They enable:
- Validation and risk controls
- Logging and monitoring
- Custom business logic
- Guard rails without modifying core code

## Hook Events

| Event | When | Use Case |
|-------|------|----------|
| `SessionStart` | Before subagent runs | Logging, state initialization |
| `PreToolUse` | Before each tool call | Validation, rate limiting |
| `PostToolUse` | After each tool call | Logging, monitoring |
| `PreDecision` | Before execution | Guard rails, validation |
| `PostDecision` | After execution | Notifications, logging |
| `SessionEnd` | After subagent completes | Cleanup |
| `OnError` | On any error | Error handling, alerts |

## Hook Structure

```typescript
interface Hook {
  name: string;
  event: HookEvent;
  priority: number;       // Lower = runs first
  enabled: boolean;
  hook: (ctx: HookContext) => Promise<HookResult>;
}

interface HookResult {
  proceed: boolean;       // Continue execution?
  reason?: string;        // Why blocked (if proceed=false)
  data?: unknown;         // Pass data to next hook
}
```

## Execution Flow

```
┌───────────────┐     ┌───────────────┐     ┌───────────────┐
│    Claude     │────→│  PreDecision  │────→│   Execute     │
│   decides     │     │    Hooks      │     │  Decision     │
│               │     │  (by priority)│     │               │
└───────────────┘     └───────────────┘     └───────────────┘
                              │                     │
                         ┌────┴────┐                │
                         │ Blocked │                │
                         │ (skip)  │                │
                         └─────────┘                │
                                                    │
                                                    ↓
                                          ┌───────────────┐
                                          │ PostDecision  │
                                          │    Hooks      │
                                          └───────────────┘
```

## Using Hooks

### Registration

```typescript
import { hookRegistry } from './hooks';

hookRegistry.register({
  name: 'my-hook',
  event: 'PreDecision',
  priority: 50,
  enabled: true,
  hook: async (ctx) => {
    // Custom logic
    if (someCondition) {
      return { proceed: false, reason: 'Blocked because...' };
    }
    return { proceed: true };
  },
});
```

### Running Hooks

```typescript
const result = await hookRegistry.run('PreDecision', {
  decision: decision,
  domain: 'dlmm',
  // other context...
});

if (result.proceed) {
  await executeDecision(decision);
} else {
  console.log(`Decision blocked: ${result.reason}`);
}
```

## Hook Context

Each event receives relevant context:

### PreDecision / PostDecision

```typescript
interface DecisionHookContext {
  decision: Decision;
  domain: Domain;
  balance: number;
  positions: Position[];
  skills: Skill[];
}
```

### PreToolUse / PostToolUse

```typescript
interface ToolHookContext {
  toolName: string;
  args: unknown;
  domain: Domain;
  result?: unknown;  // Only in PostToolUse
}
```

### SessionStart / SessionEnd

```typescript
interface SessionHookContext {
  domain: Domain;
  sessionId: string;
  startTime: Date;
  endTime?: Date;    // Only in SessionEnd
  decisions?: Decision[];  // Only in SessionEnd
}
```

### OnError

```typescript
interface ErrorHookContext {
  error: Error;
  domain?: Domain;
  phase: string;  // Where error occurred
}
```

## Priority System

Hooks run in priority order (lowest first):

```
Priority 5:  global-drawdown-limit
Priority 6:  domain-drawdown-limit
Priority 10: balance-check
Priority 20: position-limit
Priority 30: confidence-threshold
Priority 50: custom-hook
Priority 100: human-approval
```

If any hook returns `proceed: false`, execution stops and later hooks don't run.

## Example: Risk Control

```typescript
hookRegistry.register({
  name: 'max-daily-trades',
  event: 'PreDecision',
  priority: 25,
  enabled: true,
  hook: async (ctx) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const todayTrades = await db.decision.count({
      where: {
        domain: ctx.domain,
        createdAt: { gte: today },
        action: { notIn: ['hold'] },
      },
    });

    if (todayTrades >= 5) {
      return {
        proceed: false,
        reason: `Daily trade limit reached (${todayTrades}/5)`,
      };
    }

    return { proceed: true };
  },
});
```

## Disabling Hooks

```typescript
// Disable by name
hookRegistry.disable('human-approval');

// Re-enable
hookRegistry.enable('human-approval');

// Check status
const isEnabled = hookRegistry.isEnabled('human-approval');
```

## Related Documentation

- [Built-in Hooks](./built-in.md) - Default hooks reference
- [Custom Hooks](./custom-hooks.md) - Creating your own hooks
- [Risk Management](../trading/risk-management.md) - Risk controls
