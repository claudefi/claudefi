/**
 * Cross-Domain Pattern Extraction
 *
 * Identifies patterns that work across multiple trading domains.
 * When a pattern succeeds in 2+ domains, it becomes a "general" skill
 * that gets injected into ALL domain prompts.
 *
 * This enables cross-pollination of trading wisdom:
 * - "Take profits early in volatile markets" might work in both perps and spot
 * - "Avoid low liquidity during weekends" applies to DLMM and spot
 * - "Don't fight macro trends" is universal
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Domain } from '../types/index.js';
import { getRecentDecisions } from '../db/index.js';
import { SKILLS_DIR, saveSkill, type GeneratedSkill } from './reflection-creator.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A pattern observed across multiple domains
 */
export interface CrossDomainPattern {
  id: string;
  name: string;
  description: string;
  domains: Domain[];
  winRate: number;
  sampleSize: number;
  keyInsights: string[];
  applicability: 'high' | 'medium' | 'low';
  firstObserved: Date;
  lastValidated: Date;
}

/**
 * Evidence of a pattern in a specific domain
 */
interface PatternEvidence {
  domain: Domain;
  matchingDecisions: number;
  successfulDecisions: number;
  winRate: number;
  exampleReasonings: string[];
}

/**
 * Pattern candidate before validation
 */
interface PatternCandidate {
  pattern: string;
  evidence: PatternEvidence[];
  overallWinRate: number;
  totalSamples: number;
}

// =============================================================================
// PATTERN DETECTION
// =============================================================================

/**
 * Common trading themes to look for across domains
 */
const PATTERN_KEYWORDS = {
  timing: [
    'momentum', 'trend', 'reversal', 'breakout', 'consolidation',
    'oversold', 'overbought', 'volume spike', 'low volume',
  ],
  risk: [
    'stop loss', 'position size', 'leverage', 'exposure', 'drawdown',
    'risk/reward', 'diversification', 'correlation',
  ],
  liquidity: [
    'liquidity', 'slippage', 'spread', 'depth', 'tvl',
    'volume', 'market cap',
  ],
  sentiment: [
    'fear', 'greed', 'fomo', 'panic', 'euphoria',
    'sentiment', 'macro', 'news', 'catalyst',
  ],
  technical: [
    'support', 'resistance', 'rsi', 'macd', 'ema', 'sma',
    'fibonacci', 'chart pattern', 'indicator',
  ],
};

/**
 * Extract pattern themes from a decision's reasoning
 */
function extractPatternThemes(reasoning: string): string[] {
  const themes: string[] = [];
  const lowerReasoning = reasoning.toLowerCase();

  for (const [category, keywords] of Object.entries(PATTERN_KEYWORDS)) {
    for (const keyword of keywords) {
      if (lowerReasoning.includes(keyword)) {
        themes.push(`${category}:${keyword}`);
      }
    }
  }

  return [...new Set(themes)]; // Deduplicate
}

/**
 * Find patterns that appear across multiple domains
 */
