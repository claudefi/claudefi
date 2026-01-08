/**
 * Skill Recommender
 *
 * Recommends qualified skills for a domain based on:
 * 1. Proven effectiveness (>=3 applications, >=50% success rate)
 * 2. Relevance to current market context
 * 3. Recency and freshness
 *
 * Only top 5 skills are loaded to avoid context bloat.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Domain } from '../types/index.js';
import { getSkillReflections } from '../db/index.js';
import { SKILLS_DIR, listSkills, readSkill } from './reflection-creator.js';
import {
  type QualifiedSkill,
  type SkillMarketContext,
  type SkillRecommendationResult,
  MAX_RECOMMENDED_SKILLS,
  MIN_APPLICATIONS_FOR_PROVEN,
  MIN_SUCCESS_RATE_FOR_EFFECTIVE,
  MIN_RELEVANCE_SCORE,
  MAX_CONSECUTIVE_FAILURES,
} from './types.js';

// =============================================================================
// SKILL QUALIFICATION
// =============================================================================

/**
 * Check if a skill is qualified for use
 * A skill is qualified if:
 * 1. Proven effective (>=3 applications, >=50% success), OR
 * 2. New/untested (give it a chance), AND
 * 3. Not failing too often (< MAX_CONSECUTIVE_FAILURES)
 */
function isQualified(reflection: {
  timesApplied: number;
  successRate: number | null;
  effectivenessScore: number | null;
}): { qualified: boolean; provenEffective: boolean } {
  // New skills get a chance
  if (reflection.timesApplied < MIN_APPLICATIONS_FOR_PROVEN) {
    return { qualified: true, provenEffective: false };
  }

  // Check if proven effective
  const successRate = reflection.successRate ?? 0;
  const provenEffective = successRate >= MIN_SUCCESS_RATE_FOR_EFFECTIVE;

  return { qualified: provenEffective, provenEffective };
}

/**
 * Infer skill type from filename
 */
function getSkillType(filename: string): 'warning' | 'pattern' | 'strategy' | 'evolved' {
  if (filename.startsWith('evolved-')) return 'evolved';
  if (filename.startsWith('warning-')) return 'warning';
  if (filename.startsWith('pattern-')) return 'pattern';
  if (filename.startsWith('strategy-')) return 'strategy';
  return 'pattern'; // Default
}

/**
 * Calculate relevance score based on market context
 */
function calculateRelevance(
  skillName: string,
  skillContent: string,
  sourceType: string,
  context: SkillMarketContext
): number {
  let score = 0.5; // Base relevance

  // Strategy skills are highly relevant when present
  if (sourceType === 'strategy') {
    score += 0.2;
  }

  // Warning skills are more relevant when we have recent losses
  if (sourceType === 'warning' && (context.recentLossCount ?? 0) > 0) {
    score += 0.15;
  }

  // Pattern skills are more relevant when we're looking for opportunities
  if (sourceType === 'pattern' && !context.hasOpenPositions) {
    score += 0.1;
  }

  // Evolved skills (merged) are generally more valuable
  if (sourceType === 'evolved') {
    score += 0.15;
  }

  // Context-based relevance boosts
  if (context.volatility === 'high') {
    // In high volatility, warning skills are more relevant
    if (sourceType === 'warning') score += 0.1;
    // Risk-related skills more relevant
    if (skillContent.toLowerCase().includes('risk') || skillContent.toLowerCase().includes('stop')) {
      score += 0.1;
    }
  }

  if (context.trend === 'bearish') {
    // In bearish markets, caution-related skills more relevant
    if (skillContent.toLowerCase().includes('exit') || skillContent.toLowerCase().includes('loss')) {
      score += 0.1;
    }
  }

  // Cap at 1.0
  return Math.min(1.0, score);
}

// =============================================================================
// MAIN RECOMMENDER
// =============================================================================

/**
 * Get recommended skills for a domain
 *
 * This replaces the old getSkillContentsForDomain function with
 * explicit qualification and tracking.
 */
