# Claudefi End-to-End Stress Test Spec

## Executive Summary

Comprehensive stress test that validates all system components (execution, skills, memory, subagents, hooks, infrastructure) across all domains with configurable intensity levels for CI/CD, development, and thorough testing scenarios.

## Problem Statement

After overnight Ralph Loop run revealed execution failures (9 DINO exit attempts, 4+ Polymarket exits, all failing with "Target: N/A"), we need a systematic test that:
1. Validates all execution fixes are working correctly
2. Tests system resilience under load and edge cases
3. Verifies end-to-end flow across all domains and components
4. Prevents regression of critical bugs
5. Provides confidence before production deployment

## Test Modes

| Mode | Cycles | Duration | Purpose |
|------|--------|----------|---------|
| **CI** | 3 | ~5 min | Fast validation in CI/CD pipeline |
| **Fast** | 10 | ~15 min | Quick local validation during development |
| **Standard** | 20 | ~30 min | Thorough testing before commits |
| **Stress** | 50 | ~75 min | Deep validation before production |

## Requirements

### Must Have (P0)

- [ ] **Configurable Test Intensity** - CLI flag `--cycles=3|10|20|50` with default 10
- [ ] **All Domain Coverage** - Test dlmm, perps, polymarket, spot (parallel execution)
- [ ] **All Action Types** - open, close, partial actions for each domain
- [ ] **Execution Validation** - Verify all 4 execution adapters work correctly
- [ ] **State Consistency** - Validate balance + position updates match execution results
- [ ] **Idempotency Testing** - Confirm retries work, duplicates blocked
- [ ] **Edge Case Simulation**:
  - Position not found (attempt close on non-existent)
  - API failures (network errors, timeouts)
  - Concurrent decisions (same target, different actions)
  - Balance exhaustion (insufficient funds)
- [ ] **Regression Tests** - Targeted tests for recent bug fixes:
  - "Target: N/A, Amount: $0" bug
  - Execution adapter missing
  - State update before validation
  - Idempotency blocking retries
  - MCP decision mapping issues
- [ ] **Skills System Testing**:
  - Skill loading and validation
  - Skill recommendation based on context
  - Skill application during cycles
  - Outcome tracking after decisions
- [ ] **Subagent Testing**:
  - MCP tool functionality (all domain servers)
  - Session management
  - Multi-turn conversations
  - Subagent spawning
- [ ] **Hook Testing**:
  - Validation hooks (pre-execution checks)
  - Verification hooks (post-execution validation)
  - Error handling hooks
- [ ] **Infrastructure Testing**:
  - Position monitoring updates
  - Portfolio coordinator directives
  - Idempotency service
  - Both DB providers (Prisma + Supabase)
- [ ] **Performance Metrics**:
  - Cycle timing (avg, min, max, p95)
  - API latency per domain
  - Agent decision time
  - Total test duration
- [ ] **Success Criteria**: 95%+ success rate with ZERO critical bugs
- [ ] **Output Artifacts**:
  - JSON report (structured results)
  - HTML dashboard (visual summary)
  - Detailed logs (debug + error streams)
- [ ] **CI/CD Integration**:
  - Exit code 0 on success, 1 on failure
  - Configurable timeout
  - Machine-readable output
- [ ] **Cost Conscious**: Use Haiku model only (~$0.01 per cycle)

### Should Have (P1)

- [ ] **Symptom Monitoring** - Watch for bug patterns even if not causing immediate failures
- [ ] **Realistic Behavior Mix** - 70% realistic scenarios, 30% forced edge cases
- [ ] **Cleanup Documentation** - Clear instructions for manual state cleanup
- [ ] **Parallel Execution** - Run all 4 domains concurrently per cycle
- [ ] **Real API Usage** - Test against actual Hyperliquid, Meteora, Polymarket APIs

### Nice to Have (P2)

- [ ] **Historical Comparison** - Compare results to previous test runs
- [ ] **Performance Regression Detection** - Alert if cycle time increases >20%
- [ ] **Coverage Report** - Show which code paths were exercised

### Out of Scope

- **Firecrawl Research Testing** - Skip to save time/cost (manual testing sufficient)
- **Real Money Trading** - All tests use paper trading mode
- **Automatic Cleanup** - Manual cleanup with documentation (safer)
- **Mock APIs** - Use real APIs for authentic testing

## Test Scenarios

### Realistic Scenarios (70%)

