/**
 * Historical Data Backfill Script
 *
 * Populates Supabase with 30 days of realistic trading history
 * for the Claudefi frontend dashboard.
 *
 * Usage:
 *   npm run backfill              # Standard run
 *   npm run backfill -- --dry-run # Preview without inserting
 *   npm run backfill -- --clear   # Clear existing and backfill fresh
 */

import 'dotenv/config';
import { CONFIG } from './backfill/config.js';
import { generatePositions, calculateFinalBalances, type GeneratedPosition } from './backfill/generators/positions.js';
import { generateDecisions, type GeneratedDecision } from './backfill/generators/decisions.js';
import { generateSnapshots, getSnapshotSummary, type GeneratedSnapshot } from './backfill/generators/snapshots.js';
import { round2 } from './backfill/utils.js';

// Parse command line args
const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const shouldClear = args.includes('--clear');

console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Claudefi Historical Data Backfill                      ║
╚════════════════════════════════════════════════════════════════╝

Configuration:
  Date Range:    ${CONFIG.startDate.toISOString().split('T')[0]} to ${CONFIG.endDate.toISOString().split('T')[0]}
  Days:          30
  Target P&L:    +5% to +15% total
  Dry Run:       ${isDryRun}
  Clear First:   ${shouldClear}
`);

async function getSupabaseClient() {
  const { getSupabase } = await import('../src/clients/supabase/client.js');
  return getSupabase();
}

async function clearExistingData(supabase: Awaited<ReturnType<typeof getSupabaseClient>>) {
  console.log('\n🧹 Clearing existing data from date range...');

  const startStr = CONFIG.startDate.toISOString();

  // Delete decisions
  const { error: decError, count: decCount } = await supabase
    .from('decisions')
    .delete()
    .gte('decision_timestamp', startStr)
    .select('*', { count: 'exact', head: true });

  if (decError) {
    console.error('   ❌ Error deleting decisions:', decError);
  } else {
    console.log(`   ✅ Deleted decisions from range`);
  }

  // Delete positions
  const { error: posError, count: posCount } = await supabase
    .from('positions')
    .delete()
    .gte('opened_at', startStr)
    .select('*', { count: 'exact', head: true });

  if (posError) {
    console.error('   ❌ Error deleting positions:', posError);
  } else {
    console.log(`   ✅ Deleted positions from range`);
  }

  // Delete snapshots
  const { error: snapError, count: snapCount } = await supabase
    .from('performance_snapshots')
    .delete()
    .gte('timestamp', startStr)
    .select('*', { count: 'exact', head: true });

  if (snapError) {
    console.error('   ❌ Error deleting snapshots:', snapError);
  } else {
    console.log(`   ✅ Deleted snapshots from range`);
  }
}

async function insertDecisions(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  decisions: GeneratedDecision[]
) {
  console.log(`\n📝 Inserting ${decisions.length} decisions...`);

  const rows = decisions.map((d) => ({
    id: d.id,
    domain: d.domain,
    action: d.action,
    target: d.target,
    amount_usd: d.amountUsd,
    reasoning: d.reasoning,
    confidence: d.confidence,
    outcome: d.outcome,
    realized_pnl: d.realizedPnl,
    pnl_percent: d.pnlPercent,
    skills_applied: d.skillsApplied,
    market_conditions: d.marketConditions,
    decision_timestamp: d.decisionTimestamp.toISOString(),
  }));

  // Insert in batches of 100
  const batchSize = 100;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('decisions').insert(batch);

    if (error) {
      console.error(`   ❌ Error inserting decisions batch ${i}:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`   Inserted ${inserted}/${rows.length}\r`);
    }
  }

  console.log(`   ✅ Inserted ${inserted} decisions`);
}

