/**
 * Ralph Loop - Continuous Autonomous Trading (Agent SDK Version)
 *
 * Named after Ralph Wiggum's simple but persistent approach.
 * Now uses Claude Agent SDK for parallel subagent execution:
 * 1. BUILD CONTEXTS - Fetch live market data for all domains
 * 2. EXECUTE PARALLEL - Run all 4 subagents simultaneously via Agent SDK
 * 3. VALIDATE - Run hooks for guard rails
 * 4. ACT - Execute approved decisions
 * 5. LEARN - Record outcomes and generate skills
 * 6. REPEAT
 */

import 'dotenv/config';
import Anthropic from '@anthropic-ai/sdk';
import {
  getPortfolio,
  getOpenPositions,
  getRecentDecisions,
  getDomainBalance,
  logDecision,
  takePerformanceSnapshot,
  createPosition,
  updateDomainBalance,
} from '../clients/supabase/client.js';

// Supabase doesn't need init/disconnect
const initDatabase = async () => console.log('[DB] Using Supabase');
const disconnectDatabase = async () => {};
import {
  processTradeOutcome,
  explainSkillCreation,
  archiveExpiredSkills,
  type DecisionOutcome,
} from '../skills/reflection-creator.js';
import { analyzeAndCreateGeneralSkills } from '../skills/cross-domain-patterns.js';
import { recordSkillOutcome } from '../skills/skill-outcome.js';
import { executeAllSubagentsParallel } from '../subagents/executor.js';
import { hookRegistry } from '../hooks/index.js';
import {
  getPortfolioDirective,
  fetchMarketSummary,
  type PortfolioDirective,
} from '../subagents/portfolio-coordinator.js';
import {
  positionMonitor,
  perpsLiquidationMonitor,
} from '../services/position-monitor.js';
import type { Domain, AgentDecision, DomainContext } from '../types/index.js';
import { idempotencyService, startIdempotencyCleanup, stopIdempotencyCleanup } from '../services/idempotency.js';
import { TranscriptStore } from '../transcripts/store.js';

// Types
export interface CycleResult {
  domain: Domain;
  decision: AgentDecision | null;
  executed: boolean;
  outcome?: 'success' | 'failed' | 'skipped' | 'blocked';
  error?: string;
}

export interface RalphConfig {
  cycleIntervalMs: number;      // Time between cycles (default: 30 min)
  domains: Domain[];            // Active domains
  paperTrading: boolean;        // Paper or real trading
  maxConsecutiveHolds: number;  // Max holds before forced action
  confidenceThreshold: number;  // Min confidence to execute (0-1)
  parallel: boolean;            // Run domains in parallel (default: true)
}

const DEFAULT_CONFIG: RalphConfig = {
  cycleIntervalMs: 30 * 60 * 1000, // 30 minutes
  domains: ['dlmm', 'perps', 'polymarket', 'spot'],
  paperTrading: true,
  maxConsecutiveHolds: 5,
  confidenceThreshold: 0.6,
  parallel: true,
};

// Track consecutive holds per domain
const consecutiveHolds: Record<Domain, number> = {
  dlmm: 0,
  perps: 0,
  polymarket: 0,
  spot: 0,
};

// Track cycle count for periodic tasks
let cycleCount = 0;

// How often to run cross-domain pattern analysis (every N cycles)
const CROSS_DOMAIN_ANALYSIS_INTERVAL = 10;

// Track pending outcomes for skill generation
const pendingOutcomes = new Map<string, DecisionOutcome>();

/**
 * Update a trade outcome and trigger skill generation if significant
 * Called when a position closes with P&L data
 */
