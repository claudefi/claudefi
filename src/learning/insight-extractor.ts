/**
 * Insight Extractor (Phase 2)
 *
 * Automatically extracts insights from judge evaluations and adds them to memory.
 * Bridges the gap between the judge feedback system and the memory system.
 */

import { prisma } from '../db/prisma.js';
import type { Domain } from '../types/index.js';
import { remember, logDailyMemory } from '../memory/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface ExtractedInsight {
  id: string;
  domain: Domain;
  insight: string;
  insightType: string;
  importance: 'low' | 'medium' | 'high';
  source: string;
  wasPromoted: boolean;
}

// =============================================================================
// INSIGHT EXTRACTION
// =============================================================================

/**
 * Extract a key insight from inline judge evaluation and add to memory
 */
export async function extractInsightToMemory(
  domain: Domain,
  keyInsight: string,
  source: string
): Promise<void> {
  if (!keyInsight || keyInsight.length < 10) {
    return; // Skip trivial insights
  }

  // Determine importance based on insight content
  const importance = determineImportance(keyInsight);

  // Add to persistent memory if important enough
  if (importance === 'high' || importance === 'medium') {
    await remember(domain, keyInsight, importance, source);
  }

  // Always log to daily memory
  await logDailyMemory(domain, 'learning', keyInsight, { source });
}

/**
 * Determine importance of an insight based on content analysis
 */
function determineImportance(insight: string): 'low' | 'medium' | 'high' {
  const lower = insight.toLowerCase();

  // High importance indicators
  const highIndicators = [
    'always', 'never', 'critical', 'essential', 'must', 'crucial',
    'significant loss', 'major', 'fundamental', 'key rule',
  ];

  // Medium importance indicators
  const mediumIndicators = [
    'should', 'important', 'consider', 'recommend', 'better to',
    'generally', 'often', 'usually', 'prefer',
  ];

  for (const indicator of highIndicators) {
    if (lower.includes(indicator)) {
      return 'high';
    }
  }

  for (const indicator of mediumIndicators) {
    if (lower.includes(indicator)) {
      return 'medium';
    }
  }

  return 'low';
}

// =============================================================================
// BATCH SYNC FROM JUDGE
// =============================================================================

/**
 * Sync unprocessed judge insights to memory
 * Run at the start of each cycle to catch up
 */
export async function syncJudgeInsightsToMemory(domain: Domain): Promise<number> {
  // Find evaluations that haven't been promoted yet
  const unpromoted = await prisma.decisionEvaluation.findMany({
    where: {
      domain,
      promotedToMemory: false,
      // Only sync validated insights (where we know the outcome)
      judgeWasRight: true,
      qualityScore: { gte: 0.7 }, // High quality insights only
    },
    orderBy: { createdAt: 'desc' },
    take: 10, // Limit per sync
  });

  let synced = 0;

  for (const evaluation of unpromoted) {
    try {
      // Extract the key insight
      const importance = evaluation.qualityScore && evaluation.qualityScore >= 0.8
        ? 'high'
        : 'medium';

      await remember(
        domain,
        evaluation.keyInsight,
        importance,
        `judge-${evaluation.insightType}`
      );

      // Mark as promoted
      await prisma.decisionEvaluation.update({
        where: { id: evaluation.id },
        data: {
          promotedToMemory: true,
          promotedAt: new Date(),
        },
      });

      synced++;
    } catch (error) {
      console.warn(`Failed to sync insight ${evaluation.id}:`, error);
    }
  }

  return synced;
}

/**
 * Sync insights across all domains
 */
export async function syncAllDomainInsights(): Promise<Record<Domain, number>> {
  const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
  const results: Record<Domain, number> = {
    dlmm: 0,
    perps: 0,
    polymarket: 0,
    spot: 0,
  };

  for (const domain of domains) {
    results[domain] = await syncJudgeInsightsToMemory(domain);
  }

  return results;
}

// =============================================================================
// INSIGHT QUERIES
// =============================================================================

/**
 * Get insights that have been synced to memory
 */
export async function getPromotedInsights(
  domain?: Domain,
  limit = 20
): Promise<ExtractedInsight[]> {
  const evaluations = await prisma.decisionEvaluation.findMany({
    where: {
      domain: domain || undefined,
      promotedToMemory: true,
    },
    orderBy: { promotedAt: 'desc' },
    take: limit,
  });

  return evaluations.map(e => ({
    id: e.id,
    domain: e.domain as Domain,
    insight: e.keyInsight,
    insightType: e.insightType,
    importance: (e.qualityScore ?? 0) >= 0.8 ? 'high' : (e.qualityScore ?? 0) >= 0.6 ? 'medium' : 'low',
    source: `judge-${e.insightType}`,
    wasPromoted: true,
  }));
}

/**
 * Get insights pending promotion
 */
export async function getPendingInsights(
  domain?: Domain,
  limit = 20
): Promise<ExtractedInsight[]> {
  const evaluations = await prisma.decisionEvaluation.findMany({
    where: {
      domain: domain || undefined,
      promotedToMemory: false,
      judgeWasRight: true,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return evaluations.map(e => ({
    id: e.id,
    domain: e.domain as Domain,
    insight: e.keyInsight,
    insightType: e.insightType,
    importance: (e.qualityScore ?? 0) >= 0.8 ? 'high' : (e.qualityScore ?? 0) >= 0.6 ? 'medium' : 'low',
    source: `judge-${e.insightType}`,
    wasPromoted: false,
  }));
}

/**
 * Get count of insights by status
 */
export async function getInsightStats(domain?: Domain): Promise<{
  promoted: number;
  pending: number;
  total: number;
}> {
  const [promoted, pending] = await Promise.all([
    prisma.decisionEvaluation.count({
      where: {
        domain: domain || undefined,
        promotedToMemory: true,
      },
    }),
    prisma.decisionEvaluation.count({
      where: {
        domain: domain || undefined,
        promotedToMemory: false,
        judgeWasRight: true,
      },
    }),
  ]);

  return {
    promoted,
    pending,
    total: promoted + pending,
  };
}

// =============================================================================
// DEDUPLICATION
// =============================================================================

/**
 * Check if a similar insight already exists in memory
 * Uses simple text similarity
 */
export async function isDuplicateInsight(
  domain: Domain,
  newInsight: string
): Promise<boolean> {
  // Get existing facts from memory
  const { recall } = await import('../memory/index.js');
  const existingFacts = await recall(domain);

  const newLower = newInsight.toLowerCase();
  const newWords = new Set(newLower.split(/\s+/).filter(w => w.length > 3));

  for (const fact of existingFacts) {
    const factLower = fact.toLowerCase();
    const factWords = new Set(factLower.split(/\s+/).filter(w => w.length > 3));

    // Calculate Jaccard similarity
    const intersection = new Set([...newWords].filter(w => factWords.has(w)));
    const union = new Set([...newWords, ...factWords]);
    const similarity = intersection.size / union.size;

    // If >60% similar, consider it a duplicate
    if (similarity > 0.6) {
      return true;
    }
  }

  return false;
}

/**
 * Extract insight with deduplication check
 */
export async function extractInsightWithDedup(
  domain: Domain,
  keyInsight: string,
  source: string
): Promise<boolean> {
  // Check for duplicate
  const isDup = await isDuplicateInsight(domain, keyInsight);

  if (isDup) {
    console.log(`  [InsightExtractor] Skipped duplicate insight for ${domain}`);
    return false;
  }

  await extractInsightToMemory(domain, keyInsight, source);
  return true;
}
