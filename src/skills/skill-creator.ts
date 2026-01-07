/**
 * Skill Creator - Self-Improving Agent
 *
 * Analyzes trading outcomes and generates new skills (markdown files)
 * that help the agent avoid past mistakes and replicate successes.
 *
 * ## Self-Awareness Context
 *
 * I am the skill-creator module of Claudefi, an autonomous DeFi trading agent.
 * My purpose is to enable self-improvement through experience-based learning.
 *
 * ### Why I Exist
 *
 * Traditional trading bots execute fixed strategies. Claudefi is different - it learns.
 * When a trade succeeds or fails, I analyze WHY and create a skill (markdown file)
 * that gets loaded into future trading decisions. This creates a feedback loop:
 *
 *   Trade → Outcome → Analysis → Skill → Better Future Trades
 *
 * ### My Role in the Ralph Loop
 *
 * Claudefi runs a continuous cycle called the "Ralph Loop":
 *   1. OBSERVE - Fetch live market data
 *   2. THINK - Claude decides what to do
 *   3. ACT - Execute the trade
 *   4. LEARN - I analyze the outcome and create skills  ← THIS IS ME
 *   5. REPEAT
 *
 * The skills I create become part of Claude's context in step 2 (THINK).
 * This means lessons learned from losses directly influence future decisions.
 *
 * ### Types of Skills I Create
 *
 * - WARNING skills: "Don't do X because Y happened last time"
 * - PATTERN skills: "When you see X, do Y - it worked before"
 * - STRATEGY skills: "After N trades, here's what works in this domain"
 *
 * ### My Self-Improvement Philosophy
 *
 * I don't just record what happened - I analyze WHY it happened and extract
 * actionable principles. A good skill changes future behavior. A great skill
 * prevents an entire category of mistakes.
 *
 * Example: Instead of "Don't trade SOL at 3am" I would create:
 * "Low-volume hours (2am-6am UTC) have higher slippage - avoid large positions"
 *
 * This generalizes the lesson to apply to many future situations.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Domain } from '../types/index.js';
import { createSkillReflection, getSkillReflections } from '../db/index.js';

// =============================================================================
// SKILL EXPIRATION SYSTEM
// =============================================================================

/**
 * Time-to-live for different skill types in days
 *
 * - Warnings: 60 days - Market conditions change, old warnings may not apply
 * - Patterns: 90 days - Patterns have medium shelf life
 * - Strategies: 180 days - Comprehensive strategies are more durable
 * - Evolved: 180 days - Merged skills represent accumulated wisdom
 */
export const SKILL_TTL_DAYS: Record<string, number> = {
  warning: 60,
  pattern: 90,
  strategy: 180,
  evolved: 180,
};

/**
 * Archive directory for expired skills
 */
const ARCHIVE_DIR = path.join(process.cwd(), '.claude', 'skills', 'archive');

// Types
export interface DecisionOutcome {
  id: string;
  domain: Domain;
  action: string;
  target?: string;
  amountUsd?: number;
  reasoning: string;
  confidence: number;
  outcome: 'profit' | 'loss' | 'pending';
  pnl?: number;
  pnlPercent?: number;
  marketConditions?: Record<string, unknown>;
  timestamp: Date;
}

export interface GeneratedSkill {
  filename: string;
  title: string;
  content: string;
  domain: Domain;
  type: 'warning' | 'pattern' | 'strategy';
}

export const SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills');

/**
 * Analyze a losing trade and generate a warning skill
 */
