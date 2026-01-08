/**
 * Learn Command
 *
 * Educational content about how claudefi works.
 * Accessible anytime via `claudefi learn [topic]`.
 *
 * Topics:
 * - (none)     - Show all educational content
 * - loop       - The Ralph Wiggum loop
 * - subagents  - The 4 specialized agents
 * - skills     - Skills & learning system
 * - safety     - Safety hooks and protections
 * - wallets    - Wallet funding instructions
 */

import chalk from 'chalk';
import { input } from '@inquirer/prompts';

// Reusable educational content
const CONTENT = {
  loop: {
    title: 'THE RALPH LOOP',
    lines: [
      '',
      'Named after Ralph Wiggum for his relentless persistence.',
      '',
      'Every cycle, claudefi runs:',
      '',
      '  OBSERVE \u2192 THINK \u2192 ACT \u2192 LEARN \u2192 REPEAT',
      '',
      '1. ' + chalk.cyan('OBSERVE') + ' - Fetches live market data across all domains',
      '   Meteora pools, Hyperliquid prices, Polymarket odds, trending tokens',
      '',
      '2. ' + chalk.cyan('THINK') + ' - Runs parallel Claude subagents (one per domain)',
      '   Each agent analyzes opportunities with its specialized knowledge',
      '',
      '3. ' + chalk.cyan('ACT') + ' - Validates decisions through safety hooks',
      '   Checks drawdown limits, position sizes, confidence thresholds',
      '',
      '4. ' + chalk.cyan('LEARN') + ' - Executes approved trades',
      '   Records outcomes for future reference',
      '',
      '5. ' + chalk.cyan('REPEAT') + ' - Builds memory from outcomes',
      '   Wins become patterns, losses become warnings',
      '',
      'The loop runs every 30 minutes by default (configurable).',
    ],
  },

  subagents: {
    title: 'SUBAGENTS',
    lines: [
      '',
      'claudefi runs 4 specialized Claude instances:',
      '',
      chalk.blue('\u2588\u2588') + ' ' + chalk.blue.bold('DLMM Agent') + ' - Liquidity provision on Meteora',
      '   Analyzes pool APRs, TVL, volume, and impermanent loss risk.',
      '   Decides when to provide/withdraw liquidity and which pairs.',
      '',
      chalk.magenta('\u2588\u2588') + ' ' + chalk.magenta.bold('Perps Agent') + ' - Perpetual futures on Hyperliquid',
      '   Tracks funding rates, open interest, and momentum.',
      '   Manages leveraged positions with strict risk controls.',
      '',
      chalk.green('\u2588\u2588') + ' ' + chalk.green.bold('Poly Agent') + ' - Prediction market trading',
      '   Researches events, analyzes probabilities, finds mispriced markets.',
      '   Uses web search for real-time information gathering.',
      '',
      chalk.yellow('\u2588\u2588') + ' ' + chalk.yellow.bold('Spot Agent') + ' - Memecoin trading via Jupiter',
      '   Identifies trending tokens, analyzes momentum and liquidity.',
      '   Quick in-and-out trades on volatile assets.',
      '',
      'Each agent has its own:',
      '  \u2022 System prompts with domain-specific knowledge',
      '  \u2022 MCP servers for protocol interactions',
      '  \u2022 Tools for executing trades and gathering data',
      '  \u2022 Memory of past trades and outcomes',
      '',
      'They run in parallel and share learnings across domains.',
    ],
  },

  skills: {
    title: 'SKILLS & LEARNING',
    lines: [
      '',
      'claudefi learns from every trade:',
      '',
      chalk.red('\u2022 Losses become warnings'),
      '  "High APR pools often have rug risk"',
      '  "Don\'t chase pumps that already 10x\'d"',
      '  "Low liquidity tokens have high slippage"',
      '',
      chalk.green('\u2022 Wins become patterns'),
      '  "SOL pools outperform during uptrends"',
      '  "Early entries on governance votes pay well"',
      '  "Wait for funding rate reset before longing"',
      '',
      chalk.cyan('\u2022 Skills are auto-generated'),
      '  Trade outcomes are analyzed by a judge model.',
      '  Good decisions become reusable patterns.',
      '  Bad decisions become warnings to avoid.',
      '',
      chalk.yellow('\u2022 Memory has TTL (Time To Live)'),
      '  Warnings expire after 60 days',
      '  Patterns last 90 days',
      '  Similar memories merge together',
      '  Confidence scores adjust based on outcomes',
      '',
      'The agent that runs today is smarter than yesterday.',
      'Every trade is a learning opportunity.',
    ],
  },

  safety: {
    title: 'SAFETY HOOKS',
    lines: [
      '',
      'Built-in protections that can\'t be bypassed:',
      '',
      chalk.red('\u2022 Global drawdown limit: -15%'),
      '  If total portfolio drops 15%, all trading stops.',
      '  Prevents catastrophic losses during black swans.',
      '',
      chalk.yellow('\u2022 Domain drawdown: -20%'),
      '  If one domain drops 20%, position sizes are halved.',
      '  Contains losses to individual strategies.',
      '',
      chalk.cyan('\u2022 Max 3 positions per domain'),
      '  Prevents over-concentration in any one area.',
      '  Ensures diversification across opportunities.',
      '',
      chalk.green('\u2022 Minimum 60% confidence to execute'),
      '  Agents must be confident in their analysis.',
      '  Configurable per your risk tolerance.',
      '',
      chalk.magenta('\u2022 Human approval for trades > $500'),
      '  Large trades require your confirmation.',
      '  You stay in control of significant decisions.',
      '',
      'Additional safeguards:',
      '  \u2022 Slippage limits on all swaps',
      '  \u2022 Liquidation warnings on leveraged positions',
      '  \u2022 Rug pull detection for new tokens',
      '  \u2022 Rate limiting on API calls',
      '',
      'You can customize these in Settings (\u2303C in monitor).',
    ],
  },

  wallets: {
    title: 'WALLET FUNDING',
    lines: [
      '',
      'claudefi uses different wallets for each domain:',
      '',
      chalk.blue.bold('\ud83d\udd35 Solana Wallet') + ' (for DLMM & Spot)',
      '   Used for: Meteora liquidity, Jupiter swaps',
      '   Fund with: SOL (for gas) + USDC (for trading)',
      '   Minimum: 0.1 SOL + your trading capital',
      '',
      chalk.magenta.bold('\ud83d\udfe3 Hyperliquid Wallet') + ' (for Perps)',
      '   Used for: Perpetual futures trading',
      '   Fund with: USDC on Arbitrum',
      '   Steps:',
      '     1. Deposit at: https://app.hyperliquid.xyz/deposit',
      '     2. Bridge USDC from Arbitrum to Hyperliquid L1',
      '     3. Generate API keys at Settings \u2192 API',
      '',
      chalk.green.bold('\ud83d\udfe2 Polymarket Wallet') + ' (for Polymarket)',
      '   Used for: Prediction market trading',
      '   Fund with: USDC on Polygon',
      '   Steps:',
      '     1. Go to: https://polymarket.com',
      '     2. Connect wallet and sign in',
      '     3. Go to Settings \u2192 API \u2192 Generate API Key',
      '     4. Copy API Key, Secret, and Passphrase to .env',
      '',
      chalk.yellow('\u26a0\ufe0f  IMPORTANT'),
      '   \u2022 Back up your private keys from .env',
      '   \u2022 Never share your private keys',
      '   \u2022 Use a dedicated wallet for claudefi',
      '   \u2022 Start with small amounts to test',
      '',
      'Your wallet addresses are in your .env file.',
      'Run `claudefi config` to view them.',
    ],
  },
};