**DLMM:**
- Add liquidity to high-quality pool (TVL >$100k, APR >50%)
- Hold existing position earning fees
- Remove liquidity from underperforming pool (APR <20%)
- Partial remove from volatile pool

**Perps:**
- Open long on uptrending asset (RSI <40, positive momentum)
- Open short on downtrending asset (RSI >70, negative momentum)
- Hold position with reasonable P&L
- Close position with profit
- Partial close to take profits

**Polymarket:**
- Buy YES on high-conviction market (edge >10%)
- Buy NO on overpriced market (edge >10%)
- Hold position approaching resolution
- Sell position with profit
- Partial sell to lock gains

**Spot:**
- Buy dip on quality memecoin (volume >$1M, holders >1k)
- Hold position with moderate gain
- Sell pump on overvalued token
- Partial sell to de-risk

### Edge Case Scenarios (30%)

**Execution Failures:**
- Attempt close on position that doesn't exist → should fail gracefully
- Insufficient balance for trade → should decline with clear reason
- API timeout during execution → should retry with backoff
- Malformed decision (missing target) → should reject at validation

**Concurrent Operations:**
- Two agents try to close same position → one succeeds, one idempotency blocked
- Position monitor updates while agent deciding → should use latest value
- Coordinator directive conflicts with position → agent should reconcile

**Data Consistency:**
- Position exists in DB but not on-chain → verification hook should detect
- Balance mismatch between provider and cache → should reconcile
- Decision logged but execution failed → outcome should be "failed"

**System Limits:**
- Maximum positions per domain (10) → should reject new opens
- Minimum position size ($10) → should reject tiny trades
- Maximum position size (20% of balance) → should cap at limit

## Test Setup

### Initial State

```typescript
{
  balances: {
    dlmm: 500,      // $500 starting
    perps: 500,
    polymarket: 500,
    spot: 500
  },
  positions: {
    dlmm: [
      // One profitable pool earning fees
      { target: "SOL-USDC", valueUsd: 150, pnl: +15, feeApr: 65 }
    ],
    perps: [
      // One long position in profit
      { target: "SOL-PERP", side: "LONG", valueUsd: 200, pnl: +30 }
    ],
    polymarket: [
      // One YES position underwater
      { target: "CONDITION_123", outcome: "YES", valueUsd: 100, pnl: -50 }
    ],
    spot: [
      // One memecoin up 50%
      { target: "DINO", valueUsd: 100, pnl: +50 }
    ]
  }
}
```

### Configuration

```bash
# Environment
PAPER_TRADING=true
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
ACTIVE_DOMAINS=dlmm,perps,polymarket,spot
DATA_PROVIDER=prisma  # Test local DB first
LOG_LEVEL=info

# Test parameters (via CLI)
--cycles=10           # Default: 10 cycles
--parallel=true       # Run domains concurrently
--edge-cases=0.3      # 30% edge cases
--strict=true         # Fail on any critical bug
```

## System Testing Details

### Skills System

**Test Coverage:**
1. **Loading**: Verify core + community skills load successfully
2. **Recommendation**: Skills suggested based on domain/context
3. **Application**: Skills properly applied during decision cycles
4. **Outcome Tracking**: Skill outcomes logged after execution

**Validation:**
- At least 1 skill recommended per cycle
- Skills applied match recommendations
- Outcomes tracked for applied skills
- No skill loading errors

### Subagents

**Test Coverage:**
1. **MCP Tools**: All domain servers respond correctly
2. **Session Management**: Subagent contexts persist across turns
3. **Multi-turn**: Complex decisions requiring multiple exchanges
4. **Spawning**: Dynamic subagent creation for specialized tasks

**Validation:**
- All MCP servers accessible
- Tool calls succeed with valid responses
- Session state maintains consistency
- Spawned agents complete tasks

### Hooks

**Test Coverage:**
1. **Validation Hooks**: Pre-execution checks prevent bad decisions
2. **Verification Hooks**: Post-execution confirms on-chain state
3. **Error Handling**: Hooks catch and report failures gracefully

**Validation:**
- Invalid decisions rejected before execution
- Execution results verified against blockchain
- Hook errors don't crash system

### Infrastructure

**Test Coverage:**
1. **Position Monitoring**: Background updates keep P&L current
2. **Portfolio Coordinator**: Generates sensible directives
3. **Idempotency**: Prevents duplicate executions, allows retries
4. **DB Providers**: Both Prisma and Supabase work correctly

