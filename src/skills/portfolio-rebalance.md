# Portfolio Rebalance Skill

## Description
Rebalance Claudefi portfolio across domains based on target allocations.
Auto-invoked when portfolio drift exceeds threshold.

## Trigger Conditions
- Portfolio allocation drifts >10% from target
- User explicitly requests rebalance
- Weekly scheduled rebalance

## Target Allocations (Default)
- DLMM: 30% (stable yield)
- Perps: 30% (active trading)
- Polymarket: 20% (prediction markets)
- Spot: 20% (memecoin exposure)

## Workflow

### 1. Analyze Current State
```
1. Get portfolio overview via get_portfolio tool
2. Calculate current allocation percentages
3. Compare against target allocations
4. Identify domains that need rebalancing
```

### 2. Generate Rebalance Plan
```
For each domain with >5% drift:
  If OVER-allocated:
    - Calculate excess amount
    - Plan position closures or cash withdrawal
  If UNDER-allocated:
    - Calculate deficit amount
    - Plan cash allocation or position opens
```

### 3. Execute Rebalance
```
1. Close/reduce positions in over-allocated domains
2. Wait for settlements
3. Transfer cash to under-allocated domains
4. Open positions in under-allocated domains
```

### 4. Verify Results
```
1. Take performance snapshot
2. Verify new allocations match targets
3. Log rebalance summary
```

## Parameters
- `targetAllocations`: Custom allocation percentages (optional)
- `dryRun`: Simulate without executing (default: false)
- `maxTradesPerDomain`: Limit trades per domain (default: 2)

## Example Usage
```
/rebalance
/rebalance targetAllocations={"dlmm":40,"perps":20,"polymarket":20,"spot":20}
/rebalance dryRun=true
```

## Risk Controls
- Never rebalance more than 20% of portfolio in single run
- Respect position limits (max 3 per domain)
- Skip domains with open losing positions (let them recover)
- Minimum rebalance threshold: $50