export async function recordTradeOutcome(
  decisionId: string,
  pnl: number,
  pnlPercent: number
): Promise<void> {
  const outcome = pendingOutcomes.get(decisionId);
  if (!outcome) {
    console.log(`⚠️  No pending outcome found for decision ${decisionId}`);
    return;
  }

  const isProfit = pnl >= 0;
  outcome.outcome = isProfit ? 'profit' : 'loss';
  outcome.pnl = pnl;
  outcome.pnlPercent = pnlPercent;

  console.log(`\n📊 Trade closed: ${outcome.domain}/${outcome.target}`);
  console.log(`   P&L: $${pnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`);

  // Record skill outcomes and update effectiveness (Phase 1)
  try {
    const skillResult = await recordSkillOutcome(
      decisionId,
      isProfit ? 'profit' : 'loss',
      pnlPercent
    );
    if (skillResult.skillsUpdated > 0) {
      console.log(`   📊 Updated ${skillResult.skillsUpdated} skill recommendations`);
    }
  } catch (error) {
    console.warn('   ⚠️ Skill outcome recording failed:', error);
  }

  // Generate skill from significant outcome (existing logic)
  const skill = await processTradeOutcome(outcome);

  if (skill) {
    const explanation = explainSkillCreation(skill, outcome);
    console.log(explanation);
  }

  pendingOutcomes.delete(decisionId);
}

/**
 * Build domain context for subagent execution
 */
async function buildDomainContext(domain: Domain): Promise<DomainContext> {
  const balance = await getDomainBalance(domain);
  const positions = await getOpenPositions(domain);
  const recentDecisions = await getRecentDecisions(domain, 10);
  const portfolio = await getPortfolio();

  return {
    domain,
    balance,
    positions,
    markets: [], // Markets are fetched by the subagent via tools
    recentDecisions,
    performanceSnapshots: [],
    timestamp: new Date().toISOString(),
  };
}

/**
 * Execute a decision (paper or real trading)
 * Returns { executed: boolean, idempotencyKey?: string } for tracking
 */
async function executeDecision(
  domain: Domain,
  decision: AgentDecision,
  paperTrading: boolean
): Promise<{ executed: boolean; idempotencyKey?: string }> {
  console.log(`📊 Executing ${domain} decision: ${decision.action}`);
  console.log(`   Target: ${decision.target || 'N/A'}`);
  console.log(`   Amount: $${decision.amountUsd || 0}`);
  console.log(`   Confidence: ${((decision.confidence || 0) * 100).toFixed(0)}%`);
  console.log(`   Reasoning: ${decision.reasoning}`);

  if (decision.action === 'hold') {
    console.log('   Action: HOLD - No trade executed');
    return { executed: true };
  }

  // Check for duplicate execution (idempotency)
  const { isDuplicate, key, previousResult } = await idempotencyService.checkAndReserve(
    domain,
    decision.action,
    decision.target,
    decision.amountUsd
  );

  if (isDuplicate) {
    console.log(`   ⚠️  Duplicate decision detected (key: ${key.slice(0, 30)}...)`);
    console.log(`   Skipping execution - previous result available`);
    return { executed: false, idempotencyKey: key };
  }

  try {
    // For opening positions, deduct from balance
    const openActions = ['add_liquidity', 'open_long', 'open_short', 'buy_yes', 'buy_no', 'buy'];
    if (openActions.includes(decision.action) && decision.amountUsd) {
      const balance = await getDomainBalance(domain);
      await updateDomainBalance(domain, balance - decision.amountUsd);

      // Create position record
      await createPosition(domain, {
        target: decision.target || 'unknown',
        targetName: decision.target,
        entryValueUsd: decision.amountUsd,
        metadata: decision.metadata,
      });
    }

    console.log(`   Mode: ${paperTrading ? 'PAPER' : 'REAL'}`);
    console.log('   ✅ Decision executed');

    // Update idempotency record with success
    await idempotencyService.updateResult(key, { status: 'success', timestamp: new Date().toISOString() });

    return { executed: true, idempotencyKey: key };
  } catch (error) {
    // Remove the idempotency reservation so we can retry
    await idempotencyService.remove(key);
    console.error(`   ❌ Execution failed:`, error);
    return { executed: false };
  }
}

