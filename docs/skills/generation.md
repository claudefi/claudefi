# Skill Generation

This document explains how claudefi generates skills from trading outcomes.

## Generation Flow

```
Position Closes
      │
      ▼
┌─────────────┐
│ Significant │──No──→ Skip
│  Outcome?   │
└─────────────┘
      │ Yes
      ▼
┌─────────────┐
│   Judge     │
│  Evaluates  │
└─────────────┘
      │
      ▼
┌─────────────┐
│  Generate   │
│   Skill     │
└─────────────┘
      │
      ▼
┌─────────────┐
│   Similar   │──Yes──→ Merge
│   Exists?   │
└─────────────┘
      │ No
      ▼
┌─────────────┐
│    Save     │
│    Skill    │
└─────────────┘
```

## Significance Thresholds

Not every trade generates a skill. Thresholds:

```typescript
const SKILL_THRESHOLDS = {
  // Warning skills
  loss_percent: -0.10,    // Loss > 10%

  // Pattern skills
  win_percent: 0.20,      // Win > 20%

  // Strategy skills
  trade_count: 10,        // Every 10 trades per domain
};
```

## The Judge Evaluation

Before generating a skill, the Judge evaluates the decision:

```typescript
interface DecisionEvaluation {
  decisionId: string;
  wasGoodDecision: boolean;
  qualityScore: number;        // 0-1
  keyInsight: string;          // Main lesson
  insightType: string;         // timing, sizing, selection, risk
  strengths: string[];
  weaknesses: string[];
  betterApproach: string;
}
```

The evaluation feeds into skill generation:

```typescript
async function evaluateAndGenerateSkill(position: Position): Promise<Skill | null> {
  // 1. Check significance
  const pnlPercent = position.realizedPnl / position.entryValueUsd;
  if (Math.abs(pnlPercent) < 0.10) {
    return null; // Not significant enough
  }

  // 2. Get judge evaluation
  const evaluation = await judge.evaluateDecision(position);

  // 3. Determine skill type
  const skillType = pnlPercent < 0 ? 'warning' : 'pattern';

  // 4. Generate skill content
  const skill = await generateSkillContent(position, evaluation, skillType);

  // 5. Check for similar skills
  const similar = await findSimilarSkills(skill.content, position.domain);

  if (similar.length >= 2) {
    // Merge into evolved skill
    return await mergeSkills([...similar, skill]);
  }

  // 6. Save new skill
  return await saveSkill(skill);
}
```

## Skill Content Generation

Claude generates the skill content using position data and evaluation:

```typescript
async function generateSkillContent(
  position: Position,
  evaluation: DecisionEvaluation,
  skillType: 'warning' | 'pattern'
): Promise<Skill> {

  const prompt = buildSkillPrompt(position, evaluation, skillType);

  const response = await anthropic.messages.create({
    model: 'claude-opus-4-5-20250514',
    max_tokens: 2000,
    messages: [{
      role: 'user',
      content: prompt,
    }],
  });

  const content = response.content[0].text;

  return {
    name: extractSkillName(content),
    type: skillType,
    domain: position.domain,
    content: content,
    createdAt: new Date(),
    expiresAt: calculateExpiry(skillType),
    sourcePosition: position.id,
    metadata: {
      pnl: position.realizedPnl,
      pnlPercent: position.realizedPnl / position.entryValueUsd,
      evaluation: evaluation,
    },
  };
}
```

## Skill Prompt Templates

### Warning Skill Prompt

```typescript
const warningPrompt = `
Analyze this losing trade and create a warning skill:

## Trade Details
- Domain: ${position.domain}
- Target: ${position.target}
- Action: ${decision.action}
- Entry Value: $${position.entryValueUsd}
- P&L: $${position.realizedPnl} (${pnlPercent}%)
- Holding Period: ${holdingDays} days

## Original Reasoning
${decision.reasoning}

## Judge Evaluation
${evaluation.keyInsight}
Weaknesses: ${evaluation.weaknesses.join(', ')}
Better Approach: ${evaluation.betterApproach}

## Market Context at Entry
${marketContext}

---

Create a WARNING skill in markdown format that will help prevent similar
losses in the future. Include:

1. Pattern to Recognize - What conditions led to this loss
2. What Went Wrong - Analysis of the mistake
3. Better Approach - How to avoid this in the future
4. Checklist - Verification steps before similar trades

Be specific and actionable. This will be used to guide future decisions.
`;
```

### Pattern Skill Prompt

```typescript
const patternPrompt = `
Analyze this winning trade and create a pattern skill:

## Trade Details
- Domain: ${position.domain}
- Target: ${position.target}
- Action: ${decision.action}
- Entry Value: $${position.entryValueUsd}
- P&L: $${position.realizedPnl} (${pnlPercent}%)
- Holding Period: ${holdingDays} days

## Original Reasoning
${decision.reasoning}

## Judge Evaluation
${evaluation.keyInsight}
Strengths: ${evaluation.strengths.join(', ')}

## Market Context at Entry
${marketContext}

---

Create a PATTERN skill in markdown format that will help replicate this
success in the future. Include:

1. Pattern Conditions - What market conditions and signals were present
2. Why It Worked - Analysis of success factors
3. Entry Criteria - When to look for this pattern
4. Risk Management - Position sizing and exit rules

Be specific and actionable. This will be used to guide future decisions.
`;
```

## Saving Skills

Skills are saved to both filesystem and database:

```typescript
async function saveSkill(skill: Skill): Promise<Skill> {
  // 1. Save to filesystem
  const filename = `${skill.type}-${skill.domain}-${slugify(skill.name)}.md`;
  const filepath = path.join('.claude/skills', filename);

  await fs.writeFile(filepath, skill.content);

  // 2. Save to database
  await db.skillReflection.create({
    data: {
      skillName: skill.name,
      domain: skill.domain,
      sourceType: skill.type,
      filePath: filepath,
      effectivenessScore: null, // Not yet tracked
      timesApplied: 0,
      successCount: 0,
      failureCount: 0,
      createdAt: skill.createdAt,
      expiresAt: skill.expiresAt,
    },
  });

  return skill;
}
```

## Strategy Skill Generation

Strategy skills are generated periodically, not from single trades:

```typescript
async function generateStrategySkill(domain: Domain): Promise<Skill | null> {
  // Check if it's time (every 10 trades)
  const tradeCount = await db.decision.count({
    where: {
      domain: domain,
      createdAt: { gte: lastStrategyGeneration(domain) },
    },
  });

  if (tradeCount < 10) {
    return null;
  }

  // Get recent trades for analysis
  const trades = await db.decision.findMany({
    where: { domain: domain },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { position: true },
  });

  // Generate strategy from trade history
  const prompt = buildStrategyPrompt(trades, domain);
  const content = await claude.generate(prompt);

  return saveSkill({
    name: extractSkillName(content),
    type: 'strategy',
    domain: domain,
    content: content,
    // ...
  });
}
```

## Related Documentation

- [Skills Overview](./overview.md) - System introduction
- [Skill Types](./types.md) - Type descriptions
- [Skill Effectiveness](./effectiveness.md) - Tracking performance
