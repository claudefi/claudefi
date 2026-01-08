/**
 * Cleanup Test Data
 *
 * Cleans up positions, decisions, and resets balances after stress tests
 * Works with both Prisma (local SQLite) and Supabase backends
 *
 * Usage:
 *   tsx scripts/cleanup-test-data.ts [--date=2026-01-08]
 */

import 'dotenv/config';
import { initDataLayer, shutdownDataLayer, dataProviderName } from '../src/data/provider.js';

const args = process.argv.slice(2);
const dateArg = args.find(a => a.startsWith('--date='));
const cutoffDate = dateArg ? dateArg.split('=')[1] : new Date().toISOString().split('T')[0];

console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Claudefi Test Data Cleanup                            ║
╚════════════════════════════════════════════════════════════════╝

Configuration:
  DB Provider:   ${dataProviderName}
  Cutoff Date:   ${cutoffDate}

⚠️  WARNING: This will:
  - Close all positions opened on/after ${cutoffDate}
  - Delete decisions made on/after ${cutoffDate}
  - Reset domain balances to $500
  - Clear idempotency records from ${cutoffDate}
`);

// Prompt for confirmation
console.log('Press Ctrl+C to cancel, or Enter to continue...');
await new Promise<void>(resolve => {
  process.stdin.once('data', () => resolve());
});

async function cleanupPrisma(cutoff: string): Promise<void> {
  const { prisma } = await import('../src/db/index.js');

  console.log('\n🧹 Cleaning up Prisma/SQLite...');

  // Count records before cleanup
  const decisionCount = await prisma.decision.count({
    where: { createdAt: { gte: new Date(cutoff) } },
  });
  const positionCount = await prisma.position.count({
    where: { openedAt: { gte: new Date(cutoff) } },
  });
  const idempotencyCount = await prisma.idempotencyRecord.count({
    where: { createdAt: { gte: new Date(cutoff) } },
  });

  console.log(`   Found ${decisionCount} decisions, ${positionCount} positions, ${idempotencyCount} idempotency records`);

  // Delete decisions
  const deletedDecisions = await prisma.decision.deleteMany({
    where: { createdAt: { gte: new Date(cutoff) } },
  });
  console.log(`   ✅ Deleted ${deletedDecisions.count} decisions`);

  // Close positions
  const closedPositions = await prisma.position.updateMany({
    where: {
      openedAt: { gte: new Date(cutoff) },
      status: 'open',
    },
    data: {
      status: 'closed',
      closedAt: new Date(),
    },
  });
  console.log(`   ✅ Closed ${closedPositions.count} positions`);

  // Reset domain balances
  const domains = ['dlmm', 'perps', 'polymarket', 'spot'];
  for (const domain of domains) {
    await prisma.domainBalance.upsert({
      where: { domain },
      update: { balance: 500.0 },
      create: { domain, balance: 500.0 },
    });
  }
  console.log(`   ✅ Reset all domain balances to $500`);

  // Clear idempotency records
  const deletedIdempotency = await prisma.idempotencyRecord.deleteMany({
    where: { createdAt: { gte: new Date(cutoff) } },
  });
  console.log(`   ✅ Deleted ${deletedIdempotency.count} idempotency records`);

  await prisma.$disconnect();
}

async function cleanupSupabase(cutoff: string): Promise<void> {
  const { supabase } = await import('../src/clients/supabase/client.js');

  console.log('\n🧹 Cleaning up Supabase...');

  // Count records before cleanup
  const { count: decisionCount } = await supabase
    .from('decisions')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', cutoff);

  const { count: positionCount } = await supabase
    .from('positions')
    .select('*', { count: 'exact', head: true })
    .gte('opened_at', cutoff);

  const { count: idempotencyCount } = await supabase
    .from('idempotency_records')
    .select('*', { count: 'exact', head: true })
    .gte('created_at', cutoff);

  console.log(`   Found ${decisionCount || 0} decisions, ${positionCount || 0} positions, ${idempotencyCount || 0} idempotency records`);

  // Delete decisions
  const { error: decisionError } = await supabase
    .from('decisions')
    .delete()
    .gte('created_at', cutoff);

  if (decisionError) {
    console.error('   ❌ Error deleting decisions:', decisionError);
  } else {
    console.log(`   ✅ Deleted decisions`);
  }

  // Close positions
  const { error: positionError } = await supabase
    .from('positions')
    .update({ status: 'closed', closed_at: new Date().toISOString() })
    .gte('opened_at', cutoff)
    .eq('status', 'open');

  if (positionError) {
    console.error('   ❌ Error closing positions:', positionError);
  } else {
    console.log(`   ✅ Closed positions`);
  }

  // Reset domain balances
  const domains = ['dlmm', 'perps', 'polymarket', 'spot'];
  for (const domain of domains) {
    const { error } = await supabase
      .from('domain_balances')
      .upsert({ domain, balance: 500.0 }, { onConflict: 'domain' });

    if (error) {
      console.error(`   ❌ Error resetting ${domain} balance:`, error);
    }
  }
  console.log(`   ✅ Reset all domain balances to $500`);

  // Clear idempotency records
  const { error: idempotencyError } = await supabase
    .from('idempotency_records')
    .delete()
    .gte('created_at', cutoff);

  if (idempotencyError) {
    console.error('   ❌ Error deleting idempotency records:', idempotencyError);
  } else {
    console.log(`   ✅ Deleted idempotency records`);
  }
}

async function main(): Promise<void> {
  try {
    await initDataLayer();

    if (dataProviderName === 'supabase') {
      await cleanupSupabase(cutoffDate);
    } else {
      await cleanupPrisma(cutoffDate);
    }

    console.log('\n✅ Cleanup complete!');

    // Show final state
    const { getPortfolio } = await import('../src/data/provider.js');
    const portfolio = await getPortfolio();
    console.log(`\n💰 Portfolio: $${portfolio.totalValueUsd.toFixed(2)}`);
    console.log(`📊 Open Positions: ${portfolio.positions.filter(p => p.status === 'open').length}`);

    await shutdownDataLayer();
  } catch (error) {
    console.error('❌ Cleanup failed:', error);
    await shutdownDataLayer();
    process.exit(1);
  }
}

main();