/**
 * Main Ralph Loop with Parallel Subagent Execution
 */
export async function runRalphLoop(
  config: Partial<RalphConfig> = {}
): Promise<void> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  console.log('🚀 Starting Ralph Loop (Agent SDK Mode)');
  console.log(`   Domains: ${cfg.domains.join(', ')} ${cfg.parallel ? '(PARALLEL)' : '(sequential)'}`);
  console.log(`   Mode: ${cfg.paperTrading ? 'PAPER' : 'REAL'}`);
  console.log(`   Cycle interval: ${cfg.cycleIntervalMs / 1000 / 60} minutes`);
  console.log(`   Hooks: ${hookRegistry.getHooks().length} registered`);

  const anthropic = new Anthropic();

  // Start background monitors
  console.log('\n📡 Starting background monitors...');
  positionMonitor.start();
  if (cfg.domains.includes('perps')) {
    perpsLiquidationMonitor.start();
  }

  // Start idempotency cleanup job (runs every hour)
  startIdempotencyCleanup();

  // Continuous loop
  while (true) {
    console.log('\n' + '='.repeat(60));
    console.log(`📍 New cycle started at ${new Date().toISOString()}`);
    console.log('='.repeat(60));

    // 0. SKILL MAINTENANCE - Archive expired skills
    try {
      const expirationResult = await archiveExpiredSkills();
      if (expirationResult.archived > 0) {
        console.log(`   Archived ${expirationResult.archived} expired skills`);
      }
    } catch (error) {
      console.warn('   ⚠️  Skill expiration check failed:', error);
    }

    // 0.1. TRANSCRIPT ROTATION - Compress old transcripts, delete ancient ones
    try {
      const transcriptStore = new TranscriptStore();
      const rotateResult = await transcriptStore.rotate();
      if (rotateResult.gzipped > 0 || rotateResult.deleted > 0) {
        console.log(`   Transcripts: ${rotateResult.gzipped} gzipped, ${rotateResult.deleted} deleted`);
      }
    } catch (error) {
      console.warn('   ⚠️  Transcript rotation failed:', error);
    }

    // 0.2. MEMORY SYNC - Extract validated judge insights to memory (Phase 2)
    try {
      const { syncAllDomainInsights } = await import('../learning/insight-extractor.js');
      const syncResults = await syncAllDomainInsights();
      const totalSynced = Object.values(syncResults).reduce((a, b) => a + b, 0);
      if (totalSynced > 0) {
        console.log(`   Memory sync: ${totalSynced} insights promoted`);
      }
    } catch (error) {
      console.warn('   ⚠️  Memory sync failed:', error);
    }

    // 0.5. PORTFOLIO COORDINATION - Get cross-domain directive
    let portfolioDirective: PortfolioDirective | undefined;
    try {
      const marketSummary = await fetchMarketSummary();
      portfolioDirective = await getPortfolioDirective(marketSummary);
      console.log(`   Risk level: ${portfolioDirective.riskLevel}`);
      console.log(`   Market sentiment: ${portfolioDirective.marketSentiment.overall}`);
      if (portfolioDirective.correlationWarnings.length > 0) {
        console.log(`   ⚠️  Warnings: ${portfolioDirective.correlationWarnings.length}`);
      }
    } catch (error) {
      console.warn('   ⚠️  Portfolio coordination failed:', error);
    }

    // 1. BUILD CONTEXTS - Fetch context for all domains
    console.log('\n📥 Building contexts for all domains...');
    const contexts = new Map<Domain, DomainContext>();

    await Promise.all(cfg.domains.map(async (domain) => {
      try {
        const ctx = await buildDomainContext(domain);
        contexts.set(domain, ctx);
        console.log(`   [${domain}] Balance: $${ctx.balance.toFixed(2)}, Positions: ${ctx.positions.length}`);
      } catch (error) {
        console.error(`   [${domain}] Failed to build context:`, error);
      }
    }));

    // 2. EXECUTE PARALLEL - Run all subagents via Agent SDK
    console.log('\n🤖 Executing subagents...');
    const decisions = await executeAllSubagentsParallel(
      anthropic,
      cfg.domains,
      contexts,
      portfolioDirective
    );

    // 3. VALIDATE & ACT - Process decisions with hooks
    const results: CycleResult[] = [];

    for (const domain of cfg.domains) {
      const decision = decisions.get(domain);

      if (!decision) {
        results.push({ domain, decision: null, executed: false, outcome: 'skipped' });
        continue;
      }

      // Track holds
      if (decision.action === 'hold') {
        consecutiveHolds[domain]++;
        results.push({ domain, decision, executed: false, outcome: 'skipped' });
        continue;
      }

      // Reset hold counter on action
      consecutiveHolds[domain] = 0;

      // Run PreDecision hooks (validation)
      const hookResult = await hookRegistry.run('PreDecision', {
        domain,
        decision,
        timestamp: new Date(),
      });

      if (!hookResult.proceed) {
        console.log(`❌ [${domain}] Blocked by hooks: ${hookResult.reason}`);
        results.push({ domain, decision, executed: false, outcome: 'blocked', error: hookResult.reason });
        continue;
      }

      // Execute the decision
      const execResult = await executeDecision(domain, decision, cfg.paperTrading);

      // Run PostDecision hooks (logging)
      await hookRegistry.run('PostDecision', {
        domain,
        decision,
        timestamp: new Date(),
      });

      // Log to database
      const decisionRecord = await logDecision(domain, {
        action: decision.action,
        target: decision.target,
        amountUsd: decision.amountUsd,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
      });

      // Track for skill generation
      if (decisionRecord?.id && decision.action !== 'hold') {
        pendingOutcomes.set(decisionRecord.id, {
          id: decisionRecord.id,
          domain,
          action: decision.action,
          target: decision.target,
          amountUsd: decision.amountUsd,
          reasoning: decision.reasoning,
          confidence: decision.confidence,
          outcome: 'pending',
          timestamp: new Date(),
        });
      }

      results.push({
        domain,
        decision,
        executed: execResult.executed,
        outcome: execResult.executed ? 'success' : 'failed',
      });
    }

    // Log results summary
    console.log('\n📋 Cycle Summary:');
    for (const result of results) {
      const emoji = result.outcome === 'success' ? '✅' :
                    result.outcome === 'blocked' ? '🚫' :
                    result.outcome === 'skipped' ? '⏸️' : '❌';
      console.log(`   ${emoji} ${result.domain.toUpperCase()}: ${result.outcome} ${result.decision?.action || ''}`);
    }

    // 4. LEARN - Take performance snapshots (domain + total)
    console.log('\n📈 Taking performance snapshots...');
    try {
      const { takeAllPerformanceSnapshots } = await import('../clients/supabase/client.js');
      await takeAllPerformanceSnapshots();
      console.log('   ✅ Snapshots taken for all domains + total portfolio');
    } catch (err) {
      console.error('   ❌ Failed to take snapshots:', err);
    }

    // 4.5. CROSS-DOMAIN ANALYSIS - Periodically analyze patterns across domains
    cycleCount++;
    if (cycleCount % CROSS_DOMAIN_ANALYSIS_INTERVAL === 0) {
      console.log('\n🔗 Running cross-domain pattern analysis...');
      try {
        const result = await analyzeAndCreateGeneralSkills();
        if (result.skillsCreated > 0) {
          console.log(`   Created ${result.skillsCreated} new general skills`);
        }
      } catch (error) {
        console.warn('   ⚠️ Cross-domain analysis failed:', error);
      }
    }

    // 4.6. LEARNING PROMOTION - Run promotion pipelines every 5 cycles (Phase 3)
    if (cycleCount % 5 === 0) {
      try {
        const { runPromotionPipeline } = await import('../learning/promotion.js');
        const result = await runPromotionPipeline();
        if (result.insightsToMemory > 0 || result.patternsToSkills > 0) {
          console.log(`   Promoted: ${result.insightsToMemory} to memory, ${result.patternsToSkills} to skills`);
        }
      } catch (error) {
        console.warn('   ⚠️ Promotion pipeline failed:', error);
      }
    }

    // 5. REPEAT
    console.log(`\n⏰ Next cycle in ${cfg.cycleIntervalMs / 1000 / 60} minutes...`);
    await sleep(cfg.cycleIntervalMs);
  }
}