async function insertPositions(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  positions: GeneratedPosition[]
) {
  console.log(`\n📊 Inserting ${positions.length} positions...`);

  const rows = positions.map((p) => ({
    id: p.id,
    domain: p.domain,
    target: p.target,
    target_name: p.targetName,
    entry_value_usd: p.entryValueUsd,
    current_value_usd: p.currentValueUsd,
    status: p.status,
    side: p.side,
    size: p.size,
    entry_price: p.entryPrice,
    current_price: p.currentPrice,
    opened_at: p.openedAt.toISOString(),
    closed_at: p.closedAt?.toISOString() || null,
    realized_pnl: p.realizedPnl,
    metadata: p.metadata,
  }));

  // Insert in batches
  const batchSize = 50;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('positions').insert(batch);

    if (error) {
      console.error(`   ❌ Error inserting positions batch ${i}:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`   Inserted ${inserted}/${rows.length}\r`);
    }
  }

  console.log(`   ✅ Inserted ${inserted} positions`);
}

async function insertSnapshots(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  snapshots: GeneratedSnapshot[]
) {
  console.log(`\n📈 Inserting ${snapshots.length} performance snapshots...`);

  const rows = snapshots.map((s) => ({
    id: s.id,
    domain: s.domain,
    total_value_usd: s.totalValueUsd,
    num_positions: s.numPositions,
    daily_pnl: s.dailyPnl,
    weekly_pnl: s.weeklyPnl,
    total_pnl: s.totalPnl,
    timestamp: s.timestamp.toISOString(),
  }));

  // Insert in batches
  const batchSize = 200;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += batchSize) {
    const batch = rows.slice(i, i + batchSize);
    const { error } = await supabase.from('performance_snapshots').insert(batch);

    if (error) {
      console.error(`   ❌ Error inserting snapshots batch ${i}:`, error.message);
    } else {
      inserted += batch.length;
      process.stdout.write(`   Inserted ${inserted}/${rows.length}\r`);
    }
  }

  console.log(`   ✅ Inserted ${inserted} snapshots`);
}

async function updateFinalBalances(
  supabase: Awaited<ReturnType<typeof getSupabaseClient>>,
  positions: GeneratedPosition[]
) {
  console.log('\n💰 Updating final domain balances in agent_config...');

  const balances = calculateFinalBalances(positions);

  // Update agent_config with the domain balances
  const { error } = await supabase
    .from('agent_config')
    .update({
      dlmm_balance: balances.dlmm,
      perps_balance: balances.perps,
      polymarket_balance: balances.polymarket,
      spot_balance: balances.spot,
      updated_at: new Date().toISOString(),
    })
    .eq('id', '30fbb2c4-0b41-4259-9e50-3a5f7e68e309'); // CLAUDEFI_AGENT_ID

  if (error) {
    console.error('   ❌ Error updating balances:', error);
  } else {
    for (const [domain, balance] of Object.entries(balances)) {
      console.log(`   ${domain}: $${balance.toFixed(2)}`);
    }
  }

  const totalBalance = Object.values(balances).reduce((sum, b) => sum + b, 0);
  console.log(`   Total: $${totalBalance.toFixed(2)}`);
}

async function main() {
  try {
    // Generate all data
    console.log('🔧 Generating data...');

    const positions = generatePositions();
    const decisions = generateDecisions(positions);
    const snapshots = generateSnapshots(positions);
    const balances = calculateFinalBalances(positions);

    // Summary stats
    const openPositions = positions.filter((p) => p.status === 'open');
    const closedPositions = positions.filter((p) => p.status === 'closed');
    const totalRealizedPnl = closedPositions.reduce((sum, p) => sum + (p.realizedPnl || 0), 0);
    const totalInitial = CONFIG.initialBalancePerDomain * CONFIG.domains.length;
    const totalFinal = Object.values(balances).reduce((sum, b) => sum + b, 0) +
      openPositions.reduce((sum, p) => sum + p.currentValueUsd, 0);
    const totalPnlPercent = ((totalFinal - totalInitial) / totalInitial) * 100;

    console.log(`
📊 Generated Data Summary:
   Positions:   ${positions.length} (${openPositions.length} open, ${closedPositions.length} closed)
   Decisions:   ${decisions.length}
   Snapshots:   ${snapshots.length}

   Domain Breakdown:
   - dlmm:       ${positions.filter(p => p.domain === 'dlmm').length} positions
   - perps:      ${positions.filter(p => p.domain === 'perps').length} positions
   - polymarket: ${positions.filter(p => p.domain === 'polymarket').length} positions
   - spot:       ${positions.filter(p => p.domain === 'spot').length} positions

   P&L Summary:
   - Realized P&L:  $${round2(totalRealizedPnl).toFixed(2)}
   - Initial:       $${totalInitial.toFixed(2)}
   - Final Est:     $${round2(totalFinal).toFixed(2)}
   - Total Return:  ${totalPnlPercent >= 0 ? '+' : ''}${round2(totalPnlPercent).toFixed(1)}%
`);

    if (isDryRun) {
      console.log('🔍 DRY RUN - No data was inserted.\n');
      console.log('Sample position:', JSON.stringify(positions[0], null, 2));
      console.log('\nSample decision:', JSON.stringify(decisions[0], null, 2));
      return;
    }

    // Get Supabase client
    const supabase = await getSupabaseClient();

    // Clear if requested
    if (shouldClear) {
      await clearExistingData(supabase);
    }

    // Insert data
    await insertDecisions(supabase, decisions);
    await insertPositions(supabase, positions);
    await insertSnapshots(supabase, snapshots);
    await updateFinalBalances(supabase, positions);

    console.log('\n✅ Backfill complete!');
    console.log(`
📈 Frontend should now show:
   - Chart with 30-day history
   - ${openPositions.length} open positions
   - ${decisions.length} decisions in activity feed
   - Total AUM ~$${round2(totalFinal).toFixed(0)}
`);
  } catch (error) {
    console.error('❌ Backfill failed:', error);
    process.exit(1);
  }
}

main();