**Validation:**
- Position values update within 5 min
- Coordinator directives influence decisions
- Duplicates blocked, retries succeed
- Both DB providers pass all tests

## Performance Metrics

### Tracked Metrics

```typescript
interface StressTestMetrics {
  // Overall
  totalCycles: number;
  totalDuration: number;  // ms
  successRate: number;    // 0-1

  // Per cycle
  cycleTimings: {
    avg: number;
    min: number;
    max: number;
    p95: number;
  };

  // Per domain
  domainMetrics: {
    [domain: string]: {
      decisions: number;
      successes: number;
      failures: number;
      avgDecisionTime: number;  // ms
      avgApiLatency: number;    // ms
    };
  };

  // Systems
  skillsRecommended: number;
  skillsApplied: number;
  subagentsSpawned: number;
  hooksTriggered: number;
  idempotencyBlocks: number;

  // Edge cases
  edgeCasesAttempted: number;
  edgeCasesHandled: number;

  // Bugs
  criticalBugs: BugReport[];
  warnings: WarningReport[];
}
```

### Success Criteria

**PASS Conditions:**
- ✅ Success rate ≥ 95%
- ✅ Zero critical bugs
- ✅ All edge cases handled gracefully
- ✅ All systems tested successfully
- ✅ Performance within acceptable ranges:
  - Cycle time < 60s (p95)
  - API latency < 5s (avg)
  - Decision time < 30s (avg)

**FAIL Conditions:**
- ❌ Any critical bug detected
- ❌ Success rate < 95%
- ❌ Unhandled edge case crash
- ❌ System component failure
- ❌ Performance regression >50%

## Output Artifacts

### 1. JSON Report (`stress-test-results.json`)

```json
{
  "timestamp": "2026-01-08T10:30:00Z",
  "config": {
    "cycles": 10,
    "domains": ["dlmm", "perps", "polymarket", "spot"],
    "edgeCaseRate": 0.3
  },
  "metrics": { /* ... */ },
  "decisions": [
    {
      "cycle": 1,
      "domain": "spot",
      "action": "sell",
      "target": "DINO",
      "success": true,
      "timing": 2500,
      "edgeCase": false
    }
  ],
  "bugs": [],
  "warnings": [],
  "verdict": "PASS"
}
```

### 2. HTML Dashboard (`stress-test-report.html`)

**Sections:**
- Executive Summary (verdict, success rate, duration)
- Performance Charts (cycle timing, API latency)
- Domain Breakdown (decisions per domain, success rates)
- System Coverage (skills, subagents, hooks, infrastructure)
- Edge Cases (attempted vs handled)
- Bug Reports (critical + warnings)
- Recommendations (what to fix before production)

### 3. Detailed Logs (`stress-test.log`)

```
[2026-01-08 10:30:00] INFO: Starting stress test (cycles=10, domains=4)
[2026-01-08 10:30:01] INFO: Initial state: $2000 balance, 4 positions
[2026-01-08 10:30:02] INFO: Cycle 1/10 starting...
[2026-01-08 10:30:02] DEBUG: [SPOT] Loaded market data: 60 tokens
[2026-01-08 10:30:03] DEBUG: [SPOT] Skills recommended: [memecoin-momentum, risk-management]
[2026-01-08 10:30:05] INFO: [SPOT] Decision: sell DINO (confidence: 0.85)
[2026-01-08 10:30:05] DEBUG: [SPOT] Validation hook: PASS
[2026-01-08 10:30:06] DEBUG: [SPOT] Execution: success ($150 realized, +50% PnL)
[2026-01-08 10:30:06] DEBUG: [SPOT] Verification hook: PASS
[2026-01-08 10:30:06] INFO: [SPOT] ✅ success (2.5s)
...
```

## Cleanup Process

### Manual Cleanup Steps

```bash
# 1. Review test state
npx tsx -e "
import { getPortfolio } from './src/data/provider.js';
const p = await getPortfolio();
console.log('Portfolio:', p);
"

# 2. Clean up test positions (if needed)
# Run SQL or Supabase cleanup queries documented below

# 3. Reset balances
npx tsx scripts/reset-balances.ts
```

### SQL Cleanup (Prisma)