type Topic = keyof typeof CONTENT;

function printBox(title: string, lines: string[], borderColor: string = 'cyan'): void {
  const maxLen = Math.max(title.length + 4, ...lines.map(l => stripAnsi(l).length + 4));
  const color = (chalk as any)[borderColor] || chalk.cyan;

  console.log();
  console.log(color('  \u256d' + '\u2500'.repeat(maxLen + 2) + '\u256e'));
  console.log(color('  \u2502 ') + chalk.bold(title.padEnd(maxLen)) + color(' \u2502'));
  console.log(color('  \u251c' + '\u2500'.repeat(maxLen + 2) + '\u2524'));
  lines.forEach(line => {
    const stripped = stripAnsi(line);
    const padding = maxLen - stripped.length;
    console.log(color('  \u2502 ') + line + ' '.repeat(Math.max(0, padding)) + color(' \u2502'));
  });
  console.log(color('  \u2570' + '\u2500'.repeat(maxLen + 2) + '\u256f'));
}

// Strip ANSI codes for length calculation
function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, '');
}

async function showTopic(topic: Topic, waitForInput: boolean = false): Promise<void> {
  const content = CONTENT[topic];
  printBox(content.title, content.lines);

  if (waitForInput) {
    console.log();
    await input({ message: chalk.gray('Press Enter to continue...'), default: '' });
  }
}

export async function learnCommand(topic?: string): Promise<void> {
  console.log();

  if (topic && topic in CONTENT) {
    // Show specific topic
    await showTopic(topic as Topic);
    console.log();
    return;
  }

  if (topic && !(topic in CONTENT)) {
    console.log(chalk.yellow(`  Unknown topic: ${topic}`));
    console.log(chalk.gray('  Available topics: loop, subagents, skills, safety, wallets'));
    console.log();
    return;
  }

  // Show all topics
  console.log(chalk.cyan.bold('  \u2588\u2588\u2588 How claudefi Works \u2588\u2588\u2588'));
  console.log();
  console.log(chalk.gray('  This guide explains the core concepts of claudefi.'));
  console.log(chalk.gray('  You can also view individual topics with:'));
  console.log(chalk.gray('    bun cli learn loop       - The trading cycle'));
  console.log(chalk.gray('    bun cli learn subagents  - The 4 agents'));
  console.log(chalk.gray('    bun cli learn skills     - Learning system'));
  console.log(chalk.gray('    bun cli learn safety     - Safety hooks'));
  console.log(chalk.gray('    bun cli learn wallets    - Wallet setup'));
  console.log();

  await input({ message: chalk.gray('Press Enter to start the guide...'), default: '' });

  await showTopic('loop', true);
  await showTopic('subagents', true);
  await showTopic('skills', true);
  await showTopic('safety', true);
  await showTopic('wallets', false);

  console.log();
  console.log(chalk.green.bold('  \u2713 That\'s it!'));
  console.log();
  console.log(chalk.white('  Ready to start? Run:'));
  console.log(chalk.cyan('    bun cli:run') + chalk.gray('      Start the trading loop'));
  console.log(chalk.cyan('    bun cli:monitor') + chalk.gray('  Watch live dashboard'));
  console.log();
  console.log(chalk.gray('  Questions? Join us:'));
  console.log(chalk.gray('    discord: ') + chalk.cyan('discord.gg/nzW8srS9'));
  console.log(chalk.gray('    x: ') + chalk.cyan('@claudefi11'));
  console.log();
}
