/**
 * Skill Outcome Recorder
 *
 * Records trade outcomes and updates skill effectiveness scores.
 * Links skill applications to trade results for learning.
 */

import { prisma } from '../db/prisma.js';
import type { Domain } from '../types/index.js';
import {
  type SkillOutcomeResult,
  MIN_APPLICATIONS_FOR_PROVEN,
  MIN_SUCCESS_RATE_FOR_EFFECTIVE,
  MAX_CONSECUTIVE_FAILURES,
  MIN_WILSON_LOWER_BOUND,
  WILSON_Z_SCORE,
  RECENCY_DECAY_DAYS,
  MIN_FAILURES_FOR_DEMOTION,
} from './types.js';

// =============================================================================
// WILSON SCORE CALCULATION
// =============================================================================

/**
 * Calculate Wilson score lower bound for binomial proportion
 *
 * Wilson score gives a confidence interval for the true success rate.
 * The lower bound is used to ensure we're confident the skill is effective.
 *
 * @see https://en.wikipedia.org/wiki/Binomial_proportion_confidence_interval#Wilson_score_interval
 *
 * @param successes - Number of successful applications
 * @param total - Total number of applications
 * @param z - Z-score for confidence level (default: 1.645 for 90% confidence)
 * @returns Lower bound of confidence interval (0-1)
 */
export function wilsonScoreLowerBound(successes: number, total: number, z: number = WILSON_Z_SCORE): number {
  if (total === 0) return 0;

  const p = successes / total;
  const denominator = 1 + (z * z) / total;
  const center = p + (z * z) / (2 * total);
  const spread = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * total)) / total);

  return Math.max(0, (center - spread) / denominator);
}

/**
 * Check if a skill meets proven effectiveness criteria using Wilson score
 */
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

// =============================================================================
// OUTCOME RECORDING
// =============================================================================

/**
 * Record the outcome of a trade and update all related skill recommendations
 *
 * This is called when a position is closed with realized P&L.
 * It updates:
 * 1. SkillRecommendation records with outcome
 * 2. SkillReflection effectiveness scores
 */
export async function recordSkillOutcome(
  decisionId: string,
  outcome: 'profit' | 'loss',
  pnlPercent: number
): Promise<SkillOutcomeResult> {
  const effectivenessRecalculated: string[] = [];
  let skillsUpdated = 0;

  // Find all skill recommendations for this decision
  const recommendations = await prisma.skillRecommendation.findMany({
    where: { decisionId },
  });

  if (recommendations.length === 0) {
    console.log(`  📊 No skill recommendations found for decision ${decisionId}`);
    return {
      decisionId,
      outcome,
      pnlPercent,
      skillsUpdated: 0,
      effectivenessRecalculated: [],
    };
  }

  // Update each recommendation with outcome
  for (const rec of recommendations) {
    // Determine if skill contributed to success
    // For applied skills: successful trade = contributed
    // For presented-but-not-applied skills: we can't attribute
    const contributedToSuccess = rec.wasApplied && outcome === 'profit';

    await prisma.skillRecommendation.update({
      where: { id: rec.id },
      data: {
        tradeOutcome: outcome,
        pnlPercent,
        contributedToSuccess,
      },
    });
    skillsUpdated++;

    // Update effectiveness in SkillReflection if skill was applied
    if (rec.wasApplied) {
      const updated = await updateSkillEffectiveness(
        rec.skillName,
        rec.domain as Domain,
        outcome === 'profit'
      );
      if (updated) {
        effectivenessRecalculated.push(rec.skillName);
      }
    }
  }

  console.log(
    `  📊 Recorded ${outcome} (${pnlPercent.toFixed(1)}%) for ${skillsUpdated} skill recommendations`
  );

  if (effectivenessRecalculated.length > 0) {
    console.log(`     Effectiveness updated: ${effectivenessRecalculated.join(', ')}`);
  }

  return {
    decisionId,
    outcome,
    pnlPercent,
    skillsUpdated,
    effectivenessRecalculated,
  };
}

// =============================================================================
// EFFECTIVENESS CALCULATION
// =============================================================================

