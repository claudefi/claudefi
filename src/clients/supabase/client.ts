/**
 * Supabase Client
 * Uses Prisma-aligned schema with unified tables
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  Domain,
  Position,
  PerformanceSnapshot,
  DecisionHistory,
  Portfolio,
} from '../../types/index.js';
import type { AgentWallets, PendingPosition, CommunitySkillRecord } from '../../types/internal.js';

let supabaseInstance: SupabaseClient | null = null;

// ClaudeFi agent UUID
const CLAUDEFI_AGENT_ID = '30fbb2c4-0b41-4259-9e50-3a5f7e68e309';

/**
 * Get or create Supabase client instance
 */
export function getSupabase(): SupabaseClient {
  if (!supabaseInstance) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required');
    }

    supabaseInstance = createClient(url, key);
  }
  return supabaseInstance;
}

export async function getAgentWallets(agentId?: string): Promise<AgentWallets | null> {
  const supabase = getSupabase();

  let query = supabase
    .from('agent_config')
    .select('solana_wallet_pubkey, hyperliquid_wallet, polygon_wallet')
    .limit(1);

  if (agentId) {
    query = query.eq('id', agentId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    return null;
  }

  return {
    solana_wallet_pubkey: data.solana_wallet_pubkey || undefined,
    hyperliquid_wallet: data.hyperliquid_wallet || undefined,
    polygon_wallet: data.polygon_wallet || undefined,
  };
}

export async function registerAgentWallet(
  agentId: string,
  walletType: 'solana' | 'hyperliquid' | 'polygon',
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();

  const columnMap = {
    solana: 'solana_wallet_pubkey',
    hyperliquid: 'hyperliquid_wallet',
    polygon: 'polygon_wallet',
  };

  const { error } = await supabase
    .from('agent_config')
    .update({
      [columnMap[walletType]]: walletAddress,
      wallet_verified_at: new Date().toISOString(),
    })
    .eq('id', agentId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

export async function markAgentAsVerifiedTrader(agentId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('agent_config')
    .update({
      verified_trader: true,
      wallet_verified_at: new Date().toISOString(),
    })
    .eq('id', agentId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// =============================================================================
// BALANCE OPERATIONS
// =============================================================================

/**
 * Get balance for a specific domain
 */
export async function getDomainBalance(domain: Domain): Promise<number> {
  const supabase = getSupabase();
  const balanceColumn = `${domain}_balance`;

  const { data, error } = await supabase
    .from('agent_config')
    .select(balanceColumn)
    .eq('id', CLAUDEFI_AGENT_ID)
    .single();

  if (error) {
    console.error(`Error fetching ${domain} balance:`, error);
    return 0;
  }

  const record = data as unknown as Record<string, string | number | null> | null;
  return parseFloat(String(record?.[balanceColumn] ?? '0'));
}

/**
 * Update balance for a specific domain
 */
export async function updateDomainBalance(domain: Domain, newBalance: number): Promise<void> {
  const supabase = getSupabase();
  const balanceColumn = `${domain}_balance`;

  const { error } = await supabase
    .from('agent_config')
    .update({ [balanceColumn]: newBalance, updated_at: new Date().toISOString() })
    .eq('id', CLAUDEFI_AGENT_ID);

  if (error) {
    throw new Error(`Failed to update ${domain} balance: ${error.message}`);
  }
}

/**
 * Get all domain balances
 */
export async function getAllBalances(): Promise<Record<Domain, number>> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('agent_config')
    .select('dlmm_balance, perps_balance, polymarket_balance, spot_balance')
    .eq('id', CLAUDEFI_AGENT_ID)
    .single();

  if (error || !data) {
    console.error('Error fetching balances:', error);
    return { dlmm: 0, perps: 0, polymarket: 0, spot: 0 };
  }

  return {
    dlmm: parseFloat(data.dlmm_balance || '0'),
    perps: parseFloat(data.perps_balance || '0'),
    polymarket: parseFloat(data.polymarket_balance || '0'),
    spot: parseFloat(data.spot_balance || '0'),
  };
}

// =============================================================================
// POSITION OPERATIONS (Unified positions table)
// =============================================================================

/**
 * Get open positions for a domain
 */
export async function getOpenPositions(domain: Domain): Promise<Position[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('domain', domain)
    .eq('status', 'open');

  if (error) {
    console.error(`Error fetching ${domain} positions:`, error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    domain: row.domain as Domain,
    target: row.target,
    targetName: row.target_name,
    entryValueUsd: parseFloat(row.entry_value_usd || '0'),
    currentValueUsd: parseFloat(row.current_value_usd || '0'),
    status: row.status,
    side: row.side,
    size: parseFloat(row.size || '0'),
    entryPrice: parseFloat(row.entry_price || '0'),
    currentPrice: parseFloat(row.current_price || '0'),
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    realizedPnl: parseFloat(row.realized_pnl || '0'),
    metadata: row.metadata || {},
  }));
}

/**
 * Get all open positions across all domains
 */
export async function getAllOpenPositions(): Promise<Position[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('positions')
    .select('*')
    .eq('status', 'open');

  if (error) {
    console.error('Error fetching all positions:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    domain: row.domain as Domain,
    target: row.target,
    targetName: row.target_name,
    entryValueUsd: parseFloat(row.entry_value_usd || '0'),
    currentValueUsd: parseFloat(row.current_value_usd || '0'),
    status: row.status,
    side: row.side,
    size: parseFloat(row.size || '0'),
    entryPrice: parseFloat(row.entry_price || '0'),
    currentPrice: parseFloat(row.current_price || '0'),
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    realizedPnl: parseFloat(row.realized_pnl || '0'),
    metadata: row.metadata || {},
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
  const supabase = getSupabase();

  const insertData = {
    domain,
    target: positionData.target,
    target_name: positionData.targetName,
    entry_value_usd: positionData.entryValueUsd,
    current_value_usd: positionData.entryValueUsd,
    status: 'open',
    side: positionData.side,
    size: positionData.size,
    entry_price: positionData.entryPrice,
    current_price: positionData.entryPrice,
    opened_at: new Date().toISOString(),
    metadata: positionData.metadata || {},
  };

  const { data, error } = await supabase
    .from('positions')
    .insert(insertData)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create position: ${error.message}`);
  }

  return data.id;
}

export async function getPendingPositionsForVerification(): Promise<PendingPosition[]> {
  const supabase = getSupabase();

  const tableMap: Record<Domain, { table: string; idField: string }> = {
    dlmm: { table: 'dlmm_positions', idField: 'id' },
    perps: { table: 'perps_positions', idField: 'id' },
    polymarket: { table: 'polymarket_positions', idField: 'id' },
    spot: { table: 'spot_positions', idField: 'id' },
  };

  const results: PendingPosition[] = [];

  for (const domain of Object.keys(tableMap) as Domain[]) {
    const config = tableMap[domain];
    const column = domain === 'perps' ? 'order_id' : 'tx_hash';

    const { data } = await supabase
      .from(config.table)
      .select(`${config.idField}, ${column}, opened_at`)
      .eq('verified', false)
      .not(column, 'is', null);

    (data || []).forEach((row: any) => {
      const tx_hash = row[column];
      if (!tx_hash) return;

      results.push({
        domain,
        id: row[config.idField],
        tx_hash,
        opened_at: row.opened_at,
      });
    });
  }

  return results;
}

export async function markPositionVerified(domain: Domain, positionId: string): Promise<void> {
  const supabase = getSupabase();

  const tableMap: Record<Domain, string> = {
    dlmm: 'dlmm_positions',
    perps: 'perps_positions',
    polymarket: 'polymarket_positions',
    spot: 'spot_positions',
  };

  const { error } = await supabase
    .from(tableMap[domain])
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
    })
    .eq('id', positionId);

  if (error) {
    console.error(`Failed to mark ${domain} position ${positionId} as verified:`, error);
  }
}

/**
 * Update position current values
 */
export async function updatePosition(
  positionId: string,
  updates: {
    currentValueUsd?: number;
    currentPrice?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const supabase = getSupabase();

  const updateData: Record<string, unknown> = {};
  if (updates.currentValueUsd !== undefined) updateData.current_value_usd = updates.currentValueUsd;
  if (updates.currentPrice !== undefined) updateData.current_price = updates.currentPrice;
  if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

  const { error } = await supabase
    .from('positions')
    .update(updateData)
    .eq('id', positionId);

  if (error) {
    throw new Error(`Failed to update position: ${error.message}`);
  }
}

/**
 * Close a position
 */
export async function closePosition(
  domain: Domain,
  positionId: string,
  closingData: {
    realizedPnl?: number;
    currentValueUsd?: number;
    currentPrice?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const supabase = getSupabase();

  const updateData: Record<string, unknown> = {
    status: 'closed',
    closed_at: new Date().toISOString(),
  };

  if (closingData.realizedPnl !== undefined) updateData.realized_pnl = closingData.realizedPnl;
  if (closingData.currentValueUsd !== undefined) updateData.current_value_usd = closingData.currentValueUsd;
  if (closingData.currentPrice !== undefined) updateData.current_price = closingData.currentPrice;
  if (closingData.metadata !== undefined) updateData.metadata = closingData.metadata;

  const { error } = await supabase
    .from('positions')
    .update(updateData)
    .eq('id', positionId);

  if (error) {
    throw new Error(`Failed to close position: ${error.message}`);
  }
}

// =============================================================================
// DECISION LOGGING (Unified decisions table)
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
    skillsApplied?: string[];
    marketConditions?: Record<string, unknown>;
  }
): Promise<{ id: string } | null> {
  const supabase = getSupabase();

  const insertData = {
    domain,
    action: decision.action,
    target: decision.target,
    amount_usd: decision.amountUsd,
    reasoning: decision.reasoning,
    confidence: decision.confidence,
    skills_applied: decision.skillsApplied || [],
    market_conditions: decision.marketConditions || {},
    decision_timestamp: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('decisions')
    .insert(insertData)
    .select('id')
    .single();

  if (error) {
    console.error('Failed to log decision:', error);
    return null;
  }

  return data;
}

/**
 * Update decision outcome
 */
export async function updateDecisionOutcome(
  decisionId: string,
  outcome: {
    outcome: 'profit' | 'loss' | 'pending';
    realizedPnl?: number;
    pnlPercent?: number;
  }
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('decisions')
    .update({
      outcome: outcome.outcome,
      realized_pnl: outcome.realizedPnl,
      pnl_percent: outcome.pnlPercent,
    })
    .eq('id', decisionId);

  if (error) {
    console.error('Failed to update decision outcome:', error);
  }
}

/**
 * Get recent decisions for a domain
 */
export async function getRecentDecisions(domain: Domain, limit = 5): Promise<DecisionHistory[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('decisions')
    .select('*')
    .eq('domain', domain)
    .order('decision_timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent decisions:', error);
    return [];
  }

  return (data || []).map(row => ({
    action: row.action,
    target: row.target,
    amountUsd: parseFloat(row.amount_usd || '0'),
    reasoning: row.reasoning,
    confidence: parseFloat(row.confidence || '0'),
    outcome: row.outcome === 'profit' ? 'profitable' : row.outcome === 'loss' ? 'loss' : 'pending',
    realizedPnl: parseFloat(row.realized_pnl || '0'),
    timestamp: row.decision_timestamp,
  }));
}

// =============================================================================
// PERFORMANCE SNAPSHOTS
// =============================================================================

/**
 * Take a performance snapshot for a domain
 */
export async function takePerformanceSnapshot(
  domain: Domain | null,
  totalValueUsd: number,
  numPositions: number,
  pnlData?: { dailyPnl?: number; weeklyPnl?: number; totalPnl?: number }
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('performance_snapshots')
    .insert({
      domain,
      timestamp: new Date().toISOString(),
      total_value_usd: totalValueUsd,
      num_positions: numPositions,
      daily_pnl: pnlData?.dailyPnl,
      weekly_pnl: pnlData?.weeklyPnl,
      total_pnl: pnlData?.totalPnl,
    });

  if (error) {
    console.error('Failed to take snapshot:', error);
  }
}

/**
 * Take snapshots for all domains + total portfolio
 */
export async function takeAllPerformanceSnapshots(): Promise<void> {
  const balances = await getAllBalances();
  const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
  const INITIAL_BALANCE = 2500;
  const TOTAL_INITIAL = 10000;

  let totalAum = 0;
  let totalPositions = 0;

  for (const domain of domains) {
    const positions = await getOpenPositions(domain);
    const positionValue = positions.reduce((sum, p) => sum + (p.currentValueUsd || 0), 0);
    const domainAum = balances[domain] + positionValue;
    const domainPnl = domainAum - INITIAL_BALANCE;

    totalAum += domainAum;
    totalPositions += positions.length;

    await takePerformanceSnapshot(domain, domainAum, positions.length, { totalPnl: domainPnl });
  }

  // Total portfolio snapshot (domain = null)
  const totalPnl = totalAum - TOTAL_INITIAL;
  await takePerformanceSnapshot(null, totalAum, totalPositions, { totalPnl });
}

/**
 * Get recent performance snapshots
 */
export async function getPerformanceSnapshots(domain: Domain | null, limit = 50): Promise<PerformanceSnapshot[]> {
  const supabase = getSupabase();

  let query = supabase
    .from('performance_snapshots')
    .select('*')
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (domain === null) {
    query = query.is('domain', null);
  } else {
    query = query.eq('domain', domain);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Error fetching snapshots:', error);
    return [];
  }

  return (data || []).map(row => ({
    domain: row.domain as Domain | null,
    timestamp: row.timestamp,
    totalValueUsd: parseFloat(row.total_value_usd || '0'),
    numPositions: row.num_positions,
    dailyPnl: parseFloat(row.daily_pnl || '0'),
    weeklyPnl: parseFloat(row.weekly_pnl || '0'),
    totalPnl: parseFloat(row.total_pnl || '0'),
  }));
}

function mapCommunitySkillRow(row: any): CommunitySkillRecord {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    author: row.author || undefined,
    githubUrl: row.github_url || undefined,
    domain: row.domain || undefined,
    downloads: row.downloads || 0,
    rating: row.rating || 0,
    version: row.version || '1.0.0',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function fetchCommunitySkills(options: {
  domain?: string;
  limit?: number;
  sortBy?: 'downloads' | 'rating' | 'updated_at';
} = {}): Promise<CommunitySkillRecord[]> {
  const supabase = getSupabase();
  const { domain, limit = 50, sortBy = 'downloads' } = options;
  const orderColumn = sortBy === 'updated_at' ? 'updated_at' : sortBy;

  let query = supabase
    .from('community_skills')
    .select('*')
    .order(orderColumn, { ascending: false })
    .limit(limit);

  if (domain) {
    query = query.eq('domain', domain);
  }

  const { data, error } = await query;
  if (error || !data) return [];

  return data.map(mapCommunitySkillRow);
}

export async function searchCommunitySkills(queryText: string): Promise<CommunitySkillRecord[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('community_skills')
    .select('*')
    .or(`name.ilike.%${queryText}%,description.ilike.%${queryText}%`)
    .order('downloads', { ascending: false })
    .limit(20);

  if (error || !data) {
    return [];
  }

  return data.map(mapCommunitySkillRow);
}

export async function getCommunitySkillRecord(name: string): Promise<CommunitySkillRecord | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('community_skills')
    .select('*')
    .eq('name', name)
    .single();

  if (error || !data) {
    return null;
  }

  return mapCommunitySkillRow(data);
}

export async function incrementCommunitySkillDownloads(skillName: string): Promise<void> {
  const supabase = getSupabase();
  await supabase.rpc('increment_skill_downloads', { skill_name: skillName });
}

export async function registerCommunitySkill(skill: {
  name: string;
  description: string;
  author: string;
  githubUrl: string;
  domain?: string;
}): Promise<CommunitySkillRecord | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('community_skills')
    .insert({
      name: skill.name,
      description: skill.description,
      author: skill.author,
      github_url: skill.githubUrl,
      domain: skill.domain,
    })
    .select('*')
    .single();

  if (error || !data) {
    return null;
  }

  return mapCommunitySkillRow(data);
}

export async function trackSkillInstallation(skillName: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from('user_skills')
    .insert({ skill_name: skillName })
    .select()
    .maybeSingle();
}

export async function untrackSkillInstallation(skillName: string): Promise<void> {
  const supabase = getSupabase();
  await supabase
    .from('user_skills')
    .delete()
    .eq('skill_name', skillName);
}

export async function listInstalledCommunitySkills(): Promise<string[]> {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from('user_skills')
    .select('skill_name');

  if (error || !data) return [];
  return data.map((row: any) => row.skill_name as string);
}

// =============================================================================
// TRADE LOGGING
// =============================================================================

/**
 * Log a trade execution
 */
export async function logTrade(
  domain: Domain,
  trade: {
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
  }
): Promise<{ id: string } | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('trades')
    .insert({
      domain,
      position_id: trade.positionId,
      decision_id: trade.decisionId,
      action: trade.action,
      target: trade.target,
      target_name: trade.targetName,
      side: trade.side,
      size: trade.size,
      price_usd: trade.priceUsd,
      value_usd: trade.valueUsd,
      fee: trade.fee,
      tx_hash: trade.txHash,
      executed_at: new Date().toISOString(),
      metadata: trade.metadata || {},
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to log trade:', error);
    return null;
  }

  return data;
}

// =============================================================================
// DECISION EVALUATIONS (Judge feedback)
// =============================================================================

/**
 * Log a judge evaluation
 */
export async function logDecisionEvaluation(
  evaluation: {
    decisionId: string;
    domain: Domain;
    action: string;
    target?: string;
    wasGoodDecision: boolean;
    qualityScore?: number;
    strengths?: string;
    weaknesses?: string;
    missedFactors?: string;
    betterApproach?: string;
    keyInsight: string;
    insightType: string;
    applicability?: string;
  }
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('decision_evaluations')
    .insert({
      decision_id: evaluation.decisionId,
      domain: evaluation.domain,
      action: evaluation.action,
      target: evaluation.target,
      was_good_decision: evaluation.wasGoodDecision,
      quality_score: evaluation.qualityScore,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
      missed_factors: evaluation.missedFactors,
      better_approach: evaluation.betterApproach,
      key_insight: evaluation.keyInsight,
      insight_type: evaluation.insightType,
      applicability: evaluation.applicability || 'domain',
      created_at: new Date().toISOString(),
    });

  if (error) {
    console.error('Failed to log evaluation:', error);
  }
}

/**
 * Get recent evaluations for learning
 */
export async function getRecentEvaluations(domain: Domain, limit = 10): Promise<unknown[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('decision_evaluations')
    .select('*')
    .eq('domain', domain)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching evaluations:', error);
    return [];
  }

  return data || [];
}

// =============================================================================
// SKILL REFLECTIONS
// =============================================================================

/**
 * Log a skill reflection
 */
export async function logSkillReflection(
  reflection: {
    skillName: string;
    skillPath: string;
    domain: Domain;
    sourceType: string;
    triggerDecisionId?: string;
    triggerPnl?: number;
    triggerPnlPct?: number;
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('skill_reflections')
    .upsert({
      skill_name: reflection.skillName,
      skill_path: reflection.skillPath,
      domain: reflection.domain,
      source_type: reflection.sourceType,
      trigger_decision_id: reflection.triggerDecisionId,
      trigger_pnl: reflection.triggerPnl,
      trigger_pnl_pct: reflection.triggerPnlPct,
      metadata: reflection.metadata || {},
      updated_at: new Date().toISOString(),
    }, { onConflict: 'skill_name,domain' });

  if (error) {
    console.error('Failed to log skill reflection:', error);
  }
}

/**
 * Update skill application stats
 */
export async function updateSkillApplication(
  skillName: string,
  domain: Domain,
  wasSuccessful: boolean
): Promise<void> {
  const supabase = getSupabase();

  // Get current stats
  const { data: existing } = await supabase
    .from('skill_reflections')
    .select('times_applied, success_count, failure_count')
    .eq('skill_name', skillName)
    .eq('domain', domain)
    .single();

  if (!existing) return;

  const { error } = await supabase
    .from('skill_reflections')
    .update({
      times_applied: (existing.times_applied || 0) + 1,
      success_count: wasSuccessful ? (existing.success_count || 0) + 1 : existing.success_count,
      failure_count: !wasSuccessful ? (existing.failure_count || 0) + 1 : existing.failure_count,
      last_applied: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('skill_name', skillName)
    .eq('domain', domain);

  if (error) {
    console.error('Failed to update skill application:', error);
  }
}

// =============================================================================
// PORTFOLIO
// =============================================================================

/**
 * Get full portfolio summary
 */
export async function getPortfolio(): Promise<Portfolio> {
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

  return {
    totalValueUsd,
    domains: domainSummary,
    positions: allPositions,
    lastUpdated: new Date().toISOString(),
  };
}

// =============================================================================
// MARKET CACHE (unchanged - these tables still exist)
// =============================================================================

/**
 * Get cached pools from pool_cache table
 */
export async function getCachedPools(limit = 100): Promise<unknown[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('pool_cache')
    .select('*')
    .order('volume_24h', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching cached pools:', error);
    return [];
  }

  return data || [];
}

/**
 * Get cached perp markets
 */
export async function getCachedPerpMarkets(limit = 80): Promise<unknown[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('perp_markets')
    .select('*')
    .order('volume_24h', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching cached perp markets:', error);
    return [];
  }

  return data || [];
}

/**
 * Get cached polymarket markets
 */
export async function getCachedPolymarkets(limit = 80): Promise<unknown[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('polymarket_market_cache')
    .select('*')
    .order('volume', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching cached polymarkets:', error);
    return [];
  }

  return data || [];
}

/**
 * Get cached spot tokens
 */
export async function getCachedSpotTokens(limit = 60): Promise<unknown[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('spot_tokens')
    .select('*')
    .order('volume_24h', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching cached spot tokens:', error);
    return [];
  }

  return data || [];
}

// Legacy exports for compatibility
export const CLAUDEFI_MODEL_ID = CLAUDEFI_AGENT_ID;
export const updateDomainTotalAum = async () => {}; // No-op, AUM computed from cash + positions
export const calculateAndUpdateDomainAum = async (domain: Domain) => {
  const balance = await getDomainBalance(domain);
  const positions = await getOpenPositions(domain);
  return balance + positions.reduce((sum, p) => sum + (p.currentValueUsd || 0), 0);
};
export const calculateAndUpdateAllDomainsAum = async () => {
  const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
  const results: Record<Domain, number> = { dlmm: 0, perps: 0, polymarket: 0, spot: 0 };
  for (const domain of domains) {
    results[domain] = await calculateAndUpdateDomainAum(domain);
  }
  return results;
};
