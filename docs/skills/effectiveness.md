# Skill Effectiveness

claudefi tracks how well each skill performs in practice, using statistical methods to identify truly effective skills while filtering out noise.

## Overview

The effectiveness system solves a key challenge: **how do you know if a skill is actually helpful vs. just lucky?**

With small sample sizes, random variance can make bad skills look good. A skill with 2 wins out of 3 tries (67% success) might seem effective, but statistically it could easily be luck.

We use **Wilson score confidence intervals** to require stronger statistical evidence before marking a skill as "proven effective."

## Qualification Criteria

A skill becomes **proven effective** when it meets ALL of these criteria:

| Criterion | Value | Rationale |
|-----------|-------|-----------|
| Minimum Applications | 5 | Need enough data for statistical confidence |
| Minimum Success Rate | 55% | Better than random chance |
| Minimum Wilson Score | 0.45 | 90% confident true rate is above 45% |

```typescript
// From src/skills/types.ts
export const MIN_APPLICATIONS_FOR_PROVEN = 5;
export const MIN_SUCCESS_RATE_FOR_EFFECTIVE = 0.55;
export const MIN_WILSON_LOWER_BOUND = 0.45;
export const WILSON_Z_SCORE = 1.645;  // 90% confidence
```

## Wilson Score Calculation

The Wilson score provides a conservative lower bound estimate of the true success rate.

```typescript
/**
 * Calculate Wilson score lower bound
 * https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval
 */
export function wilsonScoreLowerBound(
  successes: number,
  total: number,
  z: number = 1.645  // 90% confidence
): number {
  if (total === 0) return 0;

  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

  return Math.max(0, (center - spread) / denominator);
}
```

### Example Calculations

| Applications | Successes | Success Rate | Wilson Score | Proven? |
|--------------|-----------|--------------|--------------|---------|
| 3 | 2 | 67% | 0.22 | No (need more data) |
| 5 | 4 | 80% | 0.44 | No (borderline) |
| 7 | 5 | 71% | 0.45 | Yes |
| 10 | 7 | 70% | 0.48 | Yes |
| 20 | 12 | 60% | 0.46 | Yes |

The key insight: with small samples, even high success rates have low Wilson scores. This prevents lucky streaks from qualifying bad skills.

## Proven Effectiveness Check

```typescript
export function meetsProvenCriteria(
  successCount: number,
  timesApplied: number
): { provenEffective: boolean; wilsonScore: number; successRate: number } {
  if (timesApplied < MIN_APPLICATIONS_FOR_PROVEN) {
    return { provenEffective: false, wilsonScore: 0, successRate: 0 };
  }

  const successRate = successCount / timesApplied;
  const wilsonScore = wilsonScoreLowerBound(successCount, timesApplied);

  const provenEffective =
    successRate >= MIN_SUCCESS_RATE_FOR_EFFECTIVE &&
    wilsonScore >= MIN_WILSON_LOWER_BOUND;

  return { provenEffective, wilsonScore, successRate };
}
```

## Active Demotion

Skills can **lose** their proven status if performance degrades. This prevents stale skills from remaining recommended when market conditions change.

### Demotion Triggers

A proven skill is demoted if:

1. **Consecutive failures** (≥3) AND Wilson score drops below threshold
2. **Success rate** drops below 55%

```typescript
// Demotion logic in updateSkillEffectiveness()
if (reflection.provenEffective && consecutiveFailures >= MIN_FAILURES_FOR_DEMOTION) {
  const wilson = wilsonScoreLowerBound(successCount, timesApplied);
  if (wilson < MIN_WILSON_LOWER_BOUND) {
    provenEffective = false;
    console.log(`📉 Demoting '${skillName}': ${consecutiveFailures} failures`);
  }
}

if (reflection.provenEffective && successRate < MIN_SUCCESS_RATE_FOR_EFFECTIVE) {
  provenEffective = false;
  console.log(`📉 Demoting '${skillName}': success rate ${(successRate * 100).toFixed(0)}%`);
}
```

## Time-Weighted Success Rate

Recent outcomes matter more than old ones. A skill that worked 6 months ago but fails now should not stay proven.

