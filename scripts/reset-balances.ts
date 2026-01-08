/**
 * Reset Domain Balances
 *
 * Resets all domain balances to $500 (default starting balance)
 *
 * Usage:
 *   tsx scripts/reset-balances.ts [--amount=500]
 */

import 'dotenv/config';
import { initDataLayer, shutdownDataLayer, updateDomainBalance, getDomainBalance } from '../src/data/provider.js';
import type { Domain } from '../src/types/index.js';

const args = process.argv.slice(2);
const amountArg = args.find(a => a.startsWith('--amount='));
const resetAmount = amountArg ? parseFloat(amountArg.split('=')[1]) : 500;

const DOMAINS: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];

console.log(`
╔════════════════════════════════════════════════════════════════╗
║         Reset Domain Balances                                  ║
╚════════════════════════════════════════════════════════════════╝

Resetting all domains to: $${resetAmount.toFixed(2)}
`);

async function main(): Promise<void> {
  try {
    await initDataLayer();

    console.log('Current balances:');
    for (const domain of DOMAINS) {
      const current = await getDomainBalance(domain);
      console.log(`   ${domain.padEnd(10)}: $${current.toFixed(2)}`);
    }

    console.log('\nResetting...');
    for (const domain of DOMAINS) {
      await updateDomainBalance(domain, resetAmount);
      console.log(`   ✅ ${domain.padEnd(10)}: $${resetAmount.toFixed(2)}`);
    }

    console.log('\n✅ All balances reset!');

    await shutdownDataLayer();
  } catch (error) {
    console.error('❌ Reset failed:', error);
    await shutdownDataLayer();
    process.exit(1);
  }
}

main();
