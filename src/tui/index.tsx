#!/usr/bin/env node
/**
 * TUI Entry Point
 *
 * Renders the claudefi TUI dashboard using Ink.
 */

import React from 'react';
import { render } from 'ink';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';
import { initDatabase } from '../db/index.js';
import { App } from './App.js';

// Check if setup has been completed
function checkSetup(): boolean {
  // Check for .env file
  const envPath = path.join(process.cwd(), '.env');
  if (!fs.existsSync(envPath)) {
    return false;
  }

  // Check for required environment variables
  if (!process.env.ANTHROPIC_API_KEY) {
    return false;
  }

  return true;
}

// Verify setup before launching
if (!checkSetup()) {
  console.log();
  console.log(chalk.cyan('  ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗███████╗██╗'));
  console.log(chalk.cyan(' ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝██╔════╝██║'));
  console.log(chalk.cyan(' ██║     ██║     ███████║██║   ██║██║  ██║█████╗  █████╗  ██║'));
  console.log(chalk.cyan(' ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  ██╔══╝  ██║'));
  console.log(chalk.cyan(' ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗██║     ██║'));
  console.log(chalk.cyan('  ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝'));
  console.log();
  console.log(chalk.yellow('  ⚠  setup required'));
  console.log();
  console.log(chalk.gray('  claudefi needs to be configured before running.'));
  console.log(chalk.gray('  run the setup wizard to get started:'));
  console.log();
  console.log(chalk.cyan('    bun cli:init'));
  console.log();
  console.log(chalk.gray('  this will configure your API keys, trading mode,'));
  console.log(chalk.gray('  and connect you to the defi protocols.'));
  console.log();
  process.exit(1);
}

// Ensure database is ready before launching the UI
await initDatabase().catch(error => {
  console.error('Failed to initialize database for TUI:', error);
  process.exit(1);
});

// Clear screen before rendering
process.stdout.write('\x1B[2J\x1B[0f');

// Render the app
const { waitUntilExit } = render(<App />);

// Handle exit
waitUntilExit().then(() => {
  console.log('\nGoodbye! 👋');
  process.exit(0);
});