```sql
-- Delete test decisions
DELETE FROM Decision WHERE created_at >= '2026-01-08';

-- Close test positions
UPDATE Position
SET status = 'closed', closed_at = NOW()
WHERE opened_at >= '2026-01-08';

-- Reset domain balances
UPDATE DomainBalance SET balance = 500.0;

-- Clear idempotency records
DELETE FROM IdempotencyRecord WHERE created_at >= '2026-01-08';
```

### Supabase Cleanup

```typescript
// Run via: npx tsx scripts/cleanup-test-data.ts
import { supabase } from './src/clients/supabase/client.js';

await supabase.from('decisions').delete().gte('created_at', '2026-01-08');
await supabase.from('positions').update({ status: 'closed' }).gte('opened_at', '2026-01-08');
await supabase.from('domain_balances').update({ balance: 500.0 });
await supabase.from('idempotency_records').delete().gte('created_at', '2026-01-08');
```

## CI/CD Integration

### GitHub Actions Workflow

```yaml
name: Stress Test

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  stress-test:
    runs-on: ubuntu-latest
    timeout-minutes: 10

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: 18

      - name: Install dependencies
        run: npm ci

      - name: Run stress test (CI mode)
        run: npm run test:stress -- --cycles=3
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}
          PAPER_TRADING: true
          ANTHROPIC_MODEL: claude-3-5-haiku-20241022

      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: stress-test-results
          path: |
            stress-test-results.json
            stress-test-report.html
            stress-test.log
```

### Cost Estimation

```
Model: Claude 3.5 Haiku
Cost per cycle: ~$0.01 (4 domains × ~2.5k tokens each)

CI mode (3 cycles):    $0.03
Fast mode (10 cycles): $0.10
Standard (20 cycles):  $0.20
Stress (50 cycles):    $0.50
```

## Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| API rate limits | Medium | High | Use delays between calls, respect limits |
| Test pollution | Low | Medium | Clear documentation for manual cleanup |
| False positives | Medium | Low | Strict validation, regression baselines |
| Flaky tests | Low | High | Retry logic, deterministic scenarios |
| Cost overrun | Low | Low | Haiku model, configurable cycles |

## Open Questions

- [ ] Should we test with both DB providers in same run or separate?
- [ ] How to handle non-deterministic market data (prices change)?
- [ ] Should we mock time for consistent test conditions?
- [ ] Need test data fixtures for reproducible scenarios?

## Implementation Checklist

- [ ] Create `src/test-e2e-stress.ts` main test file
- [ ] Implement cycle execution with parallel domains
- [ ] Add edge case injection logic
- [ ] Implement metrics collection
- [ ] Create HTML report generator
- [ ] Add regression test scenarios
- [ ] Test skills system integration
- [ ] Test subagent spawning
- [ ] Test hook execution
- [ ] Test infrastructure components
- [ ] Add CLI argument parsing
- [ ] Create cleanup scripts
- [ ] Write documentation
- [ ] Add to package.json scripts
- [ ] Test in CI environment

## Appendix

### Bug Regression Tests

**Test 1: "Target: N/A, Amount: $0" Bug**
```typescript
// Force close decision without proper MCP response mapping
// Should: Reject at validation OR extract target from position
// Should NOT: Execute with N/A target
```

**Test 2: Execution Adapter Missing**
```typescript
// Attempt trade on polymarket/dlmm/perps
// Should: Execute successfully with new adapters
// Should NOT: Fail with "adapter not implemented"
```

**Test 3: State Update Before Validation**
```typescript
// Simulate executor failure after state update
// Should: Rollback state changes
// Should NOT: Leave inconsistent state
```

**Test 4: Idempotency Blocking Retries**
```typescript
// First attempt fails with transient error
// Should: Allow retry after backoff
// Should NOT: Block retry as duplicate
```

### Reference Test Patterns

From `src/test-learning-stress.ts`:
```typescript
// Synthetic data generation
function generateTestTrades(count: number, successRate: number) { ... }

// Metrics collection
function calculateMetrics(results: TradeResult[]) { ... }

// Color output
console.log(result.success ? '✅' : '❌', result.description);
```

From `src/test-resilience.ts`:
```typescript
// Component testing
async function testResilientFetch() { ... }
async function testTranscriptStore() { ... }

// Assertion pattern
if (condition) {
  console.log('✅ PASS:', description);
} else {
  console.log('❌ FAIL:', description);
  failures++;
}
```

---

**Version:** 1.0.0
**Last Updated:** 2026-01-08
**Status:** Ready for Implementation