export async function recommendSkills(
  domain: Domain,
  context: SkillMarketContext
): Promise<SkillRecommendationResult> {
  const allSkills = await listSkills();

  // Filter to domain-relevant skills
  const domainSkills = allSkills.filter(s =>
    s.includes(domain) ||
    s.includes('portfolio') ||
    s.includes('general') ||
    s.includes('evolved')
  );

  // Get reflection data from database
  let reflections: Awaited<ReturnType<typeof getSkillReflections>> = [];
  try {
    reflections = await getSkillReflections({ domain });
  } catch (error) {
    console.warn('Could not fetch skill reflections:', error);
  }

  // Build reflection lookup
  const reflectionMap = new Map(
    reflections.map(r => [r.skillName, r])
  );

  const qualifiedSkills: QualifiedSkill[] = [];
  let excludedLowEffectiveness = 0;
  let excludedLowRelevance = 0;

  for (const skillFile of domainSkills) {
    const skillName = skillFile.replace('.md', '');
    const content = await readSkill(skillFile);

    if (!content) continue;

    // Get reflection data
    const reflection = reflectionMap.get(skillName);
    const timesApplied = reflection?.timesApplied ?? 0;
    const successRate = reflection?.successRate ?? null;
    const effectivenessScore = reflection?.effectivenessScore ?? null;

    // Check qualification
    const { qualified, provenEffective } = isQualified({
      timesApplied,
      successRate,
      effectivenessScore,
    });

    if (!qualified) {
      excludedLowEffectiveness++;
      continue;
    }

    // Calculate relevance
    const sourceType = getSkillType(skillFile);
    const relevanceScore = calculateRelevance(skillName, content, sourceType, context);

    if (relevanceScore < MIN_RELEVANCE_SCORE) {
      excludedLowRelevance++;
      continue;
    }

    qualifiedSkills.push({
      name: skillName,
      domain,
      content,
      relevanceScore,
      provenEffective,
      timesApplied,
      successRate: successRate ?? 0,
      sourceType,
    });
  }

  // Sort by relevance (proven effectiveness as tiebreaker)
  qualifiedSkills.sort((a, b) => {
    // Proven effective skills get a boost
    const aScore = a.relevanceScore + (a.provenEffective ? 0.1 : 0);
    const bScore = b.relevanceScore + (b.provenEffective ? 0.1 : 0);
    return bScore - aScore;
  });

  // Take top N skills
  const recommendedSkills = qualifiedSkills.slice(0, MAX_RECOMMENDED_SKILLS);

  return {
    recommendedSkills,
    totalSkillsConsidered: domainSkills.length,
    excludedLowEffectiveness,
    excludedLowRelevance,
  };
}

/**
 * Format recommended skills for prompt inclusion
 */
export function formatRecommendedSkills(skills: QualifiedSkill[]): string {
  if (skills.length === 0) {
    return '*No domain-specific skills yet. Skills will be created as trades are completed.*';
  }

  let output = '## Recommended Skills\n\n';
  output += `*${skills.length} skills loaded based on relevance and effectiveness*\n\n`;

  for (const skill of skills) {
    // Add effectiveness badge
    const badge = skill.provenEffective
      ? `✅ Proven (${(skill.successRate * 100).toFixed(0)}% success, ${skill.timesApplied} uses)`
      : skill.timesApplied > 0
        ? `📊 Testing (${skill.timesApplied} uses)`
        : '🆕 New';

    output += `### ${skill.name}\n`;
    output += `*${badge} | Relevance: ${(skill.relevanceScore * 100).toFixed(0)}%*\n\n`;
    output += skill.content;
    output += '\n\n---\n\n';
  }

  // Add instruction for agent
  output += `
**IMPORTANT: Skill Application Tracking**

When you apply any of the above skills in your decision-making:
1. Explicitly mention the skill name in your reasoning
2. State HOW the skill influenced your decision
3. This helps track which skills are actually effective

Example: "Applying the 'warning-dlmm-low-tvl' skill, I'm avoiding pools with < $100k TVL..."
`;

  return output;
}

/**
 * Get skill names that were recommended (for tracking)
 */
export function getRecommendedSkillNames(result: SkillRecommendationResult): string[] {
  return result.recommendedSkills.map(s => s.name);
}
