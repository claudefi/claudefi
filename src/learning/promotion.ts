/**
 * Learning Promotion Pipelines (Phase 3)
 *
 * Creates clear data flow between learning systems:
 * - Pipeline 1: Judge insights → Memory facts
 * - Pipeline 2: Memory patterns → Skills
 *
 * This consolidates overlapping information and creates a promotion path.
 */

import { prisma } from '../db/prisma.js';
import type { Domain } from '../types/index.js';
import { recall, remember } from '../memory/index.js';
import { saveSkill, type GeneratedSkill } from '../skills/skill-creator.js';

// =============================================================================
// TYPES
// =============================================================================

export interface PromotionResult {
  insightsToMemory: number;
  patternsToSkills: number;
  linksCreated: number;
}

export interface PatternCluster {
  domain: Domain;
  theme: string;
  facts: string[];
  frequency: number;
}

// =============================================================================
// PIPELINE 1: JUDGE → MEMORY
// =============================================================================

/**
 * Promote validated judge insights to persistent memory
 *
 * Criteria:
 * - judgeWasRight = true (validated by outcome)
 * - qualityScore >= 0.7 (high quality insight)
 * - Not already promoted
 */
export async function promoteInsightsToMemory(): Promise<number> {
  const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
  let totalPromoted = 0;

  for (const domain of domains) {
    // Find validated, high-quality insights not yet promoted
    const insights = await prisma.decisionEvaluation.findMany({
      where: {
        domain,
        judgeWasRight: true,
        qualityScore: { gte: 0.7 },
        promotedToMemory: false,
      },
      orderBy: { qualityScore: 'desc' },
      take: 5, // Limit per domain per run
    });

    for (const insight of insights) {
      try {
        // Check for duplicates in memory
        const existingFacts = await recall(domain);
        const isDuplicate = existingFacts.some(fact =>
          calculateSimilarity(fact, insight.keyInsight) > 0.6
        );

        if (!isDuplicate) {
          // Promote to memory
          const importance = (insight.qualityScore ?? 0) >= 0.85 ? 'high' : 'medium';
          await remember(domain, insight.keyInsight, importance, `judge-${insight.insightType}`);

          // Create learning link
          await prisma.learningLink.create({
            data: {
              sourceType: 'judge',
              sourceId: insight.id,
              targetType: 'memory',
              targetId: `${domain}-${Date.now()}`,
              linkType: 'promoted',
              metadata: JSON.stringify({
                qualityScore: insight.qualityScore,
                insightType: insight.insightType,
              }),
            },
          });

          totalPromoted++;
        }

        // Mark as promoted (even if duplicate, to avoid re-checking)
        await prisma.decisionEvaluation.update({
          where: { id: insight.id },
          data: {
            promotedToMemory: true,
            promotedAt: new Date(),
          },
        });
      } catch (error) {
        console.warn(`Failed to promote insight ${insight.id}:`, error);
      }
    }
  }

  return totalPromoted;
}

// =============================================================================
// PIPELINE 2: MEMORY → SKILLS
// =============================================================================

/**
 * Detect patterns in memory facts and promote to skills
 *
 * When the same concept appears 3+ times across memory,
 * it's elevated to a pattern skill for more prominent loading.
 */
export async function promotePatternsToSkills(): Promise<number> {
  const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
  let skillsCreated = 0;

  for (const domain of domains) {
    const clusters = await detectPatternClusters(domain);

    for (const cluster of clusters) {
      if (cluster.frequency >= 3) {
        try {
          // Create a pattern skill from the cluster
          const skill = await createPatternSkill(cluster);

          if (skill) {
            await saveSkill(skill);

            // Create learning links for all facts in the cluster
            for (const fact of cluster.facts) {
              await prisma.learningLink.create({
                data: {
                  sourceType: 'memory',
                  sourceId: `${domain}-fact-${hashString(fact)}`,
                  targetType: 'skill',
                  targetId: skill.filename,
                  linkType: 'derived',
                  metadata: JSON.stringify({ theme: cluster.theme }),
                },
              });
            }

            skillsCreated++;
          }
        } catch (error) {
          console.warn(`Failed to create pattern skill for ${cluster.theme}:`, error);
        }
      }
    }
  }

  return skillsCreated;
}

/**
 * Detect clusters of similar facts in memory
 */
async function detectPatternClusters(domain: Domain): Promise<PatternCluster[]> {
  const facts = await recall(domain);

  if (facts.length < 3) {
    return [];
  }

  // Group facts by similarity
  const clusters: PatternCluster[] = [];
  const used = new Set<number>();

  for (let i = 0; i < facts.length; i++) {
    if (used.has(i)) continue;

    const cluster: string[] = [facts[i]];
    used.add(i);

    for (let j = i + 1; j < facts.length; j++) {
      if (used.has(j)) continue;

      if (calculateSimilarity(facts[i], facts[j]) > 0.4) {
        cluster.push(facts[j]);
        used.add(j);
      }
    }

    if (cluster.length >= 3) {
      clusters.push({
        domain,
        theme: extractTheme(cluster),
        facts: cluster,
        frequency: cluster.length,
      });
    }
  }

  return clusters;
}

