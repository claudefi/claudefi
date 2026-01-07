/**
 * Unified Data Layer for Claudefi
 *
 * Replaces Supabase with Prisma (local-first) + optional Redis cache.
 * Maintains the same interface as the original Supabase client.
 */

import { prisma, initDatabase, disconnectDatabase } from './prisma.js';
import { getCache, CacheKeys, CacheTTL } from './cache.js';
import type {
  Domain,
  Position,
  PerformanceSnapshot,
  DecisionHistory,
  Portfolio,
} from '../types/index.js';

// Re-export database lifecycle functions
export { initDatabase, disconnectDatabase };

// =============================================================================
// BALANCE OPERATIONS
// =============================================================================

/**
 * Get balance for a specific domain
 */
export async function getDomainBalance(domain: Domain): Promise<number> {
  const config = await prisma.agentConfig.findFirst();
  if (!config) return 2500; // Default starting balance

  const balanceMap: Record<Domain, number> = {
    dlmm: config.dlmmBalance,
    perps: config.perpsBalance,
    polymarket: config.polymarketBalance,
    spot: config.spotBalance,
  };

  return balanceMap[domain];
}

/**
 * Update balance for a specific domain
 */
export async function updateDomainBalance(domain: Domain, newBalance: number): Promise<void> {
  const balanceField: Record<Domain, string> = {
    dlmm: 'dlmmBalance',
    perps: 'perpsBalance',
    polymarket: 'polymarketBalance',
    spot: 'spotBalance',
  };

  const config = await prisma.agentConfig.findFirst();
  if (!config) {
    throw new Error('Agent config not found. Run initDatabase() first.');
  }

  await prisma.agentConfig.update({
    where: { id: config.id },
    data: { [balanceField[domain]]: newBalance },
  });

  // Invalidate portfolio cache
  const cache = await getCache();
  await cache.del(CacheKeys.portfolioSummary);
}

/**
 * Get all domain balances
 */
export async function getAllBalances(): Promise<Record<Domain, number>> {
  const config = await prisma.agentConfig.findFirst();
  if (!config) {
    return { dlmm: 2500, perps: 2500, polymarket: 2500, spot: 2500 };
  }

  return {
    dlmm: config.dlmmBalance,
    perps: config.perpsBalance,
    polymarket: config.polymarketBalance,
    spot: config.spotBalance,
  };
}

// =============================================================================
// POSITION OPERATIONS
// =============================================================================

/**
 * Get open positions for a domain
 */
export async function getOpenPositions(domain: Domain): Promise<Position[]> {
  const positions = await prisma.position.findMany({
    where: {
      domain,
      status: 'open',
    },
    orderBy: { openedAt: 'desc' },
  });

  return positions.map(p => ({
    id: p.id,
    domain: p.domain as Domain,
    target: p.target,
    entryValueUsd: p.entryValueUsd,
    currentValueUsd: p.currentValueUsd,
    status: p.status as 'open' | 'closed',
    openedAt: p.openedAt.toISOString(),
    closedAt: p.closedAt?.toISOString(),
    metadata: JSON.parse(p.metadata),
  }));
}

/**
 * Create a new position
 */
