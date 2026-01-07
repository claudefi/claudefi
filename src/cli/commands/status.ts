/**
 * Status Command - Quick Portfolio Status
 *
 * Shows a quick overview of portfolio status without live updates.
 */

import chalk from 'chalk';
import ora from 'ora';
import 'dotenv/config';
import { getPortfolio, getOpenPositions, getRecentDecisions, initDatabase } from '../../db/index.js';
import type { Domain } from '../../types/index.js';

interface StatusOptions {
  domain?: string;
}

export async function statusCommand(options: StatusOptions): Promise<void> {
  console.log('\n');

  // Initialize database
  try {
    await initDatabase();
  } catch (error) {
    console.log(chalk.red('  database initialization failed'));
    console.log(chalk.gray(`\n  ${error}\n`));
    process.exit(1);
  }

  const spinner = ora('fetching portfolio').start();

  try {
    const portfolio = await getPortfolio();
    spinner.stop();

    // Calculate totals
    const totalValue = portfolio.totalValueUsd;
    const startingValue = 10000;
    const pnl = totalValue - startingValue;
    const pnlPercent = (pnl / startingValue) * 100;

    console.log(chalk.cyan('  claudefi portfolio'));
    console.log(chalk.gray('  ─────────────────────────────────'));
    console.log('\n');

    // Overall
    console.log(`  total value:   ${chalk.white.bold('$' + totalValue.toFixed(2))}`);
    console.log(`  total p&l:     ${pnl >= 0 ? chalk.green('+$' + pnl.toFixed(2)) : chalk.red('$' + pnl.toFixed(2))}`);
    console.log(`  return:        ${pnl >= 0 ? chalk.green('+' + pnlPercent.toFixed(1) + '%') : chalk.red(pnlPercent.toFixed(1) + '%')}`);
    console.log('\n');

    // By domain
    const domains: Domain[] = options.domain
      ? [options.domain.toLowerCase() as Domain]
      : ['dlmm', 'perps', 'polymarket', 'spot'];

    console.log(chalk.gray('  domain breakdown'));
    console.log(chalk.gray('  ─────────────────────────────────'));

    for (const domain of domains) {
      const info = portfolio.domains[domain];
      if (!info) continue;

      const total = info.totalValue;
      const domainStart = 2500;
      const domainPnl = total - domainStart;
      const domainPnlPercent = (domainPnl / domainStart) * 100;

      const pnlColor = domainPnl >= 0 ? chalk.green : chalk.red;

      console.log(`\n  ${chalk.cyan(domain.toUpperCase())}`);
      console.log(`    balance:     $${info.balance.toFixed(2)}`);
      console.log(`    positions:   $${info.positionsValue.toFixed(2)} (${info.numPositions} open)`);
      console.log(`    total:       $${total.toFixed(2)}`);
      console.log(`    p&l:         ${pnlColor((domainPnl >= 0 ? '+' : '') + '$' + domainPnl.toFixed(2) + ' (' + (domainPnl >= 0 ? '+' : '') + domainPnlPercent.toFixed(1) + '%)')}`);

      // Show open positions if any
      if (info.numPositions > 0) {
        const positions = await getOpenPositions(domain);
        console.log(chalk.gray('\n    open positions:'));

        for (const pos of positions.slice(0, 3)) {
          const entryVal = pos.entryValueUsd;
          const currentVal = pos.currentValueUsd;
          const posPnl = currentVal - entryVal;
          const posPnlPercent = (posPnl / entryVal) * 100;

          const target = pos.target?.substring(0, 20) || 'unknown';
          const pnlStr = posPnl >= 0
            ? chalk.green('+$' + posPnl.toFixed(2))
            : chalk.red('$' + posPnl.toFixed(2));

          console.log(`      ${target.padEnd(22)} $${currentVal.toFixed(2).padStart(8)}  ${pnlStr}`);
        }

        if (positions.length > 3) {
          console.log(chalk.gray(`      ... and ${positions.length - 3} more`));
        }
      }
    }

    // Recent decisions
    console.log('\n');
    console.log(chalk.gray('  recent decisions'));
    console.log(chalk.gray('  ─────────────────────────────────'));

    const allDecisions = await Promise.all(
      domains.map(d => getRecentDecisions(d, 2))
    );
    const recentDecisions = allDecisions
      .flat()
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 5);

    if (recentDecisions.length === 0) {
      console.log(chalk.gray('\n  no recent decisions'));
    } else {
      for (const decision of recentDecisions) {
        const time = new Date(decision.timestamp).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });

        const outcomeIcon = decision.outcome === 'profitable'
          ? chalk.green('✓')
          : decision.outcome === 'loss'
            ? chalk.red('✗')
            : chalk.gray('○');

        console.log(`\n  ${outcomeIcon} ${chalk.gray(time)}`);
        console.log(`    ${decision.action} ${decision.target || ''}`);
        console.log(`    ${chalk.gray(decision.reasoning?.substring(0, 60) || '')}`);
      }
    }

    console.log('\n');

  } catch (error) {
    spinner.fail('failed to fetch portfolio');
    console.log(chalk.red('\n  error: ' + (error as Error).message + '\n'));
    process.exit(1);
  }
}