/**
 * Sleep utility
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Run a single cycle (for testing)
 */
export async function runSingleCycle(
  domains: Domain[] = ['dlmm'],
  config: Partial<RalphConfig> = {}
): Promise<CycleResult[]> {
  const cfg = { ...DEFAULT_CONFIG, ...config, domains };
  const anthropic = new Anthropic();

  // Build contexts
  const contexts = new Map<Domain, DomainContext>();
  await Promise.all(domains.map(async (domain) => {
    const ctx = await buildDomainContext(domain);
    contexts.set(domain, ctx);
  }));

  // Execute subagents
  const decisions = await executeAllSubagentsParallel(anthropic, domains, contexts);

  // Process decisions
  const results: CycleResult[] = [];
  for (const domain of domains) {
    const decision = decisions.get(domain);
    results.push({
      domain,
      decision: decision || null,
      executed: !!decision && decision.action !== 'hold',
      outcome: decision ? (decision.action === 'hold' ? 'skipped' : 'success') : 'failed',
    });
  }

  return results;
}

// Export for use in main entry point
export { DEFAULT_CONFIG };

// =============================================================================
// MAIN ENTRY POINT
// =============================================================================

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.log(`
claudefi - Autonomous DeFi Trading Agent (Agent SDK Mode)

Usage:
  npm run claudefi              Run all domains (parallel)
  npm run claudefi:dlmm         Run DLMM only
  npm run claudefi:perps        Run Perps only
  npm run claudefi:polymarket   Run Polymarket only
  npm run claudefi:spot         Run Spot only

Environment:
  ANTHROPIC_API_KEY    Required - Claude API key
  DATABASE_URL         Optional - SQLite path (default: file:./claudefi.db)
  PAPER_TRADING        Optional - true/false (default: true)
  ACTIVE_DOMAINS       Optional - comma-separated domains
  CYCLE_INTERVAL_MS    Optional - milliseconds between cycles (default: 1800000)
  CONFIDENCE_THRESHOLD Optional - minimum confidence for execution (default: 0.6)

Features:
  - Parallel subagent execution using Agent SDK
  - Hook system for validation and guard rails
  - Session persistence for agent memory
  - Skill generation from trade outcomes
`);
    return;
  }

  // Initialize database
  console.log('[DB] Initializing database...');
  await initDatabase();

  // Get domains from env or default
  const envDomains = process.env.ACTIVE_DOMAINS?.split(',').map(d => d.trim()) as Domain[] | undefined;
  const singleDomain = process.env.DOMAIN as Domain | undefined;

  const domains: Domain[] = singleDomain
    ? [singleDomain]
    : envDomains || ['dlmm', 'perps', 'polymarket', 'spot'];

  // Configuration
  const config: Partial<RalphConfig> = {
    domains,
    paperTrading: process.env.PAPER_TRADING !== 'false',
    cycleIntervalMs: parseInt(process.env.CYCLE_INTERVAL_MS || '1800000'),
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.6'),
    parallel: true,
  };

  // Handle graceful shutdown
  const shutdown = async () => {
    console.log('\n\n🛑 Shutting down...');
    positionMonitor.stop();
    perpsLiquidationMonitor.stop();
    stopIdempotencyCleanup();
    await disconnectDatabase();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  try {
    await runRalphLoop(config);
  } catch (error) {
    console.error('❌ Fatal error:', error);
    await disconnectDatabase();
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);