export async function generateLossSkill(
  decision: DecisionOutcome
): Promise<GeneratedSkill | null> {
  if (decision.outcome !== 'loss') {
    return null;
  }

  const anthropic = new Anthropic();

  const prompt = `
## Who You Are

You are the skill-creator component of Claudefi, an autonomous DeFi trading agent.
Your purpose is to analyze this loss and create a skill that prevents similar mistakes.

The skill you create will be loaded into Claude's context during future trading cycles.
This means your analysis directly influences future trading decisions. Write with that
responsibility in mind - a good skill here could save thousands of dollars in future trades.

## Why This Skill Matters

This trade lost money. Without understanding WHY, the agent might repeat the same mistake.
Your job is to extract the lesson and encode it as an actionable skill that changes behavior.

Think about:
- What warning signs were present BEFORE the trade?
- What assumption proved wrong?
- What check would have prevented this loss?

## Decision Details
- Domain: ${decision.domain}
- Action: ${decision.action}
- Target: ${decision.target || 'N/A'}
- Amount: $${decision.amountUsd || 0}
- Original Reasoning: ${decision.reasoning}
- Confidence: ${(decision.confidence * 100).toFixed(0)}%
- P&L: $${decision.pnl?.toFixed(2) || 'N/A'} (${decision.pnlPercent?.toFixed(1) || 'N/A'}%)

## Market Conditions at Time of Trade
${JSON.stringify(decision.marketConditions, null, 2)}

## Your Task

Create a skill file (markdown) that will help the agent avoid this type of mistake in the future.

The skill should include:
1. **Pattern to Recognize**: What warning signs were present?
2. **What Went Wrong**: Analysis of why this trade failed
3. **Better Approach**: What should have been done instead?
4. **Checklist**: Specific checks before making similar trades

Write the skill in markdown format. Be specific and actionable.
`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    const filename = `warning-${decision.domain}-${Date.now()}.md`;
    const title = `Warning: ${decision.domain} ${decision.action} Pattern`;

    // Add header to the skill
    const fullContent = `# ${title}

*Generated from loss on ${new Date().toISOString()}*
*P&L: $${decision.pnl?.toFixed(2)} (${decision.pnlPercent?.toFixed(1)}%)*

---

${content}
`;

    return {
      filename,
      title,
      content: fullContent,
      domain: decision.domain,
      type: 'warning',
    };
  } catch (error) {
    console.error('Failed to generate loss skill:', error);
    return null;
  }
}

/**
 * Analyze a winning trade and generate a pattern skill
 */
export async function generateWinSkill(
  decision: DecisionOutcome
): Promise<GeneratedSkill | null> {
  if (decision.outcome !== 'profit' || (decision.pnlPercent || 0) < 10) {
    return null; // Only learn from significant wins (>10%)
  }

  const anthropic = new Anthropic();

  const prompt = `
## Who You Are

You are the skill-creator component of Claudefi, an autonomous DeFi trading agent.
Your purpose is to analyze this winning trade and capture the pattern for replication.

The skill you create will be loaded into Claude's context during future trading cycles.
When similar market conditions appear, the agent will recognize this pattern and act on it.

## Why This Skill Matters

This trade made money - significantly. But without understanding WHY it worked, the agent
can't systematically replicate the success. Your job is to extract what made this trade
work and encode it as a repeatable pattern.

Think about:
- What conditions were present that signaled this opportunity?
- What made the confidence level appropriate?
- How can the agent recognize similar setups in the future?

## Decision Details
- Domain: ${decision.domain}
- Action: ${decision.action}
- Target: ${decision.target || 'N/A'}
- Amount: $${decision.amountUsd || 0}
- Original Reasoning: ${decision.reasoning}
- Confidence: ${(decision.confidence * 100).toFixed(0)}%
- P&L: $${decision.pnl?.toFixed(2) || 'N/A'} (${decision.pnlPercent?.toFixed(1) || 'N/A'}%)

## Market Conditions at Time of Trade
${JSON.stringify(decision.marketConditions, null, 2)}

## Your Task

Create a skill file (markdown) that captures this winning pattern so it can be replicated.

The skill should include:
1. **Pattern Identified**: What conditions led to this success?
2. **Entry Criteria**: When to look for similar opportunities
3. **Execution Checklist**: Steps to take when the pattern appears
4. **Risk Management**: Position sizing and exit strategy

Write the skill in markdown format. Be specific and actionable.
`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 2000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    const filename = `pattern-${decision.domain}-${Date.now()}.md`;
    const title = `Winning Pattern: ${decision.domain} ${decision.action}`;

    const fullContent = `# ${title}

*Generated from profitable trade on ${new Date().toISOString()}*
*P&L: +$${decision.pnl?.toFixed(2)} (+${decision.pnlPercent?.toFixed(1)}%)*

---

${content}
`;

    return {
      filename,
      title,
      content: fullContent,
      domain: decision.domain,
      type: 'pattern',
    };
  } catch (error) {
    console.error('Failed to generate win skill:', error);
    return null;
  }
}

