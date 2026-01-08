#!/usr/bin/env node
/**
 * Claudefi CLI
 *
 * The open source claude agent that learns to trade defi.
 * Works with both Bun and Node.js.
 *
 * Commands:
 *   init      - Setup wizard for new installations
 *   run       - Start the trading loop (alias: start)
 *   monitor   - Live dashboard view
 *   chat      - Chat with claudefi about your portfolio
 *   status    - Quick portfolio status
 *   memory    - View learned patterns and warnings
 *   skills    - Manage Claude Code skills
 *   config    - View/edit configuration
 *   doctor    - Diagnose issues
 *   learn     - Educational content about how claudefi works
 */

import { Command } from 'commander';
import chalk from 'chalk';
import { initCommand } from './commands/init.js';
import { runCommand } from './commands/run.js';
import { monitorCommand } from './commands/monitor.js';
import { statusCommand } from './commands/status.js';
import { registerSkillsCommand } from './commands/skills.js';
import { runtimeInfo } from './runtime.js';

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(chalk.red('\n  ✗ unhandled error'));
  console.error(chalk.gray(`  ${reason}`));
  console.error(chalk.gray('\n  need help? https://discord.gg/nzW8srS9\n'));
  process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error(chalk.red('\n  ✗ unexpected error'));
  console.error(chalk.gray(`  ${error.message}`));
  console.error(chalk.gray('\n  need help? https://discord.gg/nzW8srS9\n'));
  process.exit(1);
});

const program = new Command();

program
  .name('claudefi')
  .description('the open source claude agent that learns to trade defi')
  .version('0.1.0');

program
  .command('init')
  .description('setup wizard for new installation')
  .action(initCommand);

program
  .command('run')
  .alias('start')
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
  .command('chat')
  .description('chat with claudefi about your agents and portfolio')
  .action(async () => {
    const { chatCommand } = await import('./commands/chat.js');
    await chatCommand();
  });

program
  .command('status')
  .description('show quick portfolio status')
  .option('-d, --domain <domain>', 'show status for specific domain')
  .action(statusCommand);

registerSkillsCommand(program);

// Memory command - view learned patterns and warnings
program
  .command('memory')
  .description('view learned patterns and warnings')
  .option('-s, --show', 'show detailed memory entries')
  .option('-c, --clear', 'clear memory (with confirmation)')
  .option('-d, --domain <domain>', 'filter by domain')
  .action(async (options) => {
    // Placeholder - will be implemented in Phase 2
    const { memoryCommand } = await import('./commands/memory.js');
    await memoryCommand(options);
  });

// Config command - view/edit configuration
program
  .command('config')
  .description('view or edit configuration')
  .argument('[key]', 'config key to get/set')
  .argument('[value]', 'value to set')
  .action(async (key, value) => {
    // Placeholder - will be implemented in Phase 2
    const { configCommand } = await import('./commands/config.js');
    await configCommand(key, value);
  });

// Doctor command - diagnose issues
program
  .command('doctor')
  .description('diagnose common issues')
  .action(async () => {
    // Placeholder - will be implemented in Phase 2
    const { doctorCommand } = await import('./commands/doctor.js');
    await doctorCommand();
  });

// Learn command - educational content
program
  .command('learn')
  .description('learn how claudefi works')
  .argument('[topic]', 'topic to learn about (loop, subagents, skills, safety, wallets)')
  .action(async (topic) => {
    const { learnCommand } = await import('./commands/learn.js');
    await learnCommand(topic);
  });

// Version command with runtime info
program
  .command('version')
  .description('show version and runtime info')
  .action(() => {
    console.log(chalk.cyan('\n  claudefi') + chalk.gray(` v0.1.0`));
    console.log(chalk.gray(`  runtime: ${runtimeInfo.version}`));
    console.log(chalk.gray(`  https://claudefi.com\n`));
  });

program.parse();
