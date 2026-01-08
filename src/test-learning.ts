/**
 * Learning System Test Suite
 *
 * Tests for the improved learning feedback loop:
 * - Phase 1: Skill recommendations and tracking
 * - Phase 2: Inline judge evaluation
 * - Phase 3: Promotion pipelines
 */

import { prisma } from './db/prisma.js';
import type { Domain, AgentDecision, DomainContext } from './types/index.js';

// =============================================================================
// TEST UTILITIES
// =============================================================================

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  durationMs: number;
}

const results: TestResult[] = [];

async function runTest(name: string, fn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await fn();
    results.push({
      name,
      passed: true,
      message: 'Passed',
      durationMs: Date.now() - start,
    });
    console.log(`  ✅ ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    results.push({
      name,
      passed: false,
      message,
      durationMs: Date.now() - start,
    });
    console.log(`  ❌ ${name}: ${message}`);
  }
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

// =============================================================================
// TEST DATA
// =============================================================================

const testDomain: Domain = 'dlmm';

const mockDecision: AgentDecision = {
  action: 'buy',
  target: 'SOL/USDC',
  amountUsd: 100,
  confidence: 0.75,
  reasoning: 'Based on the volatility-clustering skill, SOL is showing bullish momentum with high volume.',
};

const mockContext: DomainContext = {
  domain: testDomain,
  balance: 1000,
  positions: [],
  recentDecisions: [
    {
      action: 'buy',
      target: 'SOL/USDC',
      confidence: 0.7,
      outcome: 'profit',
    },
  ],
  markets: {
    'SOL/USDC': {
      price: 150,
      volume24h: 1000000,
      change24h: 5.2,
    },
  },
};

// =============================================================================
// PHASE 1 TESTS: SKILL RECOMMENDATIONS
// =============================================================================

async function testSkillTypes(): Promise<void> {
  console.log('\n📦 Phase 1: Skill Recommendations\n');

  await runTest('Skill types import correctly', async () => {
    const types = await import('./skills/types.js');
    assert(typeof types.MAX_RECOMMENDED_SKILLS === 'number', 'MAX_RECOMMENDED_SKILLS should be a number');
    assert(types.MAX_RECOMMENDED_SKILLS === 5, 'MAX_RECOMMENDED_SKILLS should be 5');
    assert(types.MIN_APPLICATIONS_FOR_PROVEN === 3, 'MIN_APPLICATIONS_FOR_PROVEN should be 3');
    assert(types.MIN_SUCCESS_RATE_FOR_EFFECTIVE === 0.5, 'MIN_SUCCESS_RATE_FOR_EFFECTIVE should be 0.5');
  });

  await runTest('Skill recommender loads qualified skills', async () => {
    const { recommendSkills } = await import('./skills/skill-recommender.js');
    const result = await recommendSkills(testDomain, {
      volatility: 0.05,
      volume24h: 1000000,
      priceChange24h: 5.2,
      sentiment: 'bullish',
      marketTrend: 'uptrend',
    });

    assert(result !== null, 'recommendSkills should return a result');
    assert(Array.isArray(result.recommendedSkills), 'result should have recommendedSkills array');
    assert(result.recommendedSkills.length <= 5, 'Should return at most 5 skills');
  });

  await runTest('Skill recommender formats skills correctly', async () => {
    const { formatRecommendedSkills } = await import('./skills/skill-recommender.js');
    const mockSkills = [
      {
        name: 'test-skill',
        domain: testDomain,
        content: '# Test Skill\nThis is a test skill.',
        relevanceScore: 0.8,
        provenEffective: true,
        timesApplied: 5,
        successRate: 0.6,
        sourceType: 'strategy' as const,
      },
    ];

    const formatted = formatRecommendedSkills(mockSkills);
    assert(formatted.includes('test-skill'), 'Formatted output should include skill name');
    assert(formatted.toLowerCase().includes('proven'), 'Formatted output should indicate proven status');
  });

  await runTest('Skill tracker detects explicit references', async () => {
    const { detectSkillUsage } = await import('./skills/skill-tracker.js');
    const mockSkill = {
      name: 'volatility-clustering',
      domain: testDomain,
      content: '# Volatility Clustering\nWhen volatility clusters...',
      relevanceScore: 0.8,
      provenEffective: true,
      timesApplied: 5,
      successRate: 0.6,
      sourceType: 'pattern' as const,
    };

    // Test with quoted skill name (matches explicit pattern)
    const detection = detectSkillUsage(
      mockSkill,
      "Applying 'volatility-clustering' skill, I recommend buying."
    );

    assert(detection.wasApplied === true, 'Should detect explicit skill reference');
    assert(detection.matchType === 'explicit', 'Should mark as explicit reference');
  });

  await runTest('Skill tracker stores recommendations in database', async () => {
    const { trackSkillUsage } = await import('./skills/skill-tracker.js');
    const testDecisionId = `test-${Date.now()}`;

    const mockSkills = [
      {
        name: 'test-track-skill',
        domain: testDomain,
        content: '# Test Skill',
        relevanceScore: 0.8,
        provenEffective: true,
        timesApplied: 3,
        successRate: 0.67,
        sourceType: 'strategy' as const,
      },
    ];

    const result = await trackSkillUsage(
      testDecisionId,
      mockSkills,
      "Applying 'test-track-skill' to make this decision."
    );

    assert(result.recommendationsCreated === 1, 'Should track 1 skill');
    const appliedCount = result.detections.filter(d => d.wasApplied).length;
    assert(appliedCount >= 1, 'Should mark at least 1 skill as applied');

    // Clean up
    await prisma.skillRecommendation.deleteMany({
      where: { decisionId: testDecisionId },
    });
  });

  await runTest('Skill outcome updates effectiveness', async () => {
    const { recordSkillOutcome } = await import('./skills/skill-outcome.js');
    const testDecisionId = `test-outcome-${Date.now()}`;

    // Create a test recommendation first
    await prisma.skillRecommendation.create({
      data: {
        decisionId: testDecisionId,
        skillName: 'test-outcome-skill',
        domain: testDomain,
        relevanceScore: 0.8,
        wasPresented: true,
        wasApplied: true,
      },
    });

    const result = await recordSkillOutcome(testDecisionId, 'profit', 5.5);

    assert(result.skillsUpdated > 0, 'Should update at least 1 skill recommendation');

    // Clean up
    await prisma.skillRecommendation.deleteMany({
      where: { decisionId: testDecisionId },
    });
  });
}

// =============================================================================
// PHASE 2 TESTS: INLINE JUDGE
// =============================================================================

async function testInlineJudge(): Promise<void> {
  console.log('\n⚖️ Phase 2: Inline Judge\n');

  await runTest('Inline judge module loads', async () => {
    const judge = await import('./learning/inline-judge.js');
    assert(typeof judge.evaluateInline === 'function', 'evaluateInline should be a function');
    assert(typeof judge.selectJudgeMode === 'function', 'selectJudgeMode should be a function');
    assert(typeof judge.formatInlineResult === 'function', 'formatInlineResult should be a function');
  });

  await runTest('Judge mode selection works', async () => {
    const { selectJudgeMode } = await import('./learning/inline-judge.js');

    // Low stakes should use fast mode
    const lowStakes = selectJudgeMode({
      action: 'buy',
      target: 'SOL/USDC',
      amountUsd: 50,
      confidence: 0.6,
      reasoning: 'Test',
    });
    assert(lowStakes === 'fast', 'Low stakes should use fast mode');

    // High amount should use thorough mode
    const highAmount = selectJudgeMode({
      action: 'buy',
      target: 'SOL/USDC',
      amountUsd: 600,
      confidence: 0.6,
      reasoning: 'Test',
    });
    assert(highAmount === 'thorough', 'High amount should use thorough mode');

    // High confidence should use thorough mode
    const highConfidence = selectJudgeMode({
      action: 'buy',
      target: 'SOL/USDC',
      amountUsd: 100,
      confidence: 0.85,
      reasoning: 'Test',
    });
    assert(highConfidence === 'thorough', 'High confidence should use thorough mode');
  });

  await runTest('Hold decisions skip evaluation', async () => {
    const { evaluateInline } = await import('./learning/inline-judge.js');

    const result = await evaluateInline(
      { action: 'hold', reasoning: 'No action needed' },
      mockContext,
      'fast'
    );

    assert(result.shouldProceed === true, 'Hold decisions should always proceed');
    assert(result.latencyMs === 0, 'Hold decisions should have 0 latency');
    assert(result.qualityScore === 1.0, 'Hold decisions should have 1.0 quality');
  });

  await runTest('Result formatting works', async () => {
    const { formatInlineResult } = await import('./learning/inline-judge.js');

    const proceedResult = formatInlineResult({
      shouldProceed: true,
      qualityScore: 0.85,
      warnings: ['Minor concern'],
      keyInsight: 'Good entry point',
      latencyMs: 1500,
    });
    assert(proceedResult.includes('PROCEED'), 'Should show PROCEED for approved decisions');
    assert(proceedResult.includes('85%'), 'Should show quality percentage');

    const blockedResult = formatInlineResult({
      shouldProceed: false,
      qualityScore: 0.35,
      warnings: ['Critical issue'],
      keyInsight: null,
      latencyMs: 1200,
    });
    assert(blockedResult.includes('BLOCKED'), 'Should show BLOCKED for rejected decisions');
  });

  await runTest('Modification detection works', async () => {
    const { wasModified, applyModifications } = await import('./learning/inline-judge.js');

    const modifiedResult = {
      shouldProceed: true,
      qualityScore: 0.7,
      warnings: [],
      keyInsight: null,
      latencyMs: 1000,
      suggestedModifications: {
        adjustedConfidence: 0.6,
        adjustedAmount: 80,
      },
    };

    assert(wasModified(modifiedResult) === true, 'Should detect modifications');

    const original = { ...mockDecision };
    const modified = applyModifications(original, modifiedResult);

    assert(modified.confidence === 0.6, 'Should apply adjusted confidence');
    assert(modified.amountUsd === 80, 'Should apply adjusted amount');
  });
}

// =============================================================================
// PHASE 2 TESTS: INSIGHT EXTRACTOR
// =============================================================================

async function testInsightExtractor(): Promise<void> {
  console.log('\n💡 Phase 2: Insight Extractor\n');

  await runTest('Insight extractor module loads', async () => {
    const extractor = await import('./learning/insight-extractor.js');
    assert(typeof extractor.extractInsightToMemory === 'function', 'extractInsightToMemory should exist');
    assert(typeof extractor.syncJudgeInsightsToMemory === 'function', 'syncJudgeInsightsToMemory should exist');
    assert(typeof extractor.isDuplicateInsight === 'function', 'isDuplicateInsight should exist');
  });

  await runTest('Insight stats query works', async () => {
    const { getInsightStats } = await import('./learning/insight-extractor.js');
    const stats = await getInsightStats(testDomain);

    assert(typeof stats.promoted === 'number', 'promoted should be a number');
    assert(typeof stats.pending === 'number', 'pending should be a number');
    assert(typeof stats.total === 'number', 'total should be a number');
  });

  await runTest('Promoted insights query works', async () => {
    const { getPromotedInsights } = await import('./learning/insight-extractor.js');
    const insights = await getPromotedInsights(testDomain, 5);

    assert(Array.isArray(insights), 'Should return an array');
    for (const insight of insights) {
      assert(insight.wasPromoted === true, 'All returned insights should be promoted');
    }
  });

  await runTest('Pending insights query works', async () => {
    const { getPendingInsights } = await import('./learning/insight-extractor.js');
    const insights = await getPendingInsights(testDomain, 5);

    assert(Array.isArray(insights), 'Should return an array');
    for (const insight of insights) {
      assert(insight.wasPromoted === false, 'All returned insights should be pending');
    }
  });
}

// =============================================================================
// PHASE 3 TESTS: PROMOTION PIPELINES
// =============================================================================

async function testPromotionPipelines(): Promise<void> {
  console.log('\n📈 Phase 3: Promotion Pipelines\n');

  await runTest('Promotion module loads', async () => {
    const promotion = await import('./learning/promotion.js');
    assert(typeof promotion.promoteInsightsToMemory === 'function', 'promoteInsightsToMemory should exist');
    assert(typeof promotion.promotePatternsToSkills === 'function', 'promotePatternsToSkills should exist');
    assert(typeof promotion.runPromotionPipeline === 'function', 'runPromotionPipeline should exist');
  });

  await runTest('Promotion stats query works', async () => {
    const { getPromotionStats } = await import('./learning/promotion.js');
    const stats = await getPromotionStats();

    assert(typeof stats.totalLinks === 'number', 'totalLinks should be a number');
    assert(typeof stats.judgeToMemory === 'number', 'judgeToMemory should be a number');
    assert(typeof stats.memoryToSkill === 'number', 'memoryToSkill should be a number');
  });

  await runTest('Promotion links query works', async () => {
    const { getPromotionLinks } = await import('./learning/promotion.js');
    const links = await getPromotionLinks('judge', 'test-id');

    assert(Array.isArray(links), 'Should return an array');
  });

  await runTest('Full promotion pipeline runs without error', async () => {
    const { runPromotionPipeline } = await import('./learning/promotion.js');
    const result = await runPromotionPipeline();

    assert(typeof result.insightsToMemory === 'number', 'insightsToMemory should be a number');
    assert(typeof result.patternsToSkills === 'number', 'patternsToSkills should be a number');
    assert(typeof result.linksCreated === 'number', 'linksCreated should be a number');
  });
}

// =============================================================================
// PHASE 4 TESTS: INTEGRATION
// =============================================================================

async function testIntegration(): Promise<void> {
  console.log('\n🔗 Phase 4: Integration\n');

  await runTest('Database schema has required tables', async () => {
    // Check SkillRecommendation table exists
    const skillRecs = await prisma.skillRecommendation.count();
    assert(typeof skillRecs === 'number', 'SkillRecommendation table should exist');

    // Check LearningLink table exists
    const links = await prisma.learningLink.count();
    assert(typeof links === 'number', 'LearningLink table should exist');

    // Check DecisionEvaluation has new fields
    const evaluations = await prisma.decisionEvaluation.findFirst({
      select: {
        promotedToMemory: true,
        promotedToSkill: true,
      },
    });
    // Just checking the query doesn't fail (fields exist)
    assert(true, 'DecisionEvaluation should have promotion fields');
  });

  await runTest('SkillReflection has qualification fields', async () => {
    const reflection = await prisma.skillReflection.findFirst({
      select: {
        provenEffective: true,
        consecutiveFailures: true,
      },
    });
    // Just checking the query doesn't fail (fields exist)
    assert(true, 'SkillReflection should have qualification fields');
  });

  await runTest('End-to-end skill flow works', async () => {
    const testId = `e2e-test-${Date.now()}`;

    // 1. Create a skill recommendation
    await prisma.skillRecommendation.create({
      data: {
        decisionId: testId,
        skillName: 'e2e-test-skill',
        domain: testDomain,
        relevanceScore: 0.9,
        wasPresented: true,
        wasApplied: true,
      },
    });

    // 2. Record outcome
    const { recordSkillOutcome } = await import('./skills/skill-outcome.js');
    const outcomeResult = await recordSkillOutcome(testId, 'profit', 8.5);
    assert(outcomeResult.skillsUpdated > 0, 'Outcome should update the recommendation');

    // 3. Verify outcome was recorded
    const updated = await prisma.skillRecommendation.findFirst({
      where: { decisionId: testId },
    });
    assert(updated?.tradeOutcome === 'profit', 'Trade outcome should be recorded');
    assert(updated?.pnlPercent === 8.5, 'PnL should be recorded');

    // Clean up
    await prisma.skillRecommendation.deleteMany({
      where: { decisionId: testId },
    });
  });
}

// =============================================================================
// MAIN
// =============================================================================

async function main(): Promise<void> {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║        CLAUDEFI LEARNING SYSTEM TEST SUITE                   ║');
  console.log('╚══════════════════════════════════════════════════════════════╝');

  try {
    // Run all test phases
    await testSkillTypes();
    await testInlineJudge();
    await testInsightExtractor();
    await testPromotionPipelines();
    await testIntegration();

    // Print summary
    console.log('\n════════════════════════════════════════════════════════════════');
    console.log('                         SUMMARY                                 ');
    console.log('════════════════════════════════════════════════════════════════\n');

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;
    const totalTime = results.reduce((sum, r) => sum + r.durationMs, 0);

    console.log(`  Total tests:  ${results.length}`);
    console.log(`  Passed:       ${passed} ✅`);
    console.log(`  Failed:       ${failed} ${failed > 0 ? '❌' : ''}`);
    console.log(`  Duration:     ${totalTime}ms\n`);

    if (failed > 0) {
      console.log('  Failed tests:');
      for (const result of results.filter(r => !r.passed)) {
        console.log(`    - ${result.name}: ${result.message}`);
      }
      console.log('');
    }

    const success = failed === 0;
    console.log(success
      ? '  🎉 All learning system tests passed!'
      : '  ⚠️  Some tests failed. Check output above.');
    console.log('');

    process.exit(success ? 0 : 1);
  } catch (error) {
    console.error('Fatal error running tests:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
