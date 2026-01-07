# Skill Effectiveness

claudefi tracks how well each skill performs in practice, using this data to filter which skills appear in context.

## Effectiveness Score

Each skill has an effectiveness score (0-1) based on outcomes when the skill was relevant:

```typescript
interface SkillReflection {
  skillName: string;
  domain: string;
  sourceType: string;
  effectivenessScore: number | null;  // 0-1, null if not enough data
  timesApplied: number;
  successCount: number;
  failureCount: number;
}
```

## Calculation

```typescript
function calculateEffectiveness(skill: SkillReflection): number | null {
  // Need minimum applications for statistical significance
  if (skill.timesApplied < 3) {
    return null;  // Not enough data
  }

  // Base effectiveness from success rate
  const successRate = skill.successCount / skill.timesApplied;

  // Weight by sample size (more confident with more data)
  const confidence = Math.min(skill.timesApplied / 10, 1);

  // Bayesian-style adjustment toward 50% with low samples
  const priorWeight = 1 - confidence;
  const adjustedScore = (successRate * confidence) + (0.5 * priorWeight);

  return adjustedScore;
}
```

## Tracking Application

When Claude makes a decision, the system tracks which skills were relevant:

```typescript
async function trackSkillApplication(
  decision: Decision,
  relevantSkills: Skill[],
  outcome: 'success' | 'failure' | 'neutral'
): Promise<void> {

  for (const skill of relevantSkills) {
    await db.skillReflection.update({
      where: { skillName: skill.name },
      data: {
        timesApplied: { increment: 1 },
        successCount: outcome === 'success' ? { increment: 1 } : undefined,
        failureCount: outcome === 'failure' ? { increment: 1 } : undefined,
      },
    });
  }

  // Recalculate effectiveness scores
  await recalculateEffectivenessScores(relevantSkills);
}
```

## Determining Relevance

A skill is considered "relevant" to a decision if:

```typescript
function isSkillRelevant(skill: Skill, decision: Decision): boolean {
  // Same domain
  if (skill.domain !== decision.domain && skill.domain !== 'general') {
    return false;
  }

  // Warning skills: relevant if conditions match
  if (skill.type === 'warning') {
    return doesDecisionMatchWarningPattern(skill, decision);
  }

  // Pattern skills: relevant if Claude cited it in reasoning
  if (skill.type === 'pattern') {
    return decision.reasoning.includes(skill.name) ||
           doesDecisionMatchPatternConditions(skill, decision);
  }

  // Strategy skills: always relevant for their domain
  return true;
}
```

## Outcome Classification

After a position closes, the outcome is classified:

```typescript
function classifyOutcome(position: Position): 'success' | 'failure' | 'neutral' {
  const pnlPercent = position.realizedPnl / position.entryValueUsd;

  // For warning skills (should prevent losses)
  if (skillWasWarning) {
    // If we heeded warning and held: success
    // If we ignored warning and lost: failure
    return pnlPercent >= 0 ? 'success' : 'failure';
  }

  // For pattern skills (should predict wins)
  if (skillWasPattern) {
    // If pattern predicted well: success
    // If pattern failed: failure
    return pnlPercent > 0.05 ? 'success' : pnlPercent < -0.05 ? 'failure' : 'neutral';
  }

  // For strategy skills
  return pnlPercent > 0 ? 'success' : pnlPercent < -0.03 ? 'failure' : 'neutral';
}
```

## Filtering by Effectiveness

Low-effectiveness skills are excluded from context:

```typescript
async function getEffectiveSkills(domain: Domain): Promise<Skill[]> {
  const skills = await db.skillReflection.findMany({
    where: {
      OR: [
        { domain: domain },
        { domain: 'general' },
      ],
      // Only include skills with effectiveness >= 30% or not yet measured
      OR: [
        { effectivenessScore: { gte: 0.3 } },
        { effectivenessScore: null },
      ],
      // Not expired
      expiresAt: { gt: new Date() },
    },
    orderBy: [
      { effectivenessScore: 'desc' },
      { timesApplied: 'desc' },
    ],
  });

  return skills;
}
```

## Expiration

Skills expire after their TTL regardless of effectiveness:

```typescript
const SKILL_TTL_DAYS = {
  warning: 60,
  pattern: 90,
  strategy: 180,
  evolved: 180,
};

async function archiveExpiredSkills(): Promise<void> {
  const expiredSkills = await db.skillReflection.findMany({
    where: {
      expiresAt: { lt: new Date() },
    },
  });

  for (const skill of expiredSkills) {
    // Move file to archive
    const archivePath = skill.filePath.replace('/skills/', '/skills/archive/');
    await fs.rename(skill.filePath, archivePath);

    // Update database
    await db.skillReflection.update({
      where: { id: skill.id },
      data: { archived: true, archivedAt: new Date() },
    });

    console.log(`Archived expired skill: ${skill.skillName}`);
  }
}
```

## Effectiveness Dashboard

View skill effectiveness via Prisma Studio:

```bash
npm run db:studio
```

Or query programmatically:

```typescript
const skillStats = await db.skillReflection.findMany({
  select: {
    skillName: true,
    domain: true,
    sourceType: true,
    effectivenessScore: true,
    timesApplied: true,
    successCount: true,
    failureCount: true,
  },
  orderBy: { effectivenessScore: 'desc' },
});

console.table(skillStats);
```

Example output:

```
┌─────────────────────────────────┬─────────┬───────────┬────────────┬─────────┬─────────┬─────────┐
│ skillName                       │ domain  │ type      │ effective  │ applied │ success │ failure │
├─────────────────────────────────┼─────────┼───────────┼────────────┼─────────┼─────────┼─────────┤
│ pattern-perps-rsi-oversold      │ perps   │ pattern   │ 0.85       │ 12      │ 10      │ 2       │
│ warning-dlmm-low-tvl            │ dlmm    │ warning   │ 0.78       │ 8       │ 6       │ 2       │
│ strategy-polymarket-elections   │ poly    │ strategy  │ 0.72       │ 15      │ 11      │ 4       │
│ pattern-spot-volume-surge       │ spot    │ pattern   │ 0.45       │ 6       │ 3       │ 3       │
└─────────────────────────────────┴─────────┴───────────┴────────────┴─────────┴─────────┴─────────┘
```

## Improving Effectiveness

Skills with low effectiveness may indicate:

1. **Pattern too specific** - Only worked in one market condition
2. **Pattern too general** - Not predictive enough
3. **Market changed** - Pattern was valid but conditions shifted

The skill merger attempts to combine related skills into more robust evolved skills.

## Related Documentation

- [Skills Overview](./overview.md) - System introduction
- [Skill Types](./types.md) - Type descriptions
- [Skill Generation](./generation.md) - Creation process
