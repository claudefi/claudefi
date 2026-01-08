import type { Domain, Position, DecisionHistory, Portfolio } from '../types/index.js';
import type { AgentWallets, PendingPosition, CommunitySkillRecord } from '../types/internal.js';
import * as prismaDb from '../db/index.js';

type ProviderName = 'prisma' | 'supabase';

const configuredProvider = (process.env.DATA_PROVIDER || '').toLowerCase();
const hasSupabaseEnv = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);

// Respect explicit DATA_PROVIDER setting, fall back to Supabase if credentials exist
const provider: ProviderName =
  configuredProvider === 'prisma'
    ? 'prisma'
    : configuredProvider === 'supabase' || hasSupabaseEnv
    ? 'supabase'
    : 'prisma';

// Log provider selection for clarity
if (configuredProvider === 'prisma') {
  console.log('[DataProvider] Using local Prisma/SQLite (explicit DATA_PROVIDER=prisma)');
} else if (configuredProvider === 'supabase') {
  console.log('[DataProvider] Using Supabase (explicit DATA_PROVIDER=supabase)');
} else if (provider === 'supabase') {
  console.log('[DataProvider] Using Supabase (auto-detected from credentials)');
} else {
  console.log('[DataProvider] Using local Prisma/SQLite (default)');
}

type SupabaseModule = typeof import('../clients/supabase/client.js');

let supabaseModule: SupabaseModule | null = null;

async function loadSupabaseModule(): Promise<SupabaseModule> {
  if (!supabaseModule) {
    supabaseModule = await import('../clients/supabase/client.js');
  }
  return supabaseModule;
}

function usingSupabase(): boolean {
  return provider === 'supabase';
}

export const dataProviderName: ProviderName = provider;

export async function initDataLayer(): Promise<void> {
  if (usingSupabase()) {
    console.log('[DB] Using Supabase backend');
    return;
  }
  await prismaDb.initDatabase();
}

export async function shutdownDataLayer(): Promise<void> {
  if (usingSupabase()) {
    return;
  }
  await prismaDb.disconnectDatabase();
}

export async function getPortfolio(): Promise<Portfolio> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.getPortfolio();
  }
  return prismaDb.getPortfolio();
}

export async function getOpenPositions(domain: Domain): Promise<Position[]> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.getOpenPositions(domain);
  }
  return prismaDb.getOpenPositions(domain);
}

export async function getRecentDecisions(domain: Domain, limit = 5): Promise<DecisionHistory[]> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.getRecentDecisions(domain, limit);
  }
  return prismaDb.getRecentDecisions(domain, limit);
}

export async function getDomainBalance(domain: Domain): Promise<number> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.getDomainBalance(domain);
  }
  return prismaDb.getDomainBalance(domain);
}

export async function updateDomainBalance(domain: Domain, balance: number): Promise<void> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    await mod.updateDomainBalance(domain, balance);
    return;
  }
  await prismaDb.updateDomainBalance(domain, balance);
}

export async function createPosition(
  domain: Domain,
  position: {
    target: string;
    targetName?: string;
    entryValueUsd: number;
    side?: string;
    size?: number;
    entryPrice?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<string> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.createPosition(domain, position);
  }
  return prismaDb.createPosition(domain, position);
}

export async function closePosition(
  domain: Domain,
  positionId: string,
  closingData: {
    currentValueUsd?: number;
    realizedPnl?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    await mod.closePosition(domain, positionId, closingData);
    return;
  }
  await prismaDb.closePosition(domain, positionId, closingData);
}

export async function updatePositionValue(
  positionId: string,
  currentValueUsd: number,
  currentPrice?: number
): Promise<void> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    await mod.updatePosition(positionId, {
      currentValueUsd,
      currentPrice,
    });
    return;
  }
  await prismaDb.updatePositionValue(positionId, currentValueUsd, currentPrice);
}

