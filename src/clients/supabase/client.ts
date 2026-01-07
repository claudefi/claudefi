/**
 * Supabase Client
 * Reuses ClaudeFi's Supabase schema
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { Domain, Position, PerformanceSnapshot, DecisionHistory, Portfolio } from '../../types/index.js';

let supabaseInstance: SupabaseClient | null = null;

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

// =============================================================================
// BALANCE OPERATIONS
// =============================================================================

// ClaudeFi model UUID - created with 10k starting balance
const CLAUDEFI_MODEL_ID = '30fbb2c4-0b41-4259-9e50-3a5f7e68e309';

/**
 * Get balance for a specific domain
 */
export async function getDomainBalance(domain: Domain): Promise<number> {
  const supabase = getSupabase();
  const balanceColumn = `${domain}_balance`;

  const { data, error } = await supabase
    .from('models')
    .select(balanceColumn)
    .eq('id', CLAUDEFI_MODEL_ID)
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
    .from('models')
    .update({ [balanceColumn]: newBalance, updated_at: new Date().toISOString() })
    .eq('id', CLAUDEFI_MODEL_ID);

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
    .from('models')
    .select('dlmm_balance, perps_balance, polymarket_balance, spot_balance')
    .eq('id', CLAUDEFI_MODEL_ID)
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
// POSITION OPERATIONS
// =============================================================================

/**
 * Get open positions for a domain
 */
export async function getOpenPositions(domain: Domain): Promise<Position[]> {
  const supabase = getSupabase();

  // Different tables per domain
  const tableMap: Record<Domain, string> = {
    dlmm: 'liquidity_positions',
    perps: 'perps_positions',
    polymarket: 'polymarket_positions',
    spot: 'liquidity_positions',
  };

  const table = tableMap[domain];

  // Only liquidity_positions has a domain column (shared by dlmm and spot)
  // perps_positions and polymarket_positions are single-domain tables
  const hasDomainColumn = table === 'liquidity_positions';

  let query = supabase
    .from(table)
    .select('*')
    .eq('model_id', CLAUDEFI_MODEL_ID)
    .eq('status', 'open');

  // Only filter by domain for liquidity_positions
  if (hasDomainColumn) {
    query = query.eq('domain', domain);
  }

  const { data, error } = await query;

  if (error) {
    console.error(`Error fetching ${domain} positions:`, error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    domain,
    target: row.pool_address || row.symbol || row.condition_id,
    entryValueUsd: parseFloat(row.entry_value_usd || row.amount_usd || '0'),
    currentValueUsd: parseFloat(row.current_value_usd || row.amount_usd || '0'),
    status: row.status,
    openedAt: row.opened_at || row.created_at,
    closedAt: row.closed_at,
    metadata: row,
  }));
}

/**
 * Create a new position
 */
export async function createPosition(
  domain: Domain,
  positionData: Record<string, unknown>
): Promise<string> {
  const supabase = getSupabase();

  const tableMap: Record<Domain, string> = {
    dlmm: 'liquidity_positions',
    perps: 'perps_positions',
    polymarket: 'polymarket_positions',
    spot: 'liquidity_positions',
  };

  const table = tableMap[domain];
  const hasDomainColumn = table === 'liquidity_positions';

  const insertData: Record<string, unknown> = {
    model_id: CLAUDEFI_MODEL_ID,
    status: 'open',
    opened_at: new Date().toISOString(),
    ...positionData,
  };

  // Only add domain column for liquidity_positions
  if (hasDomainColumn) {
    insertData.domain = domain;
  }

  const { data, error } = await supabase
    .from(table)
    .insert(insertData)
    .select('id')
    .single();

  if (error) {
    throw new Error(`Failed to create position: ${error.message}`);
  }

  return data.id;
}

/**
 * Close a position
 */
export async function closePosition(
  domain: Domain,
  positionId: string,
  closingData: Record<string, unknown>
): Promise<void> {
  const supabase = getSupabase();

  const tableMap: Record<Domain, string> = {
    dlmm: 'liquidity_positions',
    perps: 'perps_positions',
    polymarket: 'polymarket_positions',
    spot: 'liquidity_positions',
  };

  const { error } = await supabase
    .from(tableMap[domain])
    .update({
      status: 'closed',
      closed_at: new Date().toISOString(),
      ...closingData,
    })
    .eq('id', positionId);

  if (error) {
    throw new Error(`Failed to close position: ${error.message}`);
  }
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
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('agent_decisions')
    .insert({
      model_id: CLAUDEFI_MODEL_ID,
      domain,
      action: decision.action,
      pool_address: decision.target,
      amount_usd: decision.amountUsd,
      reasoning: decision.reasoning,
      confidence: decision.confidence,
      decision_timestamp: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (error) {
    console.error('Failed to log decision:', error);
    return null;
  }

  return data;
}

/**
 * Get recent decisions for a domain
 */
export async function getRecentDecisions(domain: Domain, limit = 5): Promise<DecisionHistory[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('agent_decisions')
    .select('*')
    .eq('model_id', CLAUDEFI_MODEL_ID)
    .eq('domain', domain)
    .order('decision_timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching recent decisions:', error);
    return [];
  }

  return (data || []).map(row => ({
    action: row.action,
    target: row.pool_address,
    amountUsd: parseFloat(row.amount_usd || '0'),
    reasoning: row.reasoning,
    confidence: parseFloat(row.confidence || '0'),
    outcome: row.was_profitable === true ? 'profitable' : row.was_profitable === false ? 'loss' : 'pending',
    realizedPnl: parseFloat(row.realized_pnl || '0'),
    timestamp: row.decision_timestamp,
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
  feesEarned?: number
): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('performance_snapshots')
    .insert({
      model_id: CLAUDEFI_MODEL_ID,
      domain,
      timestamp: new Date().toISOString(),
      total_value_usd: totalValueUsd,
      num_positions: numPositions,
      total_fees_earned: feesEarned,
    });

  if (error) {
    console.error('Failed to take snapshot:', error);
  }
}

/**
 * Get recent performance snapshots
 */
export async function getPerformanceSnapshots(domain: Domain, limit = 50): Promise<PerformanceSnapshot[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('performance_snapshots')
    .select('*')
    .eq('model_id', CLAUDEFI_MODEL_ID)
    .eq('domain', domain)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('Error fetching snapshots:', error);
    return [];
  }

  return (data || []).map(row => ({
    domain,
    timestamp: row.timestamp,
    totalValueUsd: parseFloat(row.total_value_usd || '0'),
    numPositions: row.num_positions,
    feesEarned: parseFloat(row.total_fees_earned || '0'),
  }));
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
// MARKET CACHE
// =============================================================================

/**
 * Get cached pools from pool_cache table
 * Fetches 100 pools for rich context
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
 * Fetches 80 markets for comprehensive coverage
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
 * Fetches 80 markets for variety
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
 * Fetches 60 tokens for variety (memes, trending, established)
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
