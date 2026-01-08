/**
 * Learning System Stress Test
 *
 * Generates synthetic trade data to validate learning system assumptions:
 * - Does lesson qualification work at scale?
 * - Does the inline judge catch patterns?
 * - Does promotion pipeline create useful lessons?
 * - Do proven lessons actually correlate with better outcomes?
 */

import { prisma } from './db/prisma.js';
import type { Domain } from './types/index.js';
import { recordSkillOutcome, wilsonScoreLowerBound } from './skills/skill-outcome.js';
import { runPromotionPipeline } from './learning/promotion.js';
import {
  MIN_APPLICATIONS_FOR_PROVEN,
  MIN_SUCCESS_RATE_FOR_EFFECTIVE,
  MIN_WILSON_LOWER_BOUND,
} from './skills/types.js';

// =============================================================================
// CONFIGURATION
// =============================================================================

interface StressTestConfig {
  // How many synthetic trades to generate
  tradeCount: number;

  // How many unique lessons to simulate
  lessonCount: number;

  // Domains to test
  domains: Domain[];

  // Probability distributions
  profitProbability: number;  // Base probability of profit
  lessonBoost: number;        // How much a "good" lesson improves odds

  // Lesson characteristics
  goodLessonRatio: number;    // % of lessons that are actually helpful
}

const DEFAULT_CONFIG: StressTestConfig = {
  tradeCount: 500,
  lessonCount: 20,
  domains: ['dlmm', 'perps', 'spot', 'polymarket'],
  profitProbability: 0.45,    // Base 45% win rate
  lessonBoost: 0.15,          // Good lessons add 15% to win rate
  goodLessonRatio: 0.4,       // 40% of lessons are actually good
};

// =============================================================================
// SYNTHETIC DATA GENERATION
// =============================================================================

interface SyntheticLesson {
  name: string;
  domain: Domain;
  isGood: boolean;  // Does it actually help?
}

interface SyntheticTrade {
  id: string;
  domain: Domain;
  appliedLessons: string[];
  outcome: 'profit' | 'loss';
  pnlPercent: number;
}

function generateLessons(config: StressTestConfig): SyntheticLesson[] {
  const lessons: SyntheticLesson[] = [];
  const types = ['warning', 'pattern', 'strategy'];

  for (let i = 0; i < config.lessonCount; i++) {
    const domain = config.domains[i % config.domains.length];
    const type = types[i % types.length];
    const isGood = Math.random() < config.goodLessonRatio;

    lessons.push({
      name: `${type}-${domain}-test-${i}`,
      domain,
      isGood,
    });
  }

  return lessons;
}