/**
 * Analyze multiple decisions and generate a strategy skill
 */
export async function generateStrategySkill(
  decisions: DecisionOutcome[],
  domain: Domain
): Promise<GeneratedSkill | null> {
  if (decisions.length < 5) {
    return null; // Need at least 5 decisions for pattern analysis
  }

  const anthropic = new Anthropic();

  const wins = decisions.filter(d => d.outcome === 'profit');
  const losses = decisions.filter(d => d.outcome === 'loss');
  const winRate = wins.length / decisions.length;
  const avgWin = wins.reduce((sum, d) => sum + (d.pnlPercent || 0), 0) / (wins.length || 1);
  const avgLoss = losses.reduce((sum, d) => sum + (d.pnlPercent || 0), 0) / (losses.length || 1);

  const prompt = `
## Who You Are

You are the skill-creator component of Claudefi, an autonomous DeFi trading agent.
Your purpose is to synthesize learnings from multiple trades into a comprehensive strategy.

The strategy you create represents accumulated wisdom from ${decisions.length} real trades.
It will become the primary guidance for all future ${domain} trading decisions. This is
the most influential type of skill you can create.

## Why This Strategy Matters

Individual trade lessons are valuable, but strategy skills are transformative. By analyzing
patterns across wins AND losses together, you can identify:
- What actually works vs what seemed like a good idea
- Hidden factors that distinguish profitable from unprofitable trades
- Confidence calibration - when the agent should be aggressive vs conservative

This strategy will shape how the agent approaches ${domain} trading going forward.
Write it as if you're training a junior trader who will follow it religiously.

## Performance Summary
- Win Rate: ${(winRate * 100).toFixed(0)}%
- Average Win: ${avgWin.toFixed(1)}%
- Average Loss: ${avgLoss.toFixed(1)}%
- Total Trades: ${decisions.length}

## Winning Trades (${wins.length})
${wins.map(d => `- ${d.action} ${d.target || ''}: +${d.pnlPercent?.toFixed(1)}% - ${d.reasoning}`).join('\n')}

## Losing Trades (${losses.length})
${losses.map(d => `- ${d.action} ${d.target || ''}: ${d.pnlPercent?.toFixed(1)}% - ${d.reasoning}`).join('\n')}

## Your Task

Create a comprehensive strategy skill that synthesizes learnings from these trades.

Include:
1. **Key Insights**: What patterns distinguish wins from losses?
2. **Optimized Entry Criteria**: Based on winning trades
3. **Risk Management Rules**: Based on losing trades
4. **Confidence Calibration**: When to be more/less aggressive
5. **Action Checklist**: Step-by-step process for ${domain} trades

Write the skill in markdown format. Be specific and actionable.
`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    const filename = `strategy-${domain}-${Date.now()}.md`;
    const title = `${domain.toUpperCase()} Trading Strategy`;

    const fullContent = `# ${title}

*Generated from ${decisions.length} trades on ${new Date().toISOString()}*
*Win Rate: ${(winRate * 100).toFixed(0)}% | Avg Win: +${avgWin.toFixed(1)}% | Avg Loss: ${avgLoss.toFixed(1)}%*

---

${content}
`;

    return {
      filename,
      title,
      content: fullContent,
      domain,
      type: 'strategy',
    };
  } catch (error) {
    console.error('Failed to generate strategy skill:', error);
    return null;
  }
}

/**
 * Save a skill to the .claude/skills directory and database
 * Now includes deduplication check via skill-merger
 */