/**
 * Update skill effectiveness based on new outcome
 * Uses Wilson score for statistical confidence and supports demotion
 */
async function updateSkillEffectiveness(
  skillName: string,
  domain: Domain,
  wasSuccessful: boolean
): Promise<boolean> {
  try {
    const reflection = await prisma.skillReflection.findUnique({
      where: {
        skillName_domain: { skillName, domain },
      },
    });

    if (!reflection) {
      console.warn(`  ⚠️ SkillReflection not found: ${skillName} (${domain})`);
      return false;
    }

    // Calculate new stats
    const timesApplied = reflection.timesApplied + 1;
    const successCount = wasSuccessful ? reflection.successCount + 1 : reflection.successCount;
    const failureCount = wasSuccessful ? reflection.failureCount : reflection.failureCount + 1;
    const effectivenessScore = timesApplied > 0 ? successCount / timesApplied : null;

    // Track consecutive failures
    const consecutiveFailures = wasSuccessful ? 0 : (reflection.consecutiveFailures ?? 0) + 1;

    // Check if skill meets proven criteria using Wilson score
    const { provenEffective: meetsProven, wilsonScore } = meetsProvenCriteria(successCount, timesApplied);

    // Determine final proven status (with demotion logic)
    let provenEffective = meetsProven;

    // DEMOTION: Check if previously proven skill should be demoted
    if (reflection.provenEffective && !meetsProven) {
      if (consecutiveFailures >= MIN_FAILURES_FOR_DEMOTION) {
        provenEffective = false;
        console.log(
          `  📉 Demoting '${skillName}': ${consecutiveFailures} failures, Wilson ${wilsonScore.toFixed(2)}`
        );
      } else if ((effectivenessScore ?? 0) < MIN_SUCCESS_RATE_FOR_EFFECTIVE) {
        provenEffective = false;
        console.log(
          `  📉 Demoting '${skillName}': success rate ${((effectivenessScore ?? 0) * 100).toFixed(0)}%`
        );
      }
    }

    // Track qualified timestamp
    let qualifiedAt = reflection.qualifiedAt;
    if (provenEffective && !reflection.provenEffective) {
      qualifiedAt = new Date();
    } else if (!provenEffective && reflection.provenEffective) {
      qualifiedAt = null; // Clear on demotion
    }

    await prisma.skillReflection.update({
      where: { id: reflection.id },
      data: {
        timesApplied,
        successCount,
        failureCount,
        effectivenessScore,
        provenEffective,
        qualifiedAt,
        consecutiveFailures,
        lastApplied: new Date(),
      },
    });

    // Log status changes
    if (provenEffective && !reflection.provenEffective) {
      console.log(
        `  🏆 Skill '${skillName}' is now PROVEN (Wilson: ${wilsonScore.toFixed(2)}, Rate: ${((effectivenessScore ?? 0) * 100).toFixed(0)}%)`
      );
    }
    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
      console.log(`  ⚠️ Skill '${skillName}' has ${consecutiveFailures} consecutive failures`);
    }

    return true;
  } catch (error) {
    console.error(`Failed to update effectiveness for ${skillName}:`, error);
    return false;
  }
}

// =============================================================================
// EFFECTIVENESS QUERIES
// =============================================================================

/**
 * Get effectiveness statistics for a skill
 */
export async function getSkillEffectiveness(
  skillName: string,
  domain: Domain
): Promise<{
  timesApplied: number;
  successRate: number;
  provenEffective: boolean;
  consecutiveFailures: number;
} | null> {
  const reflection = await prisma.skillReflection.findUnique({
    where: {
      skillName_domain: { skillName, domain },
    },
  });

  if (!reflection) return null;

  return {
    timesApplied: reflection.timesApplied,
    successRate: reflection.timesApplied > 0
      ? reflection.successCount / reflection.timesApplied
      : 0,
    provenEffective: reflection.provenEffective ?? false,
    consecutiveFailures: reflection.consecutiveFailures ?? 0,
  };
}

/**
 * Get all proven effective skills for a domain
 */
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