export async function createPosition(
  domain: Domain,
  positionData: {
    target: string;
    targetName?: string;
    entryValueUsd: number;
    side?: string;
    size?: number;
    entryPrice?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  const position = await prisma.position.create({
    data: {
      domain,
      target: positionData.target,
      targetName: positionData.targetName,
      entryValueUsd: positionData.entryValueUsd,
      currentValueUsd: positionData.entryValueUsd,
      side: positionData.side,
      size: positionData.size,
      entryPrice: positionData.entryPrice,
      currentPrice: positionData.entryPrice,
      metadata: JSON.stringify(positionData.metadata || {}),
    },
  });

  // Invalidate portfolio cache
  const cache = await getCache();
  await cache.del(CacheKeys.portfolioSummary);

  return position.id;
}

/**
 * Update a position's current value
 */
export async function updatePositionValue(
  positionId: string,
  currentValueUsd: number,
  currentPrice?: number
): Promise<void> {
  await prisma.position.update({
    where: { id: positionId },
    data: {
      currentValueUsd,
      currentPrice,
    },
  });
}

/**
 * Close a position
 */
export async function closePosition(
  domain: Domain,
  positionId: string,
  closingData: {
    currentValueUsd?: number;
    realizedPnl?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const position = await prisma.position.findUnique({
    where: { id: positionId },
  });

  if (!position) {
    throw new Error(`Position not found: ${positionId}`);
  }

  const existingMetadata = JSON.parse(position.metadata);
  const mergedMetadata = { ...existingMetadata, ...closingData.metadata };

  await prisma.position.update({
    where: { id: positionId },
    data: {
      status: 'closed',
      closedAt: new Date(),
      currentValueUsd: closingData.currentValueUsd ?? position.currentValueUsd,
      realizedPnl: closingData.realizedPnl,
      metadata: JSON.stringify(mergedMetadata),
    },
  });

  // Invalidate portfolio cache
  const cache = await getCache();
  await cache.del(CacheKeys.portfolioSummary);
}

// =============================================================================
// DECISION LOGGING
// =============================================================================

/**
 * Log an agent decision
 */
export async function logDecision(
  domain: Domain,
  decision: {
    action: string;
    target?: string;
    amountUsd?: number;
    reasoning: string;
    confidence: number;
    metadata?: Record<string, unknown>;
  }
): Promise<{ id: string } | null> {
  try {
    const record = await prisma.decision.create({
      data: {
        domain,
        action: decision.action,
        target: decision.target,
        amountUsd: decision.amountUsd,
        reasoning: decision.reasoning,
        confidence: decision.confidence,
        marketConditions: JSON.stringify(decision.metadata || {}),
      },
    });

    return { id: record.id };
  } catch (error) {
    console.error('Failed to log decision:', error);
    return null;
  }
}

/**
 * Update a decision with its outcome
 */
export async function updateDecisionOutcome(
  decisionId: string,
  outcome: 'profit' | 'loss' | 'pending',
  realizedPnl?: number,
  pnlPercent?: number
): Promise<void> {
  await prisma.decision.update({
    where: { id: decisionId },
    data: {
      outcome,
      realizedPnl,
      pnlPercent,
    },
  });
}

/**
 * Get recent decisions for a domain
 */
export async function getRecentDecisions(domain: Domain, limit = 5): Promise<DecisionHistory[]> {
  const decisions = await prisma.decision.findMany({
    where: { domain },
    orderBy: { decisionTimestamp: 'desc' },
    take: limit,
  });

  return decisions.map(d => ({
    action: d.action,
    target: d.target ?? undefined,
    amountUsd: d.amountUsd ?? undefined,
    reasoning: d.reasoning,
    confidence: d.confidence,
    outcome: d.outcome === 'profit' ? 'profitable' : d.outcome === 'loss' ? 'loss' : 'pending',
    realizedPnl: d.realizedPnl ?? undefined,
    timestamp: d.decisionTimestamp.toISOString(),
  }));
}

/**
 * Get all decisions (for learning/reflection)
 */
export async function getAllDecisions(options?: {
  domain?: Domain;
  outcome?: 'profit' | 'loss' | 'pending';
  limit?: number;
}): Promise<DecisionHistory[]> {
  const decisions = await prisma.decision.findMany({
    where: {
      domain: options?.domain,
      outcome: options?.outcome,
    },
    orderBy: { decisionTimestamp: 'desc' },
    take: options?.limit || 100,
  });

  return decisions.map(d => ({
    action: d.action,
    target: d.target ?? undefined,
    amountUsd: d.amountUsd ?? undefined,
    reasoning: d.reasoning,
    confidence: d.confidence,
    outcome: d.outcome === 'profit' ? 'profitable' : d.outcome === 'loss' ? 'loss' : 'pending',
    realizedPnl: d.realizedPnl ?? undefined,
    timestamp: d.decisionTimestamp.toISOString(),
  }));
}

// =============================================================================
// PERFORMANCE SNAPSHOTS
// =============================================================================

/**
 * Take a performance snapshot
 */
export async function takePerformanceSnapshot(
  domain: Domain,
  totalValueUsd: number,
  numPositions: number,
  dailyPnl?: number
): Promise<void> {
  await prisma.performanceSnapshot.create({
    data: {
      domain,
      totalValueUsd,
      numPositions,
      dailyPnl,
    },
  });
}

/**
 * Get recent performance snapshots
 */
export async function getPerformanceSnapshots(
  domain: Domain,
  limit = 50
): Promise<PerformanceSnapshot[]> {
  const snapshots = await prisma.performanceSnapshot.findMany({
    where: { domain },
    orderBy: { timestamp: 'desc' },
    take: limit,
  });

  return snapshots.map(s => ({
    domain: s.domain as Domain,
    timestamp: s.timestamp.toISOString(),
    totalValueUsd: s.totalValueUsd,
    numPositions: s.numPositions,
    feesEarned: s.dailyPnl ?? undefined,
  }));
}

// =============================================================================
// PORTFOLIO
// =============================================================================

/**
 * Get full portfolio summary
 */
export async function getPortfolio(): Promise<Portfolio> {
  // Check cache first
  const cache = await getCache();
  const cached = await cache.get<Portfolio>(CacheKeys.portfolioSummary);
  if (cached) return cached;

  const balances = await getAllBalances();
  const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];

  const positionsByDomain = await Promise.all(
    domains.map(async domain => ({
      domain,
      positions: await getOpenPositions(domain),
    }))
  );

  const allPositions = positionsByDomain.flatMap(p => p.positions);

  const domainSummary = Object.fromEntries(
    domains.map(domain => {
      const domainPositions = positionsByDomain.find(p => p.domain === domain)?.positions || [];
      const positionsValue = domainPositions.reduce((sum, p) => sum + p.currentValueUsd, 0);
      return [
        domain,
        {
          balance: balances[domain],
          positionsValue,
          totalValue: balances[domain] + positionsValue,
          numPositions: domainPositions.length,
        },
      ];
    })
  ) as Portfolio['domains'];

  const totalValueUsd = Object.values(domainSummary).reduce((sum, d) => sum + d.totalValue, 0);

  const portfolio: Portfolio = {
    totalValueUsd,
    domains: domainSummary,
    positions: allPositions,
    lastUpdated: new Date().toISOString(),
  };

  // Cache for 1 minute
  await cache.set(CacheKeys.portfolioSummary, portfolio, CacheTTL.PORTFOLIO_SUMMARY);

  return portfolio;
}

// =============================================================================
// SKILL REFLECTIONS
// =============================================================================

/**
 * Create a skill reflection entry
 */
export async function createSkillReflection(data: {
  skillName: string;
  skillPath: string;
  domain: Domain;
  sourceType: 'warning' | 'pattern' | 'strategy';
  triggerDecisionId?: string;
  triggerPnl?: number;
  triggerPnlPct?: number;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const reflection = await prisma.skillReflection.upsert({
    where: {
      skillName_domain: {
        skillName: data.skillName,
        domain: data.domain,
      },
    },
    create: {
      skillName: data.skillName,
      skillPath: data.skillPath,
      domain: data.domain,
      sourceType: data.sourceType,
      triggerDecisionId: data.triggerDecisionId,
      triggerPnl: data.triggerPnl,
      triggerPnlPct: data.triggerPnlPct,
      metadata: JSON.stringify(data.metadata || {}),
    },
    update: {
      // Don't overwrite existing data, just update timestamp
      updatedAt: new Date(),
    },
  });

  return reflection.id;
}

/**
 * Record that a skill was applied
 */
export async function recordSkillApplication(
  skillName: string,
  domain: Domain,
  wasSuccessful: boolean
): Promise<void> {
  const reflection = await prisma.skillReflection.findUnique({
    where: {
      skillName_domain: { skillName, domain },
    },
  });

  if (!reflection) {
    console.warn(`Skill reflection not found: ${skillName} (${domain})`);
    return;
  }

  const timesApplied = reflection.timesApplied + 1;
  const successCount = wasSuccessful ? reflection.successCount + 1 : reflection.successCount;
  const failureCount = wasSuccessful ? reflection.failureCount : reflection.failureCount + 1;
  const effectivenessScore = timesApplied > 0 ? successCount / timesApplied : null;

  await prisma.skillReflection.update({
    where: { id: reflection.id },
    data: {
      timesApplied,
      successCount,
      failureCount,
      effectivenessScore,
      lastApplied: new Date(),
    },
  });
}

/**
 * Get skill reflection stats
 */
export async function getSkillReflections(options?: {
  domain?: Domain;
  sourceType?: 'warning' | 'pattern' | 'strategy';
  minEffectiveness?: number;
}): Promise<Array<{
  skillName: string;
  domain: string;
  sourceType: string;
  effectivenessScore: number | null;
  timesApplied: number;
  successRate: number | null;
  createdAt: string;
}>> {
  const reflections = await prisma.skillReflection.findMany({
    where: {
      domain: options?.domain,
      sourceType: options?.sourceType,
      effectivenessScore: options?.minEffectiveness
        ? { gte: options.minEffectiveness }
        : undefined,
    },
    orderBy: [
      { effectivenessScore: 'desc' },
      { timesApplied: 'desc' },
    ],
  });

  return reflections.map(r => ({
    skillName: r.skillName,
    domain: r.domain,
    sourceType: r.sourceType,
    effectivenessScore: r.effectivenessScore,
    timesApplied: r.timesApplied,
    successRate: r.timesApplied > 0 ? r.successCount / r.timesApplied : null,
    createdAt: r.createdAt.toISOString(),
  }));
}

// =============================================================================
// TELEGRAM SUBSCRIBERS
// =============================================================================

/**
 * Add a Telegram subscriber
 */
export async function addTelegramSubscriber(
  chatId: string,
  username?: string
): Promise<void> {
  await prisma.telegramSubscriber.upsert({
    where: { chatId },
    create: { chatId, username },
    update: { isActive: true, username },
  });
}

/**
 * Get active Telegram subscribers
 */
export async function getActiveTelegramSubscribers(): Promise<Array<{
  chatId: string;
  username: string | null;
  alertTypes: string[];
}>> {
  const subscribers = await prisma.telegramSubscriber.findMany({
    where: { isActive: true },
  });

  return subscribers.map(s => ({
    chatId: s.chatId,
    username: s.username,
    alertTypes: s.alertTypes.split(','),
  }));
}

/**
 * Unsubscribe a Telegram user
 */
export async function removeTelegramSubscriber(chatId: string): Promise<void> {
  await prisma.telegramSubscriber.update({
    where: { chatId },
    data: { isActive: false },
  });
}

// =============================================================================
// TRADES (Historical Log)
// =============================================================================

/**
 * Log a trade execution
 */
export async function logTrade(data: {
  domain: Domain;
  positionId?: string;
  decisionId?: string;
  action: string;
  target: string;
  targetName?: string;
  side?: string;
  size: number;
  priceUsd: number;
  valueUsd: number;
  fee?: number;
  txHash?: string;
  metadata?: Record<string, unknown>;
}): Promise<string> {
  const trade = await prisma.trade.create({
    data: {
      domain: data.domain,
      positionId: data.positionId,
      decisionId: data.decisionId,
      action: data.action,
      target: data.target,
      targetName: data.targetName,
      side: data.side,
      size: data.size,
      priceUsd: data.priceUsd,
      valueUsd: data.valueUsd,
      fee: data.fee,
      txHash: data.txHash,
      metadata: JSON.stringify(data.metadata || {}),
    },
  });

  return trade.id;
}

/**
 * Get recent trades
 */
export async function getRecentTrades(
  domain?: Domain,
  limit = 20
): Promise<Array<{
  id: string;
  domain: string;
  action: string;
  target: string;
  targetName: string | null;
  side: string | null;
  size: number;
  priceUsd: number;
  valueUsd: number;
  executedAt: string;
}>> {
  const trades = await prisma.trade.findMany({
    where: domain ? { domain } : undefined,
    orderBy: { executedAt: 'desc' },
    take: limit,
  });

  return trades.map(t => ({
    id: t.id,
    domain: t.domain,
    action: t.action,
    target: t.target,
    targetName: t.targetName,
    side: t.side,
    size: t.size,
    priceUsd: t.priceUsd,
    valueUsd: t.valueUsd,
    executedAt: t.executedAt.toISOString(),
  }));
}

// =============================================================================
// MARKET DATA (Live API - No Caching)
// =============================================================================

/**
 * These functions return empty arrays as market data is fetched live from APIs.
 * Kept for API compatibility with the original Supabase client.
 */

export async function getCachedPools(_limit = 100): Promise<unknown[]> {
  console.log('[DB] Market data is fetched live - getCachedPools returns []');
  return [];
}

export async function getCachedPerpMarkets(_limit = 80): Promise<unknown[]> {
  console.log('[DB] Market data is fetched live - getCachedPerpMarkets returns []');
  return [];
}

export async function getCachedPolymarkets(_limit = 80): Promise<unknown[]> {
  console.log('[DB] Market data is fetched live - getCachedPolymarkets returns []');
  return [];
}

export async function getCachedSpotTokens(_limit = 60): Promise<unknown[]> {
  console.log('[DB] Market data is fetched live - getCachedSpotTokens returns []');
  return [];
}

// =============================================================================
// AGENT CONFIG
// =============================================================================

/**
 * Get agent configuration
 */
export async function getAgentConfig(): Promise<{
  name: string;
  paperTrading: boolean;
  activeDomains: Domain[];
}> {
  const config = await prisma.agentConfig.findFirst();
  if (!config) {
    return {
      name: 'claudefi',
      paperTrading: true,
      activeDomains: ['dlmm', 'perps', 'polymarket', 'spot'],
    };
  }

  return {
    name: config.name,
    paperTrading: config.paperTrading,
    activeDomains: config.activeDomains.split(',') as Domain[],
  };
}

/**
 * Update agent configuration
 */
export async function updateAgentConfig(updates: {
  paperTrading?: boolean;
  activeDomains?: Domain[];
}): Promise<void> {
  const config = await prisma.agentConfig.findFirst();
  if (!config) {
    throw new Error('Agent config not found. Run initDatabase() first.');
  }

  await prisma.agentConfig.update({
    where: { id: config.id },
    data: {
      paperTrading: updates.paperTrading,
      activeDomains: updates.activeDomains?.join(','),
    },
  });
}