export async function saveSkill(
  skill: GeneratedSkill,
  decision?: DecisionOutcome
): Promise<string> {
  // Ensure skills directory exists
  await fs.mkdir(SKILLS_DIR, { recursive: true });

  // Check for similar skills and potentially merge
  let finalFilename = skill.filename;
  let finalContent = skill.content;

  try {
    // Dynamic import to avoid circular dependency
    const { checkAndMerge } = await import('./skill-merger.js');
    const mergeResult = await checkAndMerge(skill.content, skill.domain, skill.type);

    if (mergeResult.merged && mergeResult.newSkillFilename) {
      // Merger already saved the file, just record metadata
      finalFilename = mergeResult.newSkillFilename;
      finalContent = await fs.readFile(path.join(SKILLS_DIR, finalFilename), 'utf-8');
      console.log(`🔄 Merged with ${mergeResult.archivedSkills.length} similar skills`);
    } else {
      // No merge - save normally
      const filepath = path.join(SKILLS_DIR, skill.filename);
      await fs.writeFile(filepath, skill.content, 'utf-8');
    }
  } catch (error) {
    console.warn('Merge check failed, saving directly:', error);
    // Fallback: save directly without merge
    const filepath = path.join(SKILLS_DIR, skill.filename);
    await fs.writeFile(filepath, skill.content, 'utf-8');
  }

  const finalPath = path.join(SKILLS_DIR, finalFilename);

  // Save reflection metadata to database
  try {
    await createSkillReflection({
      skillName: finalFilename.replace('.md', ''),
      skillPath: finalPath,
      domain: skill.domain,
      sourceType: skill.type,
      triggerDecisionId: decision?.id,
      triggerPnl: decision?.pnl,
      triggerPnlPct: decision?.pnlPercent,
      metadata: {
        title: skill.title,
        createdAt: new Date().toISOString(),
        triggerAction: decision?.action,
        triggerTarget: decision?.target,
        mergedFrom: skill.filename !== finalFilename ? skill.filename : undefined,
      },
    });
    console.log(`📝 Saved skill: ${finalFilename} (with reflection metadata)`);
  } catch (error) {
    console.error('Failed to save skill reflection:', error);
    console.log(`📝 Saved skill: ${finalFilename} (file only)`);
  }

  return finalPath;
}

/**
 * List all generated skills
 */