export async function logDecision(
  domain: Domain,
  decision: {
    action: string;
    target?: string;
    amountUsd?: number;
    reasoning: string;
    confidence: number;
    skillsApplied?: string[];
    marketConditions?: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }
): Promise<{ id: string } | null> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.logDecision(domain, decision);
  }
  return prismaDb.logDecision(domain, decision);
}

export async function takeAllPerformanceSnapshots(): Promise<void> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    await mod.takeAllPerformanceSnapshots();
    return;
  }
  await prismaDb.takeAllPerformanceSnapshots();
}

export async function updateDecisionOutcome(
  decisionId: string,
  outcome: 'profit' | 'loss' | 'pending',
  realizedPnl?: number,
  pnlPercent?: number
): Promise<void> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    await mod.updateDecisionOutcome(decisionId, {
      outcome,
      realizedPnl,
      pnlPercent,
    });
    return;
  }
  await prismaDb.updateDecisionOutcome(
    decisionId,
    outcome,
    realizedPnl,
    pnlPercent
  );
}

export async function getAgentWallets(agentId?: string): Promise<AgentWallets | null> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.getAgentWallets(agentId);
  }
  return prismaDb.getAgentWallets(agentId);
}

export async function registerAgentWallet(
  agentId: string,
  walletType: 'solana' | 'hyperliquid' | 'polygon',
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.registerAgentWallet(agentId, walletType, walletAddress);
  }
  return prismaDb.registerAgentWallet(agentId, walletType, walletAddress);
}

export async function markAgentAsVerifiedTrader(agentId: string): Promise<{ success: boolean; error?: string }> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.markAgentAsVerifiedTrader(agentId);
  }
  return prismaDb.markAgentAsVerifiedTrader(agentId);
}

export async function getPendingPositionsForVerification(): Promise<PendingPosition[]> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.getPendingPositionsForVerification();
  }
  return prismaDb.getPendingPositionsForVerification();
}

export async function markPositionVerified(domain: Domain, positionId: string): Promise<void> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    await mod.markPositionVerified(domain, positionId);
    return;
  }
  await prismaDb.markPositionVerified(domain, positionId);
}

export async function fetchCommunitySkills(options?: {
  domain?: string;
  limit?: number;
  sortBy?: 'downloads' | 'rating' | 'updated_at';
}): Promise<CommunitySkillRecord[]> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.fetchCommunitySkills(options);
  }
  return prismaDb.fetchCommunitySkills(options);
}

export async function searchCommunitySkillRegistry(query: string): Promise<CommunitySkillRecord[]> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.searchCommunitySkills(query);
  }
  return prismaDb.searchCommunitySkills(query);
}

export async function getCommunitySkillRecord(name: string): Promise<CommunitySkillRecord | null> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.getCommunitySkillRecord(name);
  }
  return prismaDb.getCommunitySkillRecord(name);
}

export async function incrementCommunitySkillDownloads(skillName: string): Promise<void> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    await mod.incrementCommunitySkillDownloads(skillName);
    return;
  }
  await prismaDb.incrementCommunitySkillDownloads(skillName);
}

export async function registerCommunitySkillRecord(skill: {
  name: string;
  description: string;
  author: string;
  githubUrl: string;
  domain?: string;
}): Promise<CommunitySkillRecord | null> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.registerCommunitySkill(skill);
  }
  return prismaDb.registerCommunitySkillRecord(skill);
}

export async function trackSkillInstallation(skillName: string): Promise<void> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    await mod.trackSkillInstallation(skillName);
    return;
  }
  await prismaDb.trackSkillInstallation(skillName);
}

export async function untrackSkillInstallation(skillName: string): Promise<void> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    await mod.untrackSkillInstallation(skillName);
    return;
  }
  await prismaDb.untrackSkillInstallation(skillName);
}

export async function listInstalledCommunitySkills(): Promise<string[]> {
  if (usingSupabase()) {
    const mod = await loadSupabaseModule();
    return mod.listInstalledCommunitySkills();
  }
  return prismaDb.listInstalledCommunitySkills();
}
