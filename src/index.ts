/**
 * Claudefi - Claude Agent SDK DeFi Trading Agent
 *
 * A DeFi crab that trades across multiple domains:
 * - DLMM: Meteora liquidity provision
 * - Perps: Hyperliquid perpetual futures
 * - Polymarket: Prediction markets
 * - Spot: Memecoin trading via Jupiter
 *
 * Architecture:
 * GOAL → AGENT LOOP → [SUBAGENTS | SKILLS | TOOLS] → HOOKS → STRUCTURED OUTPUT
 */

import 'dotenv/config';
import { runFullCycle, startScheduler } from './orchestrator/index.js';
import { logConfig, validateConfig } from './config.js';

async function main() {
  console.log(`
   ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗███████╗██╗
  ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝██╔════╝██║
  ██║     ██║     ███████║██║   ██║██║  ██║█████╗  █████╗  ██║
  ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  ██╔══╝  ██║
  ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗██║     ██║
   ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝

  Claude Agent SDK DeFi Trading Agent
  `);

  // Log current configuration
  logConfig();

  // Validate configuration
  const validation = validateConfig();
  if (!validation.valid) {
    console.error('❌ Configuration errors:', validation.errors.join(', '));
    process.exit(1);
  }

  // Validate environment
  const requiredEnvVars = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  const missing = requiredEnvVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    console.error('Missing required environment variables:', missing.join(', '));
    console.error('Copy .env.example to .env and fill in the values');
    process.exit(1);
  }

  // Parse command line args
  const args = process.argv.slice(2);
  const command = args[0] || 'cycle';

  switch (command) {
    case 'cycle':
      // Run a single full cycle
      console.log('Running single cycle...');
      await runFullCycle();
      break;

    case 'scheduler':
    case 'start':
      // Start the continuous scheduler
      console.log('Starting scheduler...');
      await startScheduler();
      break;

    case 'help':
    default:
      console.log(`
Usage: npx tsx src/index.ts [command]

Commands:
  cycle      Run a single trading cycle across all domains (default)
  scheduler  Start the continuous scheduler (30-min cycles)
  help       Show this help message

Environment:
  PAPER_TRADING=true|false   Paper trading mode (default: true)
  ACTIVE_DOMAINS=dlmm,perps  Comma-separated active domains
  CYCLE_INTERVAL_MS=1800000  Cycle interval in ms (default: 30 min)
      `);
      break;
  }
}

main().catch(console.error);