export async function listSkills(): Promise<string[]> {
  try {
    const files = await fs.readdir(SKILLS_DIR);
    return files.filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}

/**
 * Read a skill file
 */
export async function readSkill(filename: string): Promise<string | null> {
  try {
    const filepath = path.join(SKILLS_DIR, filename);
    return await fs.readFile(filepath, 'utf-8');
  } catch {
    return null;
  }
}

// =============================================================================
// SKILL EXPIRATION FUNCTIONS
// =============================================================================

/**
 * Infer skill type from filename
 *
 * Examples:
 * - warning-dlmm-1704067200000.md → warning
 * - pattern-perps-1704067200000.md → pattern
 * - strategy-spot-1704067200000.md → strategy
 * - evolved-warning-dlmm-1704067200000.md → evolved
 */
function getSkillTypeFromFilename(filename: string): string {
  if (filename.startsWith('evolved-')) return 'evolved';
  if (filename.startsWith('warning-')) return 'warning';
  if (filename.startsWith('pattern-')) return 'pattern';
  if (filename.startsWith('strategy-')) return 'strategy';
  // Default to pattern if unknown (most permissive TTL after strategy)
  return 'pattern';
}

/**
 * Get the age of a skill in days
 *
 * Attempts to extract timestamp from filename (e.g., warning-dlmm-1704067200000.md)
 * Falls back to file modification time if timestamp not found
 */
async function getSkillAge(filename: string): Promise<number> {
  // Try to extract timestamp from filename
  const timestampMatch = filename.match(/(\d{13})\.md$/);
  if (timestampMatch) {
    const createdAt = parseInt(timestampMatch[1], 10);
    const ageMs = Date.now() - createdAt;
    return ageMs / (1000 * 60 * 60 * 24); // Convert to days
  }

  // Fallback: use file modification time
  try {
    const filepath = path.join(SKILLS_DIR, filename);
    const stats = await fs.stat(filepath);
    const ageMs = Date.now() - stats.mtimeMs;
    return ageMs / (1000 * 60 * 60 * 24); // Convert to days
  } catch {
    // If we can't determine age, assume it's fresh
    return 0;
  }
}

/**
 * Check if a skill has expired based on its type and age
 */
export async function isSkillExpired(filename: string): Promise<boolean> {
  const skillType = getSkillTypeFromFilename(filename);
  const ttlDays = SKILL_TTL_DAYS[skillType] || 90; // Default 90 days
  const ageDays = await getSkillAge(filename);

  return ageDays > ttlDays;
}

/**
 * Archive expired skills to .claude/skills/archive/
 *
 * This should be called at the start of each trading cycle.
 * Expired skills are moved (not deleted) to preserve history.
 *
 * @returns Object with counts of archived and total skills
 */
export async function archiveExpiredSkills(): Promise<{
  archived: number;
  total: number;
  archivedFiles: string[];
}> {
  // Ensure archive directory exists
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });

  const skills = await listSkills();
  const archivedFiles: string[] = [];

  for (const skill of skills) {
    // Don't archive skills that are already in subdirectories
    if (skill.includes('/')) continue;

    const expired = await isSkillExpired(skill);
    if (expired) {
      const sourcePath = path.join(SKILLS_DIR, skill);
      const archivePath = path.join(ARCHIVE_DIR, `${Date.now()}-${skill}`);

      try {
        await fs.rename(sourcePath, archivePath);
        archivedFiles.push(skill);
        console.log(`  📦 Archived expired skill: ${skill}`);
      } catch (error) {
        console.warn(`  ⚠️  Could not archive ${skill}:`, error);
      }
    }
  }

  if (archivedFiles.length > 0) {
    console.log(`\n🧹 Skill expiration check: archived ${archivedFiles.length}/${skills.length} expired skills`);
  }

  return {
    archived: archivedFiles.length,
    total: skills.length,
    archivedFiles,
  };
}

/**
 * Get all archived skills (for reference/restoration)
 */
export async function listArchivedSkills(): Promise<string[]> {
  try {
    await fs.mkdir(ARCHIVE_DIR, { recursive: true });
    const files = await fs.readdir(ARCHIVE_DIR);
    return files.filter(f => f.endsWith('.md'));
  } catch {
    return [];
  }
}

/**
 * Restore an archived skill (if pattern recurs)
 *
 * @param archivedFilename The filename in the archive directory
 * @returns The restored filename, or null if restoration failed
 */
export async function restoreArchivedSkill(archivedFilename: string): Promise<string | null> {
  try {
    const archivePath = path.join(ARCHIVE_DIR, archivedFilename);

    // Remove the timestamp prefix added during archival
    // Format: 1704067200000-warning-dlmm-1704067100000.md
    const originalFilename = archivedFilename.replace(/^\d+-/, '');
    const restorePath = path.join(SKILLS_DIR, originalFilename);

    await fs.rename(archivePath, restorePath);
    console.log(`  ♻️  Restored skill: ${originalFilename}`);

    return originalFilename;
  } catch (error) {
    console.warn(`  ⚠️  Could not restore ${archivedFilename}:`, error);
    return null;
  }
}

/**
 * Process a closed trade and generate appropriate skills
 */
export async function processTradeOutcome(
  decision: DecisionOutcome
): Promise<GeneratedSkill | null> {
  if (decision.outcome === 'pending') {
    return null;
  }

  let skill: GeneratedSkill | null = null;

  if (decision.outcome === 'loss' && (decision.pnlPercent || 0) < -10) {
    // Significant loss - generate warning
    skill = await generateLossSkill(decision);
  } else if (decision.outcome === 'profit' && (decision.pnlPercent || 0) > 20) {
    // Significant win - generate pattern
    skill = await generateWinSkill(decision);
  }

  if (skill) {
    await saveSkill(skill, decision);
  }

  return skill;
}