/**
 * Create a pattern skill from a cluster of related facts
 */
async function createPatternSkill(cluster: PatternCluster): Promise<GeneratedSkill | null> {
  const content = `# Pattern: ${cluster.theme}

*Generated from ${cluster.frequency} related memory facts*
*Domain: ${cluster.domain.toUpperCase()}*

---

## Consolidated Learning

This pattern was detected across multiple trading experiences. The following facts consistently appear together:

${cluster.facts.map((f, i) => `${i + 1}. ${f}`).join('\n')}

## Application

When making ${cluster.domain} trading decisions, apply this consolidated knowledge:

- **Before entering**: Check if this pattern applies to current conditions
- **During analysis**: Weight these factors appropriately
- **Risk management**: Adjust position sizing based on pattern confidence

## Origin

This skill was automatically generated by the learning promotion system after detecting consistent patterns across ${cluster.frequency} separate observations.
`;

  return {
    filename: `pattern-${cluster.domain}-${hashString(cluster.theme)}-${Date.now()}.md`,
    title: `Pattern: ${cluster.theme}`,
    content,
    domain: cluster.domain,
    type: 'pattern',
  };
}

// =============================================================================
// COMBINED PIPELINE
// =============================================================================

/**
 * Run all promotion pipelines
 */
export async function runPromotionPipeline(): Promise<PromotionResult> {
  console.log('📈 Running learning promotion pipeline...');

  const insightsToMemory = await promoteInsightsToMemory();
  const patternsToSkills = await promotePatternsToSkills();

  const linksCreated = await prisma.learningLink.count({
    where: {
      createdAt: {
        gte: new Date(Date.now() - 60000), // Last minute
      },
    },
  });

  const result = {
    insightsToMemory,
    patternsToSkills,
    linksCreated,
  };

  if (insightsToMemory > 0 || patternsToSkills > 0) {
    console.log(`   ✅ Promoted: ${insightsToMemory} insights → memory, ${patternsToSkills} patterns → skills`);
  }

  return result;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Calculate text similarity using Jaccard index
 */
function calculateSimilarity(text1: string, text2: string): number {
  const words1 = new Set(
    text1.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  );
  const words2 = new Set(
    text2.toLowerCase().split(/\s+/).filter(w => w.length > 3)
  );

  const intersection = new Set([...words1].filter(w => words2.has(w)));
  const union = new Set([...words1, ...words2]);

  return union.size > 0 ? intersection.size / union.size : 0;
}

/**
 * Extract a theme from a cluster of facts
 */
function extractTheme(facts: string[]): string {
  // Find common words across all facts
  const wordCounts = new Map<string, number>();

  for (const fact of facts) {
    const words = fact.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    const uniqueWords = new Set(words);

    for (const word of uniqueWords) {
      wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
    }
  }

  // Find words that appear in most facts
  const commonWords: string[] = [];
  for (const [word, count] of wordCounts) {
    if (count >= Math.ceil(facts.length * 0.6)) {
      commonWords.push(word);
    }
  }

  if (commonWords.length > 0) {
    return commonWords.slice(0, 3).join('-');
  }

  return 'recurring-pattern';
}

/**
 * Simple string hash for IDs
 */
function hashString(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36).slice(0, 8);
}

// =============================================================================
// LINK QUERIES
// =============================================================================

/**
 * Get promotion links for a source
 */
export async function getPromotionLinks(
  sourceType: 'judge' | 'memory' | 'skill',
  sourceId: string
): Promise<Array<{
  targetType: string;
  targetId: string;
  linkType: string;
  createdAt: Date;
}>> {
  return prisma.learningLink.findMany({
    where: { sourceType, sourceId },
    select: {
      targetType: true,
      targetId: true,
      linkType: true,
      createdAt: true,
    },
  });
}

/**
 * Get promotion statistics
 */
export async function getPromotionStats(): Promise<{
  totalLinks: number;
  judgeToMemory: number;
  memoryToSkill: number;
}> {
  const [total, judgeToMemory, memoryToSkill] = await Promise.all([
    prisma.learningLink.count(),
    prisma.learningLink.count({
      where: { sourceType: 'judge', targetType: 'memory' },
    }),
    prisma.learningLink.count({
      where: { sourceType: 'memory', targetType: 'skill' },
    }),
  ]);

  return {
    totalLinks: total,
    judgeToMemory,
    memoryToSkill,
  };
}
