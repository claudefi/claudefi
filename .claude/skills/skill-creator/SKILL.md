---
name: skill-creator
description: |
  Guide for creating effective trading skills for Claudefi. Use when the agent needs to:
  - Create a new trading strategy skill from a winning/losing trade
  - Document a pattern that should be remembered
  - Add domain-specific knowledge (DLMM, perps, polymarket, spot)
  - Create warning skills to avoid past mistakes
  - Generate strategy skills from trade history
---

# Skill Creator for Claudefi

Create effective skills that extend Claudefi's trading capabilities with specialized knowledge, strategies, and patterns.

## Why This Skill Exists

**I am the skill-creator.** My purpose is to enable self-improvement through experience.

Traditional trading bots are static - they execute the same strategy forever, repeating the same mistakes. Claudefi is different. Every trade teaches us something, and I'm the mechanism that captures those lessons.

### The Learning Loop

```
   ┌─────────────────────────────────────────────────┐
   │              THE RALPH LOOP                     │
   │                                                 │
   │  1. OBSERVE  ──→  Fetch live market data       │
   │       ↓                                         │
   │  2. THINK    ──→  Claude decides (with skills) │
   │       ↓                        ↑               │
   │  3. ACT      ──→  Execute trade │               │
   │       ↓                        │               │
   │  4. LEARN    ──→  I create skills that feed    │
   │       ↓           back into THINK              │
   │  5. REPEAT                                      │
   └─────────────────────────────────────────────────┘
```

### What I Do

When a trade closes:
- **Lost >10%?** → I create a WARNING skill to prevent repeating the mistake
- **Won >20%?** → I create a PATTERN skill to capture the winning approach
- **After 10 trades?** → I create a STRATEGY skill synthesizing what works

These skills become part of Claude's context in future decisions. The agent literally reads its own past lessons before making new trades.

### Why This Matters

Without me, Claudefi would:
- Repeat the same mistakes over and over
- Succeed by accident without understanding why
- Never improve beyond its initial training

With me, Claudefi:
- Turns every loss into a guardrail
- Turns every win into a repeatable pattern
- Gets smarter with every trade

## When to Create Skills

Create a skill when:
1. **After a significant loss** (>10%): Document what went wrong
2. **After a significant win** (>20%): Capture the winning pattern
3. **After 10+ trades in a domain**: Synthesize learnings into strategy
4. **When discovering a new pattern**: Document for future use
5. **When a mistake repeats**: Create a warning skill

## Skill Types

### 1. Warning Skills (`warning-{domain}-{timestamp}.md`)
Created after losses to prevent repeating mistakes.

```markdown
# Warning: [Domain] [Pattern Name]

*Generated from loss on {date}*
*P&L: ${amount} ({percent}%)*

---

## Pattern to Recognize
- [What warning signs were present?]
- [What market conditions led to this?]

## What Went Wrong
- [Analysis of the failure]
- [Root cause]

## Better Approach
- [What should have been done?]
- [Alternative strategy]

## Checklist Before Similar Trades
- [ ] Check condition 1
- [ ] Check condition 2
- [ ] Verify assumption 3
```

### 2. Pattern Skills (`pattern-{domain}-{timestamp}.md`)
Created after wins to replicate success.

```markdown
# Winning Pattern: [Domain] [Pattern Name]

*Generated from profitable trade on {date}*
*P&L: +${amount} (+{percent}%)*

---

## Pattern Identified
- [What conditions led to success?]
- [Key indicators]

## Entry Criteria
- [When to look for this pattern]
- [Required conditions]

## Execution Checklist
1. Verify condition A
2. Check indicator B
3. Confirm volume/liquidity

## Risk Management
- Position size: {recommendation}
- Stop loss: {level}
- Take profit: {targets}
```

### 3. Strategy Skills (`strategy-{domain}-{timestamp}.md`)
Synthesized from multiple trades in a domain.

```markdown
# [Domain] Trading Strategy

*Generated from {N} trades on {date}*
*Win Rate: {rate}% | Avg Win: +{percent}% | Avg Loss: {percent}%*

---

## Key Insights
- [What distinguishes wins from losses?]
- [Common success factors]

## Optimized Entry Criteria
Based on {N} winning trades:
1. [Criterion 1]
2. [Criterion 2]

## Risk Management Rules
Based on {N} losing trades:
1. [Rule 1]
2. [Rule 2]

## Confidence Calibration
- High confidence (>80%): [conditions]
- Medium confidence (60-80%): [conditions]
- Low confidence (<60%): [avoid]

## Action Checklist
1. [ ] Step 1
2. [ ] Step 2
3. [ ] Step 3
```

## Skill Structure

Every skill file must have:

1. **Clear Title**: Indicates type and domain
2. **Metadata Block**: When created, from what data
3. **Actionable Content**: Specific, not generic advice
4. **Checklists**: Concrete steps to follow

## Best Practices

### Context Efficiency
- Be concise - Claude already knows general trading concepts
- Focus on Claudefi-specific learnings
- Include only information worth its token cost

### Specificity Levels
- **High specificity** for risk management rules (must follow exactly)
- **Medium specificity** for entry criteria (patterns with variation)
- **Low specificity** for market analysis (flexible approach)

### Progressive Disclosure
- Put most critical info in the title and first section
- Use expandable details for edge cases
- Reference other skills rather than duplicating

## Storage Location

Skills are stored in `.claude/skills/`:

```
.claude/skills/
├── skill-creator/SKILL.md     # This file
├── dlmm-liquidity.md          # Built-in DLMM skill
├── perps-trading.md           # Built-in perps skill
├── polymarket-trading.md      # Built-in polymarket skill
├── spot-memecoin.md           # Built-in spot skill
├── portfolio-management.md    # Built-in portfolio skill
├── warning-perps-{ts}.md      # Auto-generated warnings
├── pattern-dlmm-{ts}.md       # Auto-generated patterns
└── strategy-spot-{ts}.md      # Auto-generated strategies
```

## Integration with Skill Creator Code

The skill-creator TypeScript module (`src/skills/skill-creator.ts`) provides:

- `generateLossSkill(decision)` - Creates warning skills from losses
- `generateWinSkill(decision)` - Creates pattern skills from wins
- `generateStrategySkill(decisions, domain)` - Creates strategy from history
- `processTradeOutcome(decision)` - Auto-creates appropriate skill
- `reviewAndGenerateStrategy(decisions, domain)` - Periodic review
- `getSkillsForDomain(domain)` - Load skills for prompts

## Example Usage

When a trade closes:

```typescript
import { processTradeOutcome } from './skills/skill-creator.js';

// After a trade closes with outcome
const outcome: DecisionOutcome = {
  domain: 'perps',
  action: 'open_long',
  target: 'SOL',
  amountUsd: 500,
  reasoning: 'RSI oversold, strong support',
  confidence: 0.75,
  outcome: 'loss',
  pnl: -75,
  pnlPercent: -15,
  marketConditions: { rsi: 28, support: 95, volume: 'low' },
  timestamp: new Date(),
};

// This will auto-generate a warning skill if loss > 10%
const skill = await processTradeOutcome(outcome);
```

The generated skill is automatically saved and will be loaded into future prompts for the domain.