function generateTrades(
  config: StressTestConfig,
  lessons: SyntheticLesson[]
): SyntheticTrade[] {
  const trades: SyntheticTrade[] = [];

  for (let i = 0; i < config.tradeCount; i++) {
    const domain = config.domains[i % config.domains.length];

    // Pick 1-3 random lessons for this domain
    const domainLessons = lessons.filter(l => l.domain === domain);
    const numLessons = Math.floor(Math.random() * 3) + 1;
    const appliedLessons = shuffle(domainLessons)
      .slice(0, numLessons)
      .map(l => l.name);

    // Calculate win probability based on applied lessons
    let winProb = config.profitProbability;
    for (const lessonName of appliedLessons) {
      const lesson = lessons.find(l => l.name === lessonName);
      if (lesson?.isGood) {
        winProb += config.lessonBoost;
      } else {
        winProb -= config.lessonBoost / 2; // Bad lessons hurt a bit
      }
    }
    winProb = Math.max(0.1, Math.min(0.9, winProb));

    // Determine outcome
    const isProfit = Math.random() < winProb;
    const pnlPercent = isProfit
      ? Math.random() * 20 + 2   // 2-22% profit
      : -(Math.random() * 15 + 2); // 2-17% loss

    trades.push({
      id: `stress-test-${Date.now()}-${i}`,
      domain,
      appliedLessons,
      outcome: isProfit ? 'profit' : 'loss',
      pnlPercent,
    });
  }

  return trades;
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

// =============================================================================
// DATABASE SEEDING
// =============================================================================

async function seedLessons(lessons: SyntheticLesson[]): Promise<void> {
  console.log(`\n📝 Seeding ${lessons.length} lessons to SkillReflection...`);

  for (const lesson of lessons) {
    // Extract source type from lesson name (warning-*, pattern-*, strategy-*)
    const sourceType = lesson.name.split('-')[0];

    await prisma.skillReflection.upsert({
      where: {
        skillName_domain: {
          skillName: lesson.name,
          domain: lesson.domain,
        },
      },
      update: {},
      create: {
        skillName: lesson.name,
        skillPath: `.claude/skills/reflections/${lesson.name}.md`,
        domain: lesson.domain,
        sourceType,
        timesApplied: 0,
        successCount: 0,
        failureCount: 0,
        effectivenessScore: null,
        provenEffective: false,
        consecutiveFailures: 0,
      },
    });
  }
}

async function simulateTrades(trades: SyntheticTrade[]): Promise<void> {
  console.log(`\n📈 Simulating ${trades.length} trades...`);

  let processed = 0;
  const batchSize = 50;

  for (const trade of trades) {
    // Create SkillRecommendation records for applied lessons
    for (const lessonName of trade.appliedLessons) {
      await prisma.skillRecommendation.create({
        data: {
          decisionId: trade.id,
          skillName: lessonName,
          domain: trade.domain,
          relevanceScore: 0.7 + Math.random() * 0.3,
          wasPresented: true,
          wasApplied: true,
          agentQuote: `Applying '${lessonName}' in test trade`,
        },
      });
    }

    // Record outcome
    await recordSkillOutcome(trade.id, trade.outcome, trade.pnlPercent);

    processed++;
    if (processed % batchSize === 0) {
      console.log(`   Processed ${processed}/${trades.length} trades...`);
    }
  }
}

// =============================================================================
// ANALYSIS
// =============================================================================

interface LessonStats {
  name: string;
  domain: string;
  timesApplied: number;
  successRate: number;
  wilsonScore: number;
  provenEffective: boolean;
  wasActuallyGood: boolean;
  correctlyClassified: boolean;
}

async function analyzeLessons(
  syntheticLessons: SyntheticLesson[]
): Promise<LessonStats[]> {
  const stats: LessonStats[] = [];

  for (const lesson of syntheticLessons) {
    const reflection = await prisma.skillReflection.findUnique({
      where: {
        skillName_domain: {
          skillName: lesson.name,
          domain: lesson.domain,
        },
      },
    });

    if (reflection) {
      const successRate = reflection.timesApplied > 0
        ? reflection.successCount / reflection.timesApplied
        : 0;

      // Calculate Wilson score
      const wilsonScore = wilsonScoreLowerBound(
        reflection.successCount,
        reflection.timesApplied
      );

      // A lesson is "correctly classified" if:
      // - It's a good lesson and proven effective, OR
      // - It's a bad lesson and NOT proven effective
      const correctlyClassified = lesson.isGood === (reflection.provenEffective ?? false);

      stats.push({
        name: lesson.name,
        domain: lesson.domain,
        timesApplied: reflection.timesApplied,
        successRate,
        wilsonScore,
        provenEffective: reflection.provenEffective ?? false,
        wasActuallyGood: lesson.isGood,
        correctlyClassified,
      });
    }
  }

  return stats;
}

function printAnalysis(stats: LessonStats[]): void {
  console.log('\n══════════════════════════════════════════════════════════════');
  console.log('                     STRESS TEST ANALYSIS');
  console.log('══════════════════════════════════════════════════════════════\n');

  // Show current thresholds
  console.log('⚙️  Current Thresholds');
  console.log(`   MIN_APPLICATIONS_FOR_PROVEN: ${MIN_APPLICATIONS_FOR_PROVEN}`);
  console.log(`   MIN_SUCCESS_RATE_FOR_EFFECTIVE: ${(MIN_SUCCESS_RATE_FOR_EFFECTIVE * 100).toFixed(0)}%`);
  console.log(`   MIN_WILSON_LOWER_BOUND: ${MIN_WILSON_LOWER_BOUND}\n`);

  // Overall classification accuracy
  const withEnoughData = stats.filter(s => s.timesApplied >= MIN_APPLICATIONS_FOR_PROVEN);
  const correctCount = withEnoughData.filter(s => s.correctlyClassified).length;
  const accuracy = withEnoughData.length > 0
    ? (correctCount / withEnoughData.length * 100).toFixed(1)
    : 'N/A';

  console.log('📊 Classification Accuracy');
  console.log(`   Lessons with ≥${MIN_APPLICATIONS_FOR_PROVEN} applications: ${withEnoughData.length}`);
  console.log(`   Correctly classified: ${correctCount}`);
  console.log(`   Accuracy: ${accuracy}%\n`);

  // Breakdown by actual quality
  const actuallyGood = stats.filter(s => s.wasActuallyGood);
  const actuallyBad = stats.filter(s => !s.wasActuallyGood);

  const truePositives = actuallyGood.filter(s => s.provenEffective).length;
  const falseNegatives = actuallyGood.filter(s => !s.provenEffective && s.timesApplied >= MIN_APPLICATIONS_FOR_PROVEN).length;
  const trueNegatives = actuallyBad.filter(s => !s.provenEffective && s.timesApplied >= MIN_APPLICATIONS_FOR_PROVEN).length;
  const falsePositives = actuallyBad.filter(s => s.provenEffective).length;

  // Calculate rates
  const totalClassified = truePositives + falseNegatives + trueNegatives + falsePositives;
  const falsePositiveRate = (trueNegatives + falsePositives) > 0
    ? (falsePositives / (trueNegatives + falsePositives) * 100).toFixed(1)
    : 'N/A';

  console.log('📈 Confusion Matrix');
  console.log(`   True Positives (good lesson, marked proven): ${truePositives}`);
  console.log(`   False Negatives (good lesson, not marked): ${falseNegatives}`);
  console.log(`   True Negatives (bad lesson, not proven): ${trueNegatives}`);
  console.log(`   False Positives (bad lesson, marked proven): ${falsePositives}`);
  console.log(`   False Positive Rate: ${falsePositiveRate}%\n`);

  // Wilson score distribution
  console.log('📐 Wilson Score Distribution');
  const wilsonBuckets = [0, 0.25, 0.35, 0.45, 0.55, 1.0];
  for (let i = 0; i < wilsonBuckets.length - 1; i++) {
    const count = stats.filter(s =>
      s.wilsonScore >= wilsonBuckets[i] && s.wilsonScore < wilsonBuckets[i + 1]
    ).length;
    const label = wilsonBuckets[i + 1] <= MIN_WILSON_LOWER_BOUND ? '⬇️' : '✅';
    console.log(`   ${(wilsonBuckets[i] * 100).toFixed(0)}%-${(wilsonBuckets[i + 1] * 100).toFixed(0)}%: ${'█'.repeat(count)} (${count}) ${label}`);
  }

  // Success rate distribution
  console.log('\n📉 Success Rate Distribution');
  const buckets = [0, 0.25, 0.5, 0.75, 1.0];
  for (let i = 0; i < buckets.length - 1; i++) {
    const count = stats.filter(s =>
      s.successRate >= buckets[i] && s.successRate < buckets[i + 1]
    ).length;
    console.log(`   ${(buckets[i] * 100).toFixed(0)}%-${(buckets[i + 1] * 100).toFixed(0)}%: ${'█'.repeat(count)} (${count})`);
  }

  // Top performers (by Wilson score for more accurate ranking)
  console.log('\n🏆 Top 5 Lessons by Wilson Score');
  const top5 = [...stats]
    .filter(s => s.timesApplied >= MIN_APPLICATIONS_FOR_PROVEN)
    .sort((a, b) => b.wilsonScore - a.wilsonScore)
    .slice(0, 5);

  for (const s of top5) {
    const actualLabel = s.wasActuallyGood ? '✓ good' : '✗ bad';
    const provenLabel = s.provenEffective ? 'PROVEN' : 'not proven';
    console.log(`   ${s.name}: Wilson ${s.wilsonScore.toFixed(2)}, Rate ${(s.successRate * 100).toFixed(0)}% (${s.timesApplied} uses) [${actualLabel}] [${provenLabel}]`);
  }

  // Worst performers
  console.log('\n💀 Bottom 5 Lessons by Wilson Score');
  const bottom5 = [...stats]
    .filter(s => s.timesApplied >= MIN_APPLICATIONS_FOR_PROVEN)
    .sort((a, b) => a.wilsonScore - b.wilsonScore)
    .slice(0, 5);

  for (const s of bottom5) {
    const actualLabel = s.wasActuallyGood ? '✓ good' : '✗ bad';
    const provenLabel = s.provenEffective ? 'PROVEN' : 'not proven';
    console.log(`   ${s.name}: Wilson ${s.wilsonScore.toFixed(2)}, Rate ${(s.successRate * 100).toFixed(0)}% (${s.timesApplied} uses) [${actualLabel}] [${provenLabel}]`);
  }
}

// =============================================================================
// CLEANUP
// =============================================================================

async function cleanup(): Promise<void> {
  console.log('\n🧹 Cleaning up stress test data...');

  await prisma.skillRecommendation.deleteMany({
    where: {
      decisionId: { startsWith: 'stress-test-' },
    },
  });

  await prisma.skillReflection.deleteMany({
    where: {
      skillName: { contains: '-test-' },
    },
  });

  console.log('   Cleanup complete.');
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        CLAUDEFI LEARNING SYSTEM STRESS TEST                  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  const config = DEFAULT_CONFIG;

  console.log('\n📋 Configuration:');
  console.log(`   Trades: ${config.tradeCount}`);
  console.log(`   Lessons: ${config.lessonCount}`);
  console.log(`   Domains: ${config.domains.join(', ')}`);
  console.log(`   Base win rate: ${(config.profitProbability * 100).toFixed(0)}%`);
  console.log(`   Lesson boost: ${(config.lessonBoost * 100).toFixed(0)}%`);
  console.log(`   Good lesson ratio: ${(config.goodLessonRatio * 100).toFixed(0)}%`);

  try {
    // Generate synthetic data
    console.log('\n🎲 Generating synthetic data...');
    const lessons = generateLessons(config);
    const trades = generateTrades(config, lessons);

    console.log(`   Generated ${lessons.length} lessons (${lessons.filter(l => l.isGood).length} good, ${lessons.filter(l => !l.isGood).length} bad)`);
    console.log(`   Generated ${trades.length} trades`);

    // Seed database
    await seedLessons(lessons);

    // Simulate trades
    await simulateTrades(trades);

    // Run promotion pipeline
    console.log('\n📈 Running promotion pipeline...');
    const promotionResult = await runPromotionPipeline();
    console.log(`   Promoted: ${promotionResult.insightsToMemory} to memory, ${promotionResult.patternsToSkills} to lessons`);

    // Analyze results
    const stats = await analyzeLessons(lessons);
    printAnalysis(stats);

    // Ask about cleanup
    console.log('\n');

  } catch (error) {
    console.error('Fatal error:', error);
  } finally {
    // Optionally cleanup
    const args = process.argv.slice(2);
    if (args.includes('--cleanup')) {
      await cleanup();
    } else {
      console.log('💡 Run with --cleanup flag to remove stress test data');
    }

    await prisma.$disconnect();
  }
}

main();
