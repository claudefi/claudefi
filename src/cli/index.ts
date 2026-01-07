#!/usr/bin/env node
/**
 * Claudefi CLI
 *
 * Commands:
 *   init      - Setup wizard for new installations
 *   run       - Start the trading loop
 *   monitor   - Live dashboard view
 *   status    - Quick portfolio status
 *   skills    - Manage skills
 */

import { Command } from 'commander';
import { initCommand } from './commands/init.js';
import { runCommand } from './commands/run.js';
import { monitorCommand } from './commands/monitor.js';
import { statusCommand } from './commands/status.js';

const program = new Command();

program
  .name('claudefi')
  .description('autonomous defi trading agent')
  .version('1.0.0');

program
  .command('init')
  .description('setup wizard for new installation')
  .action(initCommand);

program
  .command('run')
  .description('start the trading loop')
  .option('-d, --domain <domain>', 'run only a specific domain')
  .option('-m, --monitor', 'show live monitoring dashboard')
  .option('--paper', 'force paper trading mode (default)')
  .option('--real', 'enable real trading (requires keys)')
  .action(runCommand);

program
  .command('monitor')
  .description('show live monitoring dashboard')
  .action(monitorCommand);

program
  .command('status')
  .description('show quick portfolio status')
  .option('-d, --domain <domain>', 'show status for specific domain')
  .action(statusCommand);

program.parse();