/**
 * Get skills that are underperforming (for potential archival)
 */
export async function getUnderperformingSkills(domain: Domain): Promise<Array<{
  skillName: string;
  effectivenessScore: number;
  timesApplied: number;
  consecutiveFailures: number;
}>> {
  const reflections = await prisma.skillReflection.findMany({
    where: {
      domain,
      timesApplied: { gte: MIN_APPLICATIONS_FOR_PROVEN },
      effectivenessScore: { lt: MIN_SUCCESS_RATE_FOR_EFFECTIVE },
    },
  });

  return reflections.map(r => ({
    skillName: r.skillName,
    effectivenessScore: r.effectivenessScore ?? 0,
    timesApplied: r.timesApplied,
    consecutiveFailures: r.consecutiveFailures ?? 0,
  }));
}

/**
 * Recalculate effectiveness for all skills in a domain
 * Uses Wilson score for statistical confidence
 */
export async function recalculateAllEffectiveness(domain: Domain): Promise<number> {
  const reflections = await prisma.skillReflection.findMany({
    where: { domain },
  });

  let updated = 0;

  for (const reflection of reflections) {
    const timesApplied = reflection.timesApplied;
    const effectivenessScore = timesApplied > 0
      ? reflection.successCount / timesApplied
      : null;

    // Use Wilson score for proven effectiveness
    const { provenEffective } = meetsProvenCriteria(reflection.successCount, timesApplied);

    await prisma.skillReflection.update({
      where: { id: reflection.id },
      data: {
        effectivenessScore,
        provenEffective,
        qualifiedAt: provenEffective && !reflection.provenEffective
          ? new Date()
          : reflection.qualifiedAt,
      },
    });

    updated++;
  }

  return updated;
}

// =============================================================================
// TIME-WEIGHTED SUCCESS RATE
// =============================================================================

/**
 * Calculate time-weighted success rate for a skill
 * Recent outcomes are weighted more heavily using exponential decay
 */
export async function calculateWeightedSuccessRate(
  skillName: string,
  domain: string
): Promise<{ weightedRate: number; effectiveSamples: number; rawCount: number }> {
  const recommendations = await prisma.skillRecommendation.findMany({
    where: {
      skillName,
      domain,
      wasApplied: true,
      tradeOutcome: { in: ['profit', 'loss'] },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (recommendations.length === 0) {
    return { weightedRate: 0, effectiveSamples: 0, rawCount: 0 };
  }

  const now = Date.now();
  let weightedSuccesses = 0;
  let totalWeight = 0;

  for (const rec of recommendations) {
    const ageMs = now - rec.createdAt.getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);
    const weight = Math.exp(-ageDays / RECENCY_DECAY_DAYS);

    if (rec.tradeOutcome === 'profit') {
      weightedSuccesses += weight;
    }
    totalWeight += weight;
  }

  return {
    weightedRate: totalWeight > 0 ? weightedSuccesses / totalWeight : 0,
    effectiveSamples: totalWeight,
    rawCount: recommendations.length,
  };
}

/**
 * Get comprehensive skill statistics including Wilson score
 */
export async function getComprehensiveSkillStats(
  skillName: string,
  domain: Domain
): Promise<{
  timesApplied: number;
  successRate: number;
  wilsonScore: number;
  weightedSuccessRate: number;
  provenEffective: boolean;
  consecutiveFailures: number;
} | null> {
  const reflection = await prisma.skillReflection.findUnique({
    where: {
      skillName_domain: { skillName, domain },
    },
  });

  if (!reflection) return null;

  const successRate = reflection.timesApplied > 0
    ? reflection.successCount / reflection.timesApplied
    : 0;

  const wilsonScore = wilsonScoreLowerBound(reflection.successCount, reflection.timesApplied);
  const { weightedRate } = await calculateWeightedSuccessRate(skillName, domain);

  return {
    timesApplied: reflection.timesApplied,
    successRate,
    wilsonScore,
    weightedSuccessRate: weightedRate,
    provenEffective: reflection.provenEffective ?? false,
    consecutiveFailures: reflection.consecutiveFailures ?? 0,
  };
}