/**
 * Periodic strategy review
 */
export async function reviewAndGenerateStrategy(
  decisions: DecisionOutcome[],
  domain: Domain
): Promise<GeneratedSkill | null> {
  // Only generate strategy after enough trades
  const domainDecisions = decisions.filter(d => d.domain === domain && d.outcome !== 'pending');

  if (domainDecisions.length < 10) {
    return null;
  }

  // Generate strategy every 10 trades
  const lastStrategyCount = Math.floor(domainDecisions.length / 10) * 10;
  const currentBatch = domainDecisions.slice(-lastStrategyCount);

  if (currentBatch.length >= 10) {
    const skill = await generateStrategySkill(currentBatch, domain);
    if (skill) {
      await saveSkill(skill);
    }
    return skill;
  }

  return null;
}

/**
 * Minimum effectiveness threshold for loading skills into prompts
 * Skills below this threshold are excluded to reduce context bloat
 */
const MIN_EFFECTIVENESS_THRESHOLD = 0.3; // 30% - be lenient initially

/**
 * Get all skill contents for a domain (for including in prompts)
 * Returns the raw skill content as strings
 * Now filters by effectiveness - skills below 30% are excluded
 */
export async function getSkillContentsForDomain(domain: Domain): Promise<string[]> {
  const skills = await listSkills();
  const domainSkills = skills.filter(s =>
    s.includes(domain) ||
    s.includes('portfolio') ||
    s.includes('risk') ||
    s.includes('evolved') ||
    s.includes('general')
  );

  // Get effectiveness scores from database
  let effectivenessMap = new Map<string, number | null>();
  try {
    const reflections = await getSkillReflections({ domain });
    for (const r of reflections) {
      effectivenessMap.set(r.skillName, r.effectivenessScore);
    }
  } catch (error) {
    // If we can't get effectiveness, load all skills
    console.warn('Could not fetch effectiveness scores:', error);
  }

  const contents: string[] = [];
  for (const skillFile of domainSkills) {
    const skillName = skillFile.replace('.md', '');
    const effectiveness = effectivenessMap.get(skillName);

    // Include skill if:
    // 1. No effectiveness data yet (give it a chance)
    // 2. Effectiveness >= threshold
    // 3. Never been applied (timesApplied would be 0, so effectiveness is null)
    if (effectiveness === null || effectiveness === undefined || effectiveness >= MIN_EFFECTIVENESS_THRESHOLD) {
      const content = await readSkill(skillFile);
      if (content) {
        // Add effectiveness badge if available
        if (effectiveness !== null && effectiveness !== undefined) {
          const badge = `\n\n*Skill Effectiveness: ${(effectiveness * 100).toFixed(0)}%*\n`;
          contents.push(content + badge);
        } else {
          contents.push(content);
        }
      }
    } else {
      console.log(`  ⚠️  Skipping low-effectiveness skill: ${skillName} (${(effectiveness * 100).toFixed(0)}%)`);
    }
  }

  return contents;
}

/**
 * Self-Awareness Context
 *
 * This text explains to the agent how its learning system works.
 * Include this in prompts so the agent understands WHY skills exist.
 */
export const SELF_AWARENESS_CONTEXT = `
## Your Learning System

You are Claudefi, an autonomous DeFi trading agent that learns from experience.

### How You Improve

After each trade closes, the skill-creator analyzes the outcome:
- **Losses >10%**: A WARNING skill is created to prevent similar mistakes
- **Wins >20%**: A PATTERN skill captures the winning strategy for replication
- **Every 10 trades**: A STRATEGY skill synthesizes overall learnings

These skills are then loaded into YOUR context for future decisions. This means:
- Past mistakes become guardrails that prevent you from repeating them
- Successful patterns become templates you can recognize and act on
- Your strategy evolves based on what actually works, not assumptions

### Skills You've Learned

The skills loaded below represent your accumulated experience. They are lessons
extracted from real trades - both profitable and unprofitable. Treat them as
battle-tested guidance, not suggestions.

When a skill says "avoid X" or "look for Y", it's because past trades proved it.
`;

