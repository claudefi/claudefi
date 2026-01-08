/**
 * Single Cycle Integration Test
 *
 * Tests the full trading cycle with DLMM domain
 */

import 'dotenv/config';
import { runSingleCycle } from './orchestrator/ralph-loop.js';

async function test() {
  console.log('🧪 Testing single DLMM cycle...');
  console.log('   This will execute a full cycle with the DLMM subagent');
  console.log('   Mode: PAPER TRADING\n');

  try {
    const results = await runSingleCycle(['dlmm'], { paperTrading: true });

    console.log('\n📋 Results:');
    for (const r of results) {
      const emoji = r.outcome === 'success' ? '✅' :
                    r.outcome === 'skipped' ? '⏸️' : '❌';
      console.log(`  ${emoji} ${r.domain}: ${r.outcome}`);
      if (r.decision) {
        console.log(`     Action: ${r.decision.action}`);
        console.log(`     Target: ${r.decision.target || 'N/A'}`);
        console.log(`     Confidence: ${((r.decision.confidence || 0) * 100).toFixed(0)}%`);
        console.log(`     Reasoning: ${r.decision.reasoning?.slice(0, 100)}...`);
      }
    }

    console.log('\n✅ Single cycle completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Single cycle failed:', error);
    process.exit(1);
  }
}

test();
