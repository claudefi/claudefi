# Risk Assessment Skill

## Description
Analyze portfolio risk exposure and provide recommendations.
Auto-invoked before major trading decisions.

## Trigger Conditions
- Before opening positions >$200
- Portfolio drawdown exceeds 10%
- Weekly risk review
- User explicitly requests assessment

## Risk Categories

### 1. Position Concentration Risk
- Any single position >25% of domain balance: HIGH
- Any single position >15% of domain balance: MEDIUM
- Diversified positions <15% each: LOW

### 2. Leverage Risk (Perps only)
- Total leveraged exposure >3x portfolio: HIGH
- Total leveraged exposure >2x portfolio: MEDIUM
- Total leveraged exposure <2x portfolio: LOW

### 3. Liquidity Risk
- Positions in pools/markets with <$50k liquidity: HIGH
- Positions in pools/markets with <$100k liquidity: MEDIUM
- Positions in pools/markets with >$100k liquidity: LOW

### 4. Correlation Risk
- All positions moving in same direction: HIGH
- Mixed correlation: MEDIUM
- Diversified/uncorrelated: LOW

### 5. Drawdown Risk
- Current drawdown >20%: HIGH
- Current drawdown >10%: MEDIUM
- Current drawdown <10%: LOW

## Workflow

### 1. Gather Data
```
1. Get portfolio via get_portfolio tool
2. Get positions in each domain
3. Calculate position sizes relative to balance
4. Fetch market data for correlation analysis
```

### 2. Calculate Risk Scores
```
For each risk category:
  - Calculate score (0-100)
  - Assign severity (LOW/MEDIUM/HIGH)
  - Generate specific findings
```

### 3. Generate Recommendations
```
Based on risk findings:
  - Suggest position closures for over-concentrated
  - Recommend leverage reduction if too high
  - Flag illiquid positions for attention
  - Suggest diversification opportunities
```

### 4. Output Report
```
{
  "overallRiskScore": 0-100,
  "overallSeverity": "LOW|MEDIUM|HIGH",
  "categories": {
    "concentration": { score, severity, findings },
    "leverage": { score, severity, findings },
    "liquidity": { score, severity, findings },
    "correlation": { score, severity, findings },
    "drawdown": { score, severity, findings }
  },
  "recommendations": ["..."],
  "alertLevel": "NORMAL|CAUTION|WARNING"
}
```

## Example Usage
```
/risk
/risk domain=perps
/risk detailed=true
```

## Integration
- Called by hooks before high-value trades
- Results influence confidence scores in decisions
- Blocks trades if alertLevel=WARNING