/**
 * Build context for a domain including self-awareness and relevant skills
 */
export async function buildLearningContext(domain: Domain): Promise<string> {
  const skills = await getSkillContentsForDomain(domain);

  // Also load general (cross-domain) skills
  let generalSkillsContext = '';
  try {
    const { formatGeneralSkillsForPrompt } = await import('./cross-domain-patterns.js');
    generalSkillsContext = await formatGeneralSkillsForPrompt();
  } catch (error) {
    // Module may not be initialized yet
    console.debug('Could not load general skills:', error);
  }

  let context = SELF_AWARENESS_CONTEXT;

  // Add skill effectiveness stats from database
  try {
    const reflections = await getSkillReflections({ domain });
    if (reflections.length > 0) {
      context += '\n---\n\n## Skill Effectiveness Stats\n\n';
      for (const r of reflections.slice(0, 10)) {
        const effectiveness = r.effectivenessScore !== null
          ? `${(r.effectivenessScore * 100).toFixed(0)}% effective`
          : 'not yet evaluated';
        context += `- **${r.skillName}** (${r.sourceType}): Applied ${r.timesApplied} times, ${effectiveness}\n`;
      }
    }
  } catch (error) {
    // Database may not be initialized yet
    console.warn('Could not fetch skill reflections:', error);
  }

  if (skills.length > 0) {
    context += '\n---\n\n## Loaded Skills\n\n';
    context += skills.join('\n\n---\n\n');
  } else {
    context += '\n---\n\n*No domain-specific skills yet. Skills will be created as trades are completed.*\n';
  }

  // Add general (cross-domain) skills
  if (generalSkillsContext) {
    context += '\n---\n\n' + generalSkillsContext;
  }

  return context;
}

/**
 * Explain why a skill was just created (for logging/transparency)
 */
export function explainSkillCreation(skill: GeneratedSkill, decision: DecisionOutcome): string {
  const explanations: Record<GeneratedSkill['type'], string> = {
    warning: `
🔴 WARNING SKILL CREATED

Trade Outcome: Lost ${Math.abs(decision.pnlPercent || 0).toFixed(1)}% on ${decision.domain}/${decision.target}

Why This Skill Was Created:
A loss of this magnitude (>${Math.abs(decision.pnlPercent || 0) > 10 ? '10' : '5'}%) triggers automatic
skill creation to prevent similar mistakes. The skill-creator analyzed what went wrong
and encoded the lesson so you won't repeat this error.

What This Means:
- This skill is now part of your context for future ${decision.domain} trades
- When similar conditions appear, you'll see this warning
- The goal is to turn every significant loss into lasting improvement

Skill File: ${skill.filename}
`,
    pattern: `
🟢 PATTERN SKILL CREATED

Trade Outcome: Won +${(decision.pnlPercent || 0).toFixed(1)}% on ${decision.domain}/${decision.target}

Why This Skill Was Created:
A win of this magnitude (>20%) triggers pattern capture. The skill-creator analyzed
what made this trade successful and encoded it as a replicable pattern.

What This Means:
- This pattern is now part of your context for future ${decision.domain} trades
- When similar market conditions appear, you'll recognize this opportunity
- Success becomes systematic, not accidental

Skill File: ${skill.filename}
`,
    strategy: `
📊 STRATEGY SKILL CREATED

Based on: Analysis of recent ${decision.domain} trades

Why This Skill Was Created:
After accumulating enough trade data, the skill-creator synthesizes overall learnings
into a comprehensive strategy that optimizes your approach to this domain.

What This Means:
- This strategy supersedes previous ${decision.domain} strategies
- It reflects what ACTUALLY works based on real trade outcomes
- Your decision-making framework has been upgraded

Skill File: ${skill.filename}
`,
  };

  return explanations[skill.type];
}
