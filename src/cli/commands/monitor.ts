/**
 * Monitor Command - Live Dashboard
 *
 * Shows a live TUI dashboard with:
 * - Portfolio overview
 * - Domain balances and positions
 * - Recent activity log
 * - Next cycle countdown
 */

import chalk from 'chalk';
import 'dotenv/config';
import { getPortfolio, getRecentDecisions, initDatabase } from '../../db/index.js';
import type { Domain } from '../../types/index.js';

const REFRESH_INTERVAL = 5000; // 5 seconds

export async function monitorCommand(): Promise<void> {
  console.log('\n');
  console.log(chalk.cyan('  claudefi live monitor'));
  console.log(chalk.gray('  ─────────────────────'));
  console.log(chalk.gray('  press ctrl+c to exit'));
  console.log('\n');

  // Initialize database
  try {
    await initDatabase();
  } catch (error) {
    console.log(chalk.red('  database initialization failed'));
    console.log(chalk.gray(`\n  ${error}\n`));
    process.exit(1);
  }

  // Start refresh loop
  await refreshDashboard();

  const interval = setInterval(async () => {
    await refreshDashboard();
  }, REFRESH_INTERVAL);

  // Handle exit
  process.on('SIGINT', () => {
    clearInterval(interval);
    console.log(chalk.gray('\n\n  monitor stopped\n'));
    process.exit(0);
  });

  // Keep process alive
  await new Promise(() => {});
}

async function refreshDashboard(): Promise<void> {
  // Clear screen (keep header)
  process.stdout.write('\x1B[2J\x1B[H');

  const timestamp = new Date().toLocaleTimeString();

  console.log('\n');
  console.log(chalk.cyan('  ╔═══════════════════════════════════════════════════════════════╗'));
  console.log(chalk.cyan('  ║') + chalk.white.bold('  claudefi                              ') + chalk.gray(`${timestamp}  `) + chalk.cyan('║'));
  console.log(chalk.cyan('  ╚═══════════════════════════════════════════════════════════════╝'));
  console.log('\n');

  try {
    // Fetch portfolio
    const portfolio = await getPortfolio();
    const totalValue = portfolio.totalValueUsd;

    // Calculate P&L (assuming $10k starting)
    const startingValue = 10000;
    const pnl = totalValue - startingValue;
    const pnlPercent = (pnl / startingValue) * 100;
    const pnlColor = pnl >= 0 ? chalk.green : chalk.red;

    console.log(chalk.gray('  portfolio'));
    console.log(chalk.gray('  ─────────────────────────────────────────────────────────────'));
    console.log(`  total value:  ${chalk.white.bold('$' + totalValue.toFixed(2))}  ${pnlColor((pnl >= 0 ? '+' : '') + '$' + pnl.toFixed(2))} ${pnlColor('(' + (pnl >= 0 ? '+' : '') + pnlPercent.toFixed(1) + '%)')}`);
    console.log('\n');

    // Domain breakdown
    const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
    const domainColors: Record<Domain, (s: string) => string> = {
      dlmm: chalk.blue,
      perps: chalk.magenta,
      polymarket: chalk.yellow,
      spot: chalk.green,
    };

    for (const domain of domains) {
      const info = portfolio.domains[domain];
      const balance = info?.balance || 0;
      const posValue = info?.positionsValue || 0;
      const total = balance + posValue;
      const numPos = info?.numPositions || 0;

      // Calculate domain P&L
      const domainStart = 2500;
      const domainPnl = total - domainStart;
      const domainPnlPercent = (domainPnl / domainStart) * 100;

      // Progress bar (based on $2500 starting)
      const barWidth = 20;
      const progress = Math.min(total / domainStart, 2); // Cap at 200%
      const filled = Math.round(progress * barWidth / 2);
      const bar = '█'.repeat(Math.min(filled, barWidth)) + '░'.repeat(Math.max(barWidth - filled, 0));

      const domainColor = domainColors[domain];
      const pnlStr = domainPnl >= 0
        ? chalk.green('+' + domainPnlPercent.toFixed(1) + '%')
        : chalk.red(domainPnlPercent.toFixed(1) + '%');

      console.log(`  ${domainColor(domain.padEnd(12))} $${total.toFixed(2).padStart(8)} ${pnlStr.padStart(10)}  ${chalk.gray(bar)}  ${chalk.gray(numPos + ' pos')}`);
    }

    console.log('\n');

    // Recent activity
    console.log(chalk.gray('  recent activity'));
    console.log(chalk.gray('  ─────────────────────────────────────────────────────────────'));

    // Fetch decisions and tag them with their domain
    const allDecisions = await Promise.all(
      domains.map(async d => {
        const decisions = await getRecentDecisions(d, 3);
        return decisions.map(dec => ({ ...dec, domain: d }));
      })
    );
    const recentDecisions = allDecisions
      .flat()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);

    if (recentDecisions.length === 0) {
      console.log(chalk.gray('  no recent activity'));
    } else {
      for (const decision of recentDecisions) {
        const time = new Date(decision.timestamp).toLocaleTimeString('en-US', {
          hour: '2-digit',
          minute: '2-digit',
        });

        const domainColor = domainColors[decision.domain] || chalk.white;
        const outcomeIcon = decision.outcome === 'profitable'
          ? chalk.green('✓')
          : decision.outcome === 'loss'
            ? chalk.red('✗')
            : chalk.gray('○');

        const pnlStr = decision.realizedPnl
          ? (decision.realizedPnl >= 0 ? chalk.green('+$' + decision.realizedPnl.toFixed(2)) : chalk.red('$' + decision.realizedPnl.toFixed(2)))
          : chalk.gray('-');

        console.log(`  ${chalk.gray(time)}  ${domainColor(decision.domain.padEnd(11))} ${decision.action.padEnd(12)} ${(decision.target || '').substring(0, 12).padEnd(12)} ${pnlStr.padStart(10)}  ${outcomeIcon}`);
      }
    }

    console.log('\n');
    console.log(chalk.gray('  ─────────────────────────────────────────────────────────────'));
    console.log(chalk.gray('  [q] quit  [r] refresh  [d] domain details'));
    console.log('\n');

  } catch (error) {
    console.log(chalk.red('  error fetching data: ' + (error as Error).message));
  }
}