export async function findCrossDomainPatterns(): Promise<CrossDomainPattern[]> {
  const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
  const patterns: Map<string, PatternCandidate> = new Map();

  console.log('\n🔍 Analyzing cross-domain patterns...');

  // Collect decisions from all domains
  for (const domain of domains) {
    const decisions = await getRecentDecisions(domain, 50);
    const completedDecisions = decisions.filter(
      d => d.outcome === 'profitable' || d.outcome === 'loss'
    );

    if (completedDecisions.length < 5) continue;

    // Extract themes from each decision
    for (const decision of completedDecisions) {
      const themes = extractPatternThemes(decision.reasoning);

      for (const theme of themes) {
        // Initialize or update pattern candidate
        if (!patterns.has(theme)) {
          patterns.set(theme, {
            pattern: theme,
            evidence: [],
            overallWinRate: 0,
            totalSamples: 0,
          });
        }

        const candidate = patterns.get(theme)!;

        // Find or create evidence for this domain
        let domainEvidence = candidate.evidence.find(e => e.domain === domain);
        if (!domainEvidence) {
          domainEvidence = {
            domain,
            matchingDecisions: 0,
            successfulDecisions: 0,
            winRate: 0,
            exampleReasonings: [],
          };
          candidate.evidence.push(domainEvidence);
        }

        domainEvidence.matchingDecisions++;
        if (decision.outcome === 'profitable') {
          domainEvidence.successfulDecisions++;
        }

        // Store example reasoning (limit to 3)
        if (domainEvidence.exampleReasonings.length < 3) {
          domainEvidence.exampleReasonings.push(
            decision.reasoning.slice(0, 100)
          );
        }
      }
    }
  }

  // Calculate win rates and filter to cross-domain patterns
  const crossDomainPatterns: CrossDomainPattern[] = [];

  for (const [patternKey, candidate] of patterns) {
    // Must appear in at least 2 domains
    if (candidate.evidence.length < 2) continue;

    // Calculate metrics
    let totalMatches = 0;
    let totalSuccesses = 0;

    for (const evidence of candidate.evidence) {
      evidence.winRate = evidence.matchingDecisions > 0
        ? evidence.successfulDecisions / evidence.matchingDecisions
        : 0;
      totalMatches += evidence.matchingDecisions;
      totalSuccesses += evidence.successfulDecisions;
    }

    candidate.overallWinRate = totalMatches > 0
      ? totalSuccesses / totalMatches
      : 0;
    candidate.totalSamples = totalMatches;

    // Must have reasonable sample size and positive win rate
    if (totalMatches < 5 || candidate.overallWinRate < 0.5) continue;

    // Parse pattern name
    const [category, keyword] = patternKey.split(':');

    crossDomainPatterns.push({
      id: `cross-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name: `${category.charAt(0).toUpperCase() + category.slice(1)}: ${keyword}`,
      description: `Pattern "${keyword}" observed across ${candidate.evidence.length} domains`,
      domains: candidate.evidence.map(e => e.domain),
      winRate: candidate.overallWinRate,
      sampleSize: totalMatches,
      keyInsights: candidate.evidence.flatMap(e => e.exampleReasonings).slice(0, 5),
      applicability: candidate.overallWinRate > 0.65 ? 'high' :
                     candidate.overallWinRate > 0.55 ? 'medium' : 'low',
      firstObserved: new Date(),
      lastValidated: new Date(),
    });
  }

  // Sort by win rate and sample size
  crossDomainPatterns.sort((a, b) => {
    const scoreA = a.winRate * Math.log(a.sampleSize + 1);
    const scoreB = b.winRate * Math.log(b.sampleSize + 1);
    return scoreB - scoreA;
  });

  console.log(`   Found ${crossDomainPatterns.length} cross-domain patterns`);

  return crossDomainPatterns;
}

// =============================================================================
// GENERAL SKILL CREATION
// =============================================================================

/**
 * Create a "general" skill from a cross-domain pattern
 * General skills are loaded into ALL domain prompts
 */
export async function createGeneralSkill(
  pattern: CrossDomainPattern
): Promise<string | null> {
  if (pattern.winRate < 0.55 || pattern.sampleSize < 10) {
    console.log(`   ⚠️ Pattern "${pattern.name}" not strong enough for skill creation`);
    return null;
  }

  const anthropic = new Anthropic();

  const prompt = `You are the skill-creator for Claudefi, an autonomous trading agent.

A cross-domain pattern has been identified that works across multiple trading domains.
Your job is to create a "general" skill that captures this wisdom for all domains.

## Cross-Domain Pattern

**Name:** ${pattern.name}
**Domains:** ${pattern.domains.join(', ')}
**Win Rate:** ${(pattern.winRate * 100).toFixed(0)}%
**Sample Size:** ${pattern.sampleSize} trades

**Key Insights from Trades:**
${pattern.keyInsights.map((insight, i) => `${i + 1}. ${insight}`).join('\n')}

## Your Task

Create a concise, actionable skill that:
1. Explains the pattern in 2-3 sentences
2. Lists specific conditions when to apply it
3. Provides a checklist for each domain: ${pattern.domains.join(', ')}
4. Notes any domain-specific adaptations needed

The skill should be general enough to apply across all domains, but specific enough to be actionable.

Write the skill in markdown format. Keep it concise - this will be loaded into every decision prompt.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 1500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text'
      ? response.content[0].text
      : '';

    // Create the skill
    const skill: GeneratedSkill = {
      filename: `general-${pattern.id}.md`,
      title: `General Pattern: ${pattern.name}`,
      content: `# General Pattern: ${pattern.name}

*Cross-domain pattern validated on ${new Date().toISOString()}*
*Domains: ${pattern.domains.join(', ')} | Win Rate: ${(pattern.winRate * 100).toFixed(0)}% | Samples: ${pattern.sampleSize}*

---

${content}
`,
      domain: 'dlmm', // Placeholder - general skills apply to all
      type: 'pattern',
    };

    // Save to skills directory (use custom path for general skills)
    const generalDir = path.join(SKILLS_DIR, 'general');
    await fs.mkdir(generalDir, { recursive: true });

    const filepath = path.join(generalDir, skill.filename);
    await fs.writeFile(filepath, skill.content, 'utf-8');

    console.log(`   ✅ Created general skill: ${skill.filename}`);

    return filepath;
  } catch (error) {
    console.error('   ❌ Failed to create general skill:', error);
    return null;
  }
}

/**
 * Analyze patterns and create general skills for strong patterns
 */
export async function analyzeAndCreateGeneralSkills(): Promise<{
  patternsFound: number;
  skillsCreated: number;
}> {
  console.log('\n📊 Cross-Domain Pattern Analysis');
  console.log('─'.repeat(40));

  const patterns = await findCrossDomainPatterns();
  let skillsCreated = 0;

  // Create skills for top patterns
  const topPatterns = patterns.slice(0, 5); // Limit to top 5 to avoid bloat

  for (const pattern of topPatterns) {
    // Check if we already have a skill for this pattern
    const generalDir = path.join(SKILLS_DIR, 'general');
    try {
      const existingSkills = await fs.readdir(generalDir);
      const hasExisting = existingSkills.some(f =>
        f.includes(pattern.name.toLowerCase().replace(/[^a-z0-9]/g, '-'))
      );
      if (hasExisting) {
        console.log(`   ⏭️  Skipping "${pattern.name}" - skill already exists`);
        continue;
      }
    } catch {
      // Directory doesn't exist yet, continue
    }

    const result = await createGeneralSkill(pattern);
    if (result) skillsCreated++;
  }

  console.log('─'.repeat(40));
  console.log(`   Patterns found: ${patterns.length}`);
  console.log(`   Skills created: ${skillsCreated}`);

  return {
    patternsFound: patterns.length,
    skillsCreated,
  };
}

/**
 * Get all general skills for injection into prompts
 */
export async function getGeneralSkills(): Promise<string[]> {
  const generalDir = path.join(SKILLS_DIR, 'general');

  try {
    const files = await fs.readdir(generalDir);
    const skills: string[] = [];

    for (const file of files) {
      if (file.endsWith('.md')) {
        const content = await fs.readFile(path.join(generalDir, file), 'utf-8');
        skills.push(content);
      }
    }

    return skills;
  } catch {
    return [];
  }
}

/**
 * Format general skills for prompt injection
 */
export async function formatGeneralSkillsForPrompt(): Promise<string> {
  const skills = await getGeneralSkills();

  if (skills.length === 0) {
    return '';
  }

  return `
## Cross-Domain Patterns (General Skills)

The following patterns have been validated across multiple trading domains.
Apply them when relevant conditions are met.

${skills.join('\n\n---\n\n')}
`;
}