```typescript
export const RECENCY_DECAY_DAYS = 30;  // Half-life

async function calculateWeightedSuccessRate(
  skillName: string,
  domain: string
): Promise<{ weightedRate: number; effectiveSamples: number }> {
  const recommendations = await prisma.skillRecommendation.findMany({
    where: { skillName, domain, wasApplied: true },
  });

  let weightedSuccesses = 0;
  let totalWeight = 0;

  for (const rec of recommendations) {
    const ageDays = (Date.now() - rec.createdAt.getTime()) / (1000 * 60 * 60 * 24);
    const weight = Math.exp(-ageDays / RECENCY_DECAY_DAYS);

    if (rec.tradeOutcome === 'profit') {
      weightedSuccesses += weight;
    }
    totalWeight += weight;
  }

  return {
    weightedRate: totalWeight > 0 ? weightedSuccesses / totalWeight : 0,
    effectiveSamples: totalWeight,
  };
}
```

### Decay Example

| Outcome Age | Weight | Contribution |
|-------------|--------|--------------|
| Today | 1.00 | Full weight |
| 15 days ago | 0.61 | 61% weight |
| 30 days ago | 0.37 | 37% weight |
| 60 days ago | 0.14 | 14% weight |

## Database Schema

```prisma
model SkillReflection {
  skillName           String
  domain              String
  sourceType          String    // warning, pattern, strategy

  // Effectiveness tracking
  timesApplied        Int       @default(0)
  successCount        Int       @default(0)
  failureCount        Int       @default(0)
  effectivenessScore  Float?    // Raw success rate

  // Qualification status
  provenEffective     Boolean   @default(false)
  qualifiedAt         DateTime?
  consecutiveFailures Int       @default(0)
  lastApplied         DateTime?

  @@unique([skillName, domain])
}
```

## Stress Testing

The effectiveness system is validated with synthetic trade simulations:

```bash
# Run stress test (500 trades, 20 skills)
npx tsx src/test-learning-stress.ts

# Run with cleanup
npx tsx src/test-learning-stress.ts --cleanup
```

### Test Configuration

```typescript
const DEFAULT_CONFIG = {
  tradeCount: 500,
  lessonCount: 20,
  domains: ['dlmm', 'perps', 'spot', 'polymarket'],
  profitProbability: 0.45,    // Base 45% win rate
  lessonBoost: 0.15,          // Good lessons add 15%
  goodLessonRatio: 0.4,       // 40% of lessons are actually good
};
```

### Expected Results

| Metric | Target |
|--------|--------|
| False Positive Rate | < 5% |
| Classification Accuracy | > 85% with enough data |

The system prioritizes **low false positives** over high accuracy. It's better to be conservative (not recommending a potentially good skill) than to recommend a bad skill.

## Outcome Recording

When a trade closes, outcomes are recorded for all applied skills:

```typescript
export async function recordSkillOutcome(
  decisionId: string,
  outcome: 'profit' | 'loss',
  pnlPercent: number
): Promise<SkillOutcomeResult> {
  const recommendations = await prisma.skillRecommendation.findMany({
    where: { decisionId },
  });

  for (const rec of recommendations) {
    if (rec.wasApplied) {
      await updateSkillEffectiveness(
        rec.skillName,
        rec.domain,
        outcome === 'profit'
      );
    }
  }
}
```

## Getting Comprehensive Stats

```typescript
const stats = await getComprehensiveSkillStats('my-skill', 'dlmm');
// Returns:
// {
//   timesApplied: 15,
//   successRate: 0.67,
//   wilsonScore: 0.48,
//   weightedSuccessRate: 0.62,
//   provenEffective: true,
//   consecutiveFailures: 0,
// }
```

## Filtering by Effectiveness

Only proven effective skills are recommended in prompts:

```typescript
export async function getProvenEffectiveSkills(domain: Domain): Promise<string[]> {
  const reflections = await prisma.skillReflection.findMany({
    where: {
      domain,
      provenEffective: true,
    },
    select: { skillName: true },
  });

  return reflections.map(r => r.skillName);
}
```

## Underperforming Skills

Identify skills that may need archiving:

```typescript
export async function getUnderperformingSkills(domain: Domain) {
  return prisma.skillReflection.findMany({
    where: {
      domain,
      timesApplied: { gte: MIN_APPLICATIONS_FOR_PROVEN },
      effectivenessScore: { lt: MIN_SUCCESS_RATE_FOR_EFFECTIVE },
    },
  });
}
```

## Related Documentation

- [Skills Overview](./overview.md) - System introduction
- [Skill Types](./types.md) - Type descriptions
- [Skill Generation](./generation.md) - Creation process
- [Lesson Recommendations](../learning/lesson-recommendations.md) - How skills are recommended
