/**
 * Run Command - Start Trading Loop
 *
 * Starts the Ralph Loop trading cycle with optional monitoring.
 */

import chalk from 'chalk';
import ora from 'ora';
import 'dotenv/config';
import { runRalphLoop, runSingleCycle, DEFAULT_CONFIG } from '../../orchestrator/ralph-loop.js';
import type { Domain } from '../../types/index.js';

interface RunOptions {
  domain?: string;
  monitor?: boolean;
  paper?: boolean;
  real?: boolean;
}

export async function runCommand(options: RunOptions): Promise<void> {
  console.log('\n');
  console.log(chalk.cyan('  claudefi trading loop'));
  console.log(chalk.gray('  ─────────────────────'));
  console.log('\n');

  // Validate environment
  const spinner = ora('checking configuration').start();

  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    spinner.fail('missing supabase credentials');
    console.log(chalk.gray('\n  run `npm run cli:init` to set up claudefi\n'));
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    spinner.fail('missing anthropic api key');
    console.log(chalk.gray('\n  add ANTHROPIC_API_KEY to your .env file\n'));
    process.exit(1);
  }

  spinner.succeed('configuration valid');

  // Determine trading mode
  const paperTrading = options.real ? false : (options.paper ?? process.env.PAPER_TRADING !== 'false');

  // Determine active domains
  let domains: Domain[] = DEFAULT_CONFIG.domains;

  if (options.domain) {
    const domain = options.domain.toLowerCase() as Domain;
    if (!['dlmm', 'perps', 'polymarket', 'spot'].includes(domain)) {
      console.log(chalk.red(`\n  invalid domain: ${options.domain}`));
      console.log(chalk.gray('  valid domains: dlmm, perps, polymarket, spot\n'));
      process.exit(1);
    }
    domains = [domain];
  } else if (process.env.ACTIVE_DOMAINS) {
    domains = process.env.ACTIVE_DOMAINS.split(',').map(d => d.trim() as Domain);
  }

  // Show settings
  console.log(chalk.gray('  settings:'));
  console.log(`    mode:     ${paperTrading ? chalk.green('paper') : chalk.yellow('real')}`);
  console.log(`    domains:  ${domains.map(d => chalk.blue(d)).join(', ')}`);
  console.log(`    interval: ${(DEFAULT_CONFIG.cycleIntervalMs / 1000 / 60).toFixed(0)} minutes`);
  console.log('\n');

  // Start the loop
  if (options.monitor) {
    // Import and start monitor alongside loop
    console.log(chalk.yellow('  starting with live monitoring...\n'));
    // Would render Ink dashboard here
  }

  try {
    if (options.domain) {
      // Single domain cycle (for testing)
      console.log(chalk.cyan(`  running single cycle for ${options.domain}...\n`));
      const results = await runSingleCycle([options.domain as Domain], {
        ...DEFAULT_CONFIG,
        paperTrading,
        domains: [options.domain as Domain],
      });

      console.log('\n');
      for (const result of results) {
        console.log(chalk.gray('  result:'));
        console.log(`    domain:   ${result.domain}`);
        console.log(`    outcome:  ${result.outcome === 'success' ? chalk.green(result.outcome) : chalk.yellow(result.outcome)}`);
        if (result.decision) {
          console.log(`    action:   ${result.decision.action}`);
          console.log(`    target:   ${result.decision.target || '-'}`);
          console.log(`    confidence: ${(result.decision.confidence * 100).toFixed(0)}%`);
        }
      }
      console.log('\n');
    } else {
      // Full continuous loop
      console.log(chalk.green('  starting continuous trading loop...\n'));
      console.log(chalk.gray('  press ctrl+c to stop\n'));

      await runRalphLoop({
        ...DEFAULT_CONFIG,
        paperTrading,
        domains,
      });
    }
  } catch (error) {
    if ((error as Error).message?.includes('SIGINT')) {
      console.log(chalk.gray('\n\n  trading loop stopped\n'));
    } else {
      console.error(chalk.red('\n  error:'), (error as Error).message);
      process.exit(1);
    }
  }
}
