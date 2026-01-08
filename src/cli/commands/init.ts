/**
 * Init Command - Improved Setup Wizard
 *
 * Interactive setup for new claudefi installations with:
 * 1. Welcome screen with ASCII logo
 * 2. Anthropic API key (required, with validation)
 * 3. Trading mode selection (paper/real)
 * 4. Wallet generation (real mode only)
 * 5. Domain selection with risk explanations
 * 6. Data storage choice (SQLite default, Supabase optional)
 * 7. Advanced settings (Ralph Wiggum loop interval, Firecrawl, confidence)
 * 8. Educational screens about how claudefi works
 * 9. Summary and launch instructions
 */

import {
  select,
  checkbox,
  input,
  confirm,
  password,
} from '@inquirer/prompts';
import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createClient } from '@supabase/supabase-js';
import { Keypair } from '@solana/web3.js';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';
import Anthropic from '@anthropic-ai/sdk';
import qrcode from 'qrcode-terminal';

// ASCII art logo
const LOGO = [
  '  ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗███████╗██╗',
  ' ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝██╔════╝██║',
  ' ██║     ██║     ███████║██║   ██║██║  ██║█████╗  █████╗  ██║',
  ' ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  ██╔══╝  ██║',
  ' ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗██║     ██║',
  '  ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝',
];

const DOMAINS = ['dlmm', 'perps', 'polymarket', 'spot'] as const;
type Domain = typeof DOMAINS[number];

interface SetupConfig {
  anthropicApiKey: string;
  paperTrading: boolean;
  domains: Domain[];
  balancePerDomain: number;
  storageType: 'sqlite' | 'supabase';
  supabaseUrl?: string;
  supabaseKey?: string;
  cycleIntervalMs: number;
  firecrawlApiKey?: string;
  confidenceThreshold: number;
  solanaWallet?: { address: string; privateKey: string };
  ethereumWallet?: { address: string; privateKey: string };
  hyperliquidApiKey?: string;
  hyperliquidApiSecret?: string;
  polymarketApiKey?: string;
  polymarketApiSecret?: string;
  polymarketPassphrase?: string;
}

// Domain descriptions with risk info
const DOMAIN_INFO: Record<Domain, { name: string; desc: string; risk: string; color: string }> = {
  dlmm: {
    name: 'DLMM',
    desc: 'Liquidity provision on Meteora',
    risk: 'Impermanent loss during price swings',
    color: 'blue',
  },
  perps: {
    name: 'Perps',
    desc: 'Perpetual futures on Hyperliquid',
    risk: 'Liquidation if position moves against you',
    color: 'magenta',
  },
  polymarket: {
    name: 'Polymarket',
    desc: 'Prediction market trading',
    risk: 'Markets can resolve unexpectedly',
    color: 'green',
  },
  spot: {
    name: 'Spot',
    desc: 'Memecoin trading via Jupiter',
    risk: 'High volatility, rugpulls possible',
    color: 'yellow',
  },
};

// Generate real ASCII QR code for wallet address
function generateQRCode(address: string): Promise<string> {
  return new Promise((resolve) => {
    qrcode.generate(address, { small: true }, (qr: string) => {
      resolve(qr);
    });
  });
}

// Print QR code with proper indentation
function printQRCode(qr: string): void {
  const lines = qr.split('\n');
  lines.forEach(line => {
    if (line.trim()) {
      console.log('    ' + line);
    }
  });
}

function clearScreen(): void {
  console.log('\n'.repeat(2));
}

function printLogo(): void {
  LOGO.forEach(line => console.log(chalk.cyan(line)));
}

function printStepHeader(step: number, total: number, title: string): void {
  console.log('\n');
  console.log(chalk.cyan('  ┌' + '─'.repeat(53) + '┐'));
  console.log(chalk.cyan('  │') + chalk.white(`  STEP ${step} OF ${total}: ${title}`.padEnd(53)) + chalk.cyan('│'));
  console.log(chalk.cyan('  └' + '─'.repeat(53) + '┘'));
  console.log();
}

function printBox(lines: string[], borderColor: string = 'cyan'): void {
  const maxLen = Math.max(...lines.map(l => l.length));
  const color = (chalk as any)[borderColor] || chalk.cyan;

  console.log(color('  ╭' + '─'.repeat(maxLen + 2) + '╮'));
  lines.forEach(line => {
    console.log(color('  │ ') + line.padEnd(maxLen) + color(' │'));
  });
  console.log(color('  ╰' + '─'.repeat(maxLen + 2) + '╯'));
}

export async function initCommand(): Promise<void> {
  clearScreen();

  // ==========================================
  // STEP 0: WELCOME SCREEN
  // ==========================================
  printLogo();
  console.log();
  console.log(chalk.white.bold('  welcome to claudefi'));
  console.log();
  console.log(chalk.gray('  the open source claude agent that learns to trade defi.'));
  console.log(chalk.gray('  let\'s get you set up in a few quick steps.'));
  console.log();
  console.log(chalk.gray('  ───────────────────────────────────────────────────────'));
  console.log();
  console.log(chalk.gray('  What we\'ll configure:'));
  console.log(chalk.green('  ✓') + chalk.white(' Claude API access (required)'));
  console.log(chalk.green('  ✓') + chalk.white(' Trading mode (paper or real)'));
  console.log(chalk.green('  ✓') + chalk.white(' Which domains to trade'));
  console.log(chalk.green('  ✓') + chalk.white(' Data storage (local or cloud)'));
  console.log();

  await input({ message: chalk.gray('Press Enter to continue...'), default: '' });

  try {
    const config = await runSetupWizard();
    await executeSetup(config);
  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') {
      console.log(chalk.gray('\n  setup cancelled\n'));
      return;
    }
    throw error;
  }
}

async function runSetupWizard(): Promise<SetupConfig> {
  const config: Partial<SetupConfig> = {
    cycleIntervalMs: 1800000, // 30 minutes default
    confidenceThreshold: 0.6,
  };

  // ==========================================
  // STEP 1: ANTHROPIC API KEY
  // ==========================================
  clearScreen();
  printStepHeader(1, 6, 'Claude API Access');

  console.log(chalk.white('  claudefi uses Claude to make trading decisions.'));
  console.log(chalk.white('  You\'ll need an Anthropic API key to continue.'));
  console.log();
  console.log(chalk.gray('  Get your key: ') + chalk.cyan('https://console.anthropic.com/settings/keys'));
  console.log(chalk.gray('  Format: ') + chalk.cyan('sk-ant-...'));
  console.log();

  let apiKeyValid = false;
  while (!apiKeyValid) {
    config.anthropicApiKey = await password({
      message: 'Enter your Anthropic API key (sk-ant-...):',
      validate: (value) => {
        if (!value.startsWith('sk-ant-')) {
          return 'API key should start with sk-ant-';
        }
        return true;
      },
    });

    // Validate API key
    const spinner = ora('Validating API key...').start();
    try {
      const client = new Anthropic({ apiKey: config.anthropicApiKey });
      await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'hi' }],
      });
      spinner.succeed(chalk.green('API key validated successfully'));
      apiKeyValid = true;
    } catch (error: any) {
      const errorMsg = error?.message || String(error);

      // Check if it's a credits issue vs invalid key
      if (errorMsg.includes('credit balance') || errorMsg.includes('billing')) {
        spinner.warn(chalk.yellow('API key format is valid, but account needs credits'));
        console.log(chalk.gray('  Add credits at: ') + chalk.cyan('https://console.anthropic.com/settings/billing'));
        console.log();

        const proceed = await confirm({
          message: 'Continue setup anyway? (you can add credits later)',
          default: true,
        });

        if (proceed) {
          apiKeyValid = true;
        }
      } else if (errorMsg.includes('invalid') || errorMsg.includes('authentication')) {
        spinner.fail(chalk.red('Invalid API key'));
        console.log(chalk.gray('  Please check your key and try again.'));
      } else {
        spinner.fail(chalk.red('API key validation failed'));
        console.log(chalk.gray(`  Error: ${errorMsg}`));
        console.log();

        const proceed = await confirm({
          message: 'Continue setup anyway?',
          default: false,
        });

        if (proceed) {
          apiKeyValid = true;
        }
      }
    }
  }

  // ==========================================
  // STEP 2: TRADING MODE
  // ==========================================
  clearScreen();
  printStepHeader(2, 6, 'Trading Mode');

  console.log(chalk.white('  How would you like to trade?'));
  console.log();

  config.paperTrading = await select({
    message: 'Select mode:',
    choices: [
      {
        name: chalk.green('● Paper Trading') + chalk.gray(' (Recommended)') + '\n' +
              chalk.gray('    Simulated trades with virtual money.\n') +
              chalk.gray('    Perfect for testing and learning.\n') +
              chalk.gray('    No real funds at risk.'),
        value: true,
      },
      {
        name: chalk.yellow('○ Real Trading') + '\n' +
              chalk.gray('    Actual trades on mainnet.\n') +
              chalk.gray('    Requires wallet keys for each domain.\n') +
              chalk.gray('    Only for experienced users.'),
        value: false,
      },
    ],
  });

  // Real trading confirmation
  if (!config.paperTrading) {
    console.log();
    console.log(chalk.yellow.bold('  ⚠️  REAL TRADING MODE'));
    console.log();
    console.log(chalk.white('  This will execute actual trades with real funds.'));
    console.log(chalk.white('  Make sure you understand the risks involved.'));
    console.log();

    const confirmation = await input({
      message: 'Type "I UNDERSTAND" to confirm:',
      validate: (value) => {
        if (value !== 'I UNDERSTAND') {
          return 'Please type exactly: I UNDERSTAND';
        }
        return true;
      },
    });

    if (confirmation !== 'I UNDERSTAND') {
      config.paperTrading = true;
      console.log(chalk.gray('\n  Switched to paper trading mode.\n'));
    }
  }

  // ==========================================
  // STEP 2b: WALLET SETUP (REAL TRADING ONLY)
  // ==========================================
  if (!config.paperTrading) {
    clearScreen();
    printStepHeader(2, 6, 'Wallet Setup');

    console.log(chalk.white('  claudefi needs wallets for each domain you enable.'));
    console.log(chalk.white('  We can generate new wallets or you can provide existing ones.'));
    console.log();

    const walletChoice = await select({
      message: 'Generate new wallets or use existing?',
      choices: [
        {
          name: chalk.green('● Generate new wallets') + chalk.gray(' (Recommended for fresh start)'),
          value: 'generate',
        },
        {
          name: chalk.cyan('○ I have wallets to import'),
          value: 'import',
        },
      ],
    });

    if (walletChoice === 'generate') {
      console.log();
      console.log(chalk.white('  Generating secure wallets...'));
      console.log();
      console.log(chalk.gray('  Each wallet is generated using cryptographically secure randomness'));
      console.log(chalk.gray('  (crypto.randomBytes). This guarantees uniqueness - the chance of'));
      console.log(chalk.gray('  collision is astronomically small (1 in 2^256).'));
      console.log();

      // Generate Solana wallet
      const solanaKeypair = Keypair.generate();
      config.solanaWallet = {
        address: solanaKeypair.publicKey.toBase58(),
        privateKey: Buffer.from(solanaKeypair.secretKey).toString('hex'),
      };

      // Generate Ethereum wallet (for Hyperliquid & Polymarket)
      const ethPrivateKey = generatePrivateKey();
      const ethAccount = privateKeyToAccount(ethPrivateKey);
      config.ethereumWallet = {
        address: ethAccount.address,
        privateKey: ethPrivateKey,
      };

      // Generate QR codes for both wallets
      const solanaQR = await generateQRCode(config.solanaWallet.address);
      const ethQR = await generateQRCode(config.ethereumWallet.address);

      // Display Solana wallet
      console.log(chalk.blue.bold('  🔵 SOLANA WALLET (for DLMM & Spot)'));
      console.log();
      console.log(chalk.white(`    Address: ${config.solanaWallet.address}`));
      console.log(chalk.gray('    Private Key: [Saved to .env]'));
      console.log();
      console.log(chalk.white('    Fund this wallet with SOL + USDC:'));
      console.log(chalk.gray('    → Minimum: 0.1 SOL (for gas) + trading capital'));
      console.log();
      console.log(chalk.cyan('    Scan to send SOL:'));
      printQRCode(solanaQR);
      console.log();

      // Display Hyperliquid wallet
      console.log(chalk.magenta.bold('  🟣 HYPERLIQUID WALLET (for Perps)'));
      console.log();
      console.log(chalk.white(`    Address: ${config.ethereumWallet.address}`));
      console.log(chalk.gray('    Private Key: [Saved to .env]'));
      console.log();
      console.log(chalk.white('    Setup steps:'));
      console.log(chalk.gray('    1. Deposit USDC: https://app.hyperliquid.xyz/deposit'));
      console.log(chalk.gray('    2. Bridge USDC from Arbitrum to Hyperliquid L1'));
      console.log(chalk.gray('    3. Generate API keys at Settings → API'));
      console.log(chalk.gray('       → Copy API Key and API Secret to .env'));
      console.log();
      console.log(chalk.cyan('    Scan to send USDC (Arbitrum):'));
      printQRCode(ethQR);
      console.log();

      // Display Polymarket wallet (same ETH address)
      console.log(chalk.green.bold('  🟢 POLYMARKET WALLET'));
      console.log();
      console.log(chalk.white(`    Address: ${config.ethereumWallet.address}`));
      console.log(chalk.gray('    Private Key: [Saved to .env]'));
      console.log();
      console.log(chalk.white('    Setup steps:'));
      console.log(chalk.gray('    1. Go to: https://polymarket.com'));
      console.log(chalk.gray('    2. Connect this wallet and sign in'));
      console.log(chalk.gray('    3. Go to Settings → API → Generate API Key'));
      console.log(chalk.gray('    4. Copy API Key, API Secret, and Passphrase to .env'));
      console.log();
      console.log(chalk.yellow('    ⚠️  You MUST log in to Polymarket to get API keys!'));
      console.log(chalk.yellow('    The wallet alone is not enough for trading.'));
      console.log();
      console.log(chalk.cyan('    Scan to send USDC (Polygon):'));
      printQRCode(ethQR);

      console.log();
      console.log(chalk.yellow.bold('  ⚠️  IMPORTANT: Back up your private keys from .env!'));
      console.log(chalk.yellow('  These wallets hold real funds.'));
      console.log();

      await input({ message: chalk.gray('Press Enter to continue...'), default: '' });

      // Ask for API keys
      console.log();
      console.log(chalk.white('  Now let\'s configure your API keys.'));
      console.log(chalk.gray('  (You can skip these and add them to .env later)'));
      console.log();

      const skipApiKeys = await confirm({
        message: 'Do you want to enter API keys now?',
        default: false,
      });

      if (skipApiKeys) {
        // Hyperliquid API keys
        console.log();
        console.log(chalk.magenta('  Hyperliquid API Keys'));
        config.hyperliquidApiKey = await input({
          message: 'Hyperliquid API Key (or press Enter to skip):',
          default: '',
        }) || undefined;

        if (config.hyperliquidApiKey) {
          config.hyperliquidApiSecret = await password({
            message: 'Hyperliquid API Secret:',
          });
        }

        // Polymarket API keys
        console.log();
        console.log(chalk.green('  Polymarket API Keys'));
        config.polymarketApiKey = await input({
          message: 'Polymarket API Key (or press Enter to skip):',
          default: '',
        }) || undefined;

        if (config.polymarketApiKey) {
          config.polymarketApiSecret = await password({
            message: 'Polymarket API Secret:',
          });
          config.polymarketPassphrase = await password({
            message: 'Polymarket Passphrase:',
          });
        }
      }
    } else {
      // Import existing wallets
      console.log();
      console.log(chalk.gray('  Enter your existing wallet keys:'));
      console.log();

      const solanaKey = await password({
        message: 'Solana Private Key (hex or base58):',
      });
      config.solanaWallet = {
        privateKey: solanaKey,
        address: '', // Will be derived
      };

      const ethKey = await password({
        message: 'Ethereum Private Key (0x...):',
      });
      config.ethereumWallet = {
        privateKey: ethKey,
        address: '', // Will be derived
      };
    }
  }

  // ==========================================
  // STEP 3: DOMAIN SELECTION
  // ==========================================
  clearScreen();
  printStepHeader(3, 6, 'Trading Domains');

  console.log(chalk.white('  Select which markets claudefi should trade:'));
  console.log();

  config.domains = await checkbox({
    message: 'Toggle with Space, confirm with Enter:',
    choices: DOMAINS.map(d => {
      const info = DOMAIN_INFO[d];
      const colorFn = (chalk as any)[info.color] || chalk.white;
      return {
        name: colorFn(`[✓] ${info.name}`) + chalk.gray(` - ${info.desc}`) + '\n' +
              chalk.gray(`      Risk: ${info.risk}`),
        value: d,
        checked: true,
      };
    }),
  }) as Domain[];

  if (config.domains.length === 0) {
    console.log(chalk.red('\n  ✗ At least one domain must be selected\n'));
    process.exit(1);
  }

  // ==========================================
  // STEP 4: DATA STORAGE
  // ==========================================
  clearScreen();
  printStepHeader(4, 6, 'Data Storage');

  console.log(chalk.white('  Where should claudefi store your trading data?'));
  console.log();

  config.storageType = await select({
    message: 'Select storage:',
    choices: [
      {
        name: chalk.green('● Local SQLite') + chalk.gray(' (Simple)') + '\n' +
              chalk.gray('    Stores everything on your machine.\n') +
              chalk.gray('    No external services needed.\n') +
              chalk.gray('    Good for: Getting started quickly.'),
        value: 'sqlite' as const,
      },
      {
        name: chalk.cyan('○ Supabase') + chalk.gray(' (Cloud)') + '\n' +
              chalk.gray('    Stores data in the cloud.\n') +
              chalk.gray('    Access from anywhere, automatic backups.\n') +
              chalk.gray('    Good for: Running on servers, multiple devices.'),
        value: 'supabase' as const,
      },
    ],
  });

  if (config.storageType === 'supabase') {
    console.log();
    console.log(chalk.white('  Great choice! Let\'s connect your Supabase project.'));
    console.log();
    console.log(chalk.gray('  1. Go to: https://supabase.com/dashboard'));
    console.log(chalk.gray('  2. Create a new project (or use existing)'));
    console.log(chalk.gray('  3. Go to Settings → API'));
    console.log();

    config.supabaseUrl = await input({
      message: 'Supabase URL:',
      validate: (value) => {
        if (!value.includes('supabase.co')) {
          return 'Please enter a valid Supabase URL';
        }
        return true;
      },
    });

    config.supabaseKey = await password({
      message: 'Service Role Key:',
      validate: (value) => {
        if (value.length < 100) {
          return 'Please enter a valid service role key';
        }
        return true;
      },
    });

    // Test connection
    const spinner = ora('Testing Supabase connection...').start();
    try {
      const supabase = createClient(config.supabaseUrl, config.supabaseKey);
      await supabase.from('agent_config').select('id').limit(1);
      spinner.succeed(chalk.green('Connected to Supabase successfully'));
    } catch (error) {
      spinner.fail(chalk.red('Supabase connection failed'));
      console.log(chalk.gray('  Falling back to SQLite.'));
      config.storageType = 'sqlite';
    }
  }

  // ==========================================
  // STEP 5: ADVANCED SETTINGS
  // ==========================================
  clearScreen();
  printStepHeader(5, 6, 'Advanced Settings (Optional)');

  console.log(chalk.white('  These settings have sensible defaults. Press Enter to skip'));
  console.log(chalk.white('  or select options to customize.'));
  console.log();

  const customizeAdvanced = await confirm({
    message: 'Customize advanced settings?',
    default: false,
  });

  if (customizeAdvanced) {
    // Ralph Wiggum Loop Interval
    console.log();
    console.log(chalk.cyan.bold('  Ralph Wiggum Loop Interval'));
    console.log(chalk.gray('  Named after Ralph Wiggum for his relentless persistence.'));
    console.log(chalk.gray('  The loop: OBSERVE → THINK → ACT → LEARN → REPEAT'));
    console.log();

    const interval = await select({
      message: 'How often should the loop run?',
      choices: [
        { name: '15 minutes  ' + chalk.gray('(More active, higher API costs)'), value: 900000 },
        { name: '30 minutes  ' + chalk.gray('(Recommended balance)'), value: 1800000 },
        { name: '1 hour      ' + chalk.gray('(Slower, lower costs)'), value: 3600000 },
        { name: '2 hours     ' + chalk.gray('(Minimal activity)'), value: 7200000 },
      ],
    });
    config.cycleIntervalMs = interval;

    // Firecrawl
    console.log();
    console.log(chalk.cyan.bold('  Firecrawl API'));
    console.log(chalk.gray('  Firecrawl enables web research for market sentiment.'));
    console.log(chalk.gray('  Get a key at: https://firecrawl.dev'));
    console.log();

    const firecrawlKey = await input({
      message: 'Firecrawl API Key (optional, press Enter to skip):',
      default: '',
    });
    if (firecrawlKey) {
      config.firecrawlApiKey = firecrawlKey;
      console.log(chalk.green('  ✓ Firecrawl connected - market research enabled'));
    }

    // Confidence Threshold
    console.log();
    console.log(chalk.cyan.bold('  Confidence Threshold'));
    console.log(chalk.gray('  Minimum confidence required to execute trades.'));
    console.log();

    const confidence = await select({
      message: 'Select confidence threshold:',
      choices: [
        { name: '50% ' + chalk.gray('(More trades, higher risk)'), value: 0.5 },
        { name: '60% ' + chalk.gray('(Balanced)'), value: 0.6 },
        { name: '70% ' + chalk.gray('(Conservative)'), value: 0.7 },
        { name: '80% ' + chalk.gray('(Very conservative)'), value: 0.8 },
      ],
    });
    config.confidenceThreshold = confidence;
  }

  // ==========================================
  // STEP 6: HOW CLAUDEFI WORKS
  // ==========================================
  clearScreen();
  printStepHeader(6, 6, 'How claudefi Works');

  console.log(chalk.white('  Before we start, here\'s how claudefi operates:'));
  console.log();

  printBox([
    chalk.cyan.bold('THE RALPH LOOP'),
    '',
    `Every ${config.cycleIntervalMs! / 60000} minutes, claudefi runs this cycle:`,
    '',
    '  OBSERVE → THINK → ACT → LEARN → REPEAT',
    '',
    '1. Fetches live market data across all domains',
    '2. Runs parallel Claude subagents (one per domain)',
    '3. Validates decisions through safety hooks',
    '4. Executes approved trades',
    '5. Builds memory from outcomes',
  ]);

  await input({ message: chalk.gray('Press Enter to continue...'), default: '' });
  console.log();

  printBox([
    chalk.cyan.bold('SUBAGENTS'),
    '',
    'claudefi runs 4 specialized Claude instances:',
    '',
    chalk.blue('🔵 DLMM Agent') + '      Liquidity provision on Meteora',
    chalk.magenta('🟣 Perps Agent') + '     Futures trading on Hyperliquid',
    chalk.green('🟢 Poly Agent') + '      Prediction market trading',
    chalk.yellow('🟡 Spot Agent') + '      Memecoin momentum on Jupiter',
    '',
    'Each agent has its own prompts, MCP servers, and memory.',
    'They run in parallel and learn from their trades.',
  ]);

  await input({ message: chalk.gray('Press Enter to continue...'), default: '' });
  console.log();

  printBox([
    chalk.cyan.bold('SKILLS & LEARNING'),
    '',
    'claudefi learns from every trade:',
    '',
    '• Losses become warnings',
    '  "High APR pools often have rug risk"',
    '',
    '• Wins become patterns',
    '  "SOL pools outperform during uptrends"',
    '',
    'Skills are auto-generated from trade outcomes.',
    'The agent that runs today is smarter than yesterday.',
    '',
    'Memory has TTL: warnings expire after 60 days,',
    'patterns last 90. Similar memories merge.',
  ]);

  await input({ message: chalk.gray('Press Enter to continue...'), default: '' });
  console.log();

  printBox([
    chalk.cyan.bold('SAFETY HOOKS'),
    '',
    'Built-in protections:',
    '',
    '• Global drawdown limit: -15% stops all trading',
    '• Domain drawdown: -20% halves position sizes',
    '• Max 3 positions per domain',
    `• Minimum ${Math.round(config.confidenceThreshold! * 100)}% confidence to execute`,
    '• Human approval for trades > $500',
    '',
    'You can customize these in the config modal (^C).',
  ]);

  await input({ message: chalk.gray('Press Enter to finish setup...'), default: '' });

  // ==========================================
  // BALANCE CONFIGURATION
  // ==========================================
  clearScreen();
  console.log();
  console.log(chalk.white('  One last thing - starting balance per domain:'));
  console.log();

  const balanceInput = await input({
    message: 'Starting balance per domain ($):',
    default: '2500',
    validate: (value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num <= 0) {
        return 'Please enter a valid positive number';
      }
      return true;
    },
  });
  config.balancePerDomain = parseFloat(balanceInput);

  return config as SetupConfig;
}

async function executeSetup(config: SetupConfig): Promise<void> {
  clearScreen();

  // Show summary
  console.log(chalk.cyan('  ┌' + '─'.repeat(52) + '┐'));
  console.log(chalk.cyan('  │') + chalk.white.bold('  Ready to Launch!'.padEnd(52)) + chalk.cyan('│'));
  console.log(chalk.cyan('  └' + '─'.repeat(52) + '┘'));
  console.log();
  console.log(chalk.white('  Here\'s your configuration:'));
  console.log();

  printBox([
    `Mode:      ${config.paperTrading ? chalk.green('Paper Trading') : chalk.yellow('Real Trading')}`,
    `Domains:   ${config.domains.map(d => DOMAIN_INFO[d].name).join(', ')}`,
    `Storage:   ${config.storageType === 'sqlite' ? 'Local SQLite' : 'Supabase (Cloud)'}`,
    `Balance:   $${config.balancePerDomain} per domain ($${config.balancePerDomain * config.domains.length} total)`,
  ]);

  console.log();
  const proceed = await confirm({
    message: 'Ready to start?',
    default: true,
  });

  if (!proceed) {
    console.log(chalk.gray('\n  Setup cancelled\n'));
    return;
  }

  console.log();

  // Step 1: Create .env file
  const spinner1 = ora('Creating .env file').start();
  try {
    await createEnvFile(config);
    spinner1.succeed('Created .env file');
  } catch (error) {
    spinner1.fail('Failed to create .env file');
    throw error;
  }

  // Step 2: Initialize database
  const spinner2 = ora('Initializing database').start();
  try {
    if (config.storageType === 'sqlite') {
      // Prisma will create SQLite file automatically on first use
      spinner2.succeed('Database ready (SQLite)');
    } else if (config.supabaseUrl && config.supabaseKey) {
      const supabase = createClient(config.supabaseUrl, config.supabaseKey);
      await initializeAgentConfig(supabase, config);
      spinner2.succeed('Database ready (Supabase)');
    }
  } catch (error) {
    spinner2.fail('Database initialization failed');
    console.log(chalk.red(`\n  Error: ${(error as Error).message}\n`));
    process.exit(1);
  }

  // Success message
  console.log();
  console.log(chalk.green.bold('  ✓ Configuration saved to .env'));
  console.log(chalk.green.bold('  ✓ Database initialized'));
  console.log();
  console.log(chalk.gray('  ───────────────────────────────────────────────────────'));
  console.log();
  console.log(chalk.white('  You\'re all set! Here\'s how to run claudefi:'));
  console.log();
  console.log(chalk.cyan('    bun cli:run') + chalk.gray('       Start the trading loop'));
  console.log(chalk.cyan('    bun cli:monitor') + chalk.gray('   Watch live dashboard'));
  console.log(chalk.cyan('    bun cli chat') + chalk.gray('      Talk to your agent'));
  console.log(chalk.cyan('    bun cli:status') + chalk.gray('    Check portfolio'));
  console.log(chalk.cyan('    bun cli learn') + chalk.gray('     Review how claudefi works'));
  console.log();
  console.log(chalk.white('  Happy trading! 🚀'));
  console.log();
  console.log(chalk.gray('  web: ') + chalk.cyan('claudefi.com') +
              chalk.gray('  ·  x: ') + chalk.cyan('@claudefi11') +
              chalk.gray('  ·  discord: ') + chalk.cyan('discord.gg/nzW8srS9'));
  console.log();
}

async function createEnvFile(config: SetupConfig): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');

  let envContent = `# Claudefi Configuration
# Generated by setup wizard

# Anthropic API Key (required)
ANTHROPIC_API_KEY=${config.anthropicApiKey}

# Trading Mode
PAPER_TRADING=${config.paperTrading}

# Active Domains
ACTIVE_DOMAINS=${config.domains.join(',')}

# Ralph Wiggum Loop Interval (ms)
CYCLE_INTERVAL_MS=${config.cycleIntervalMs}

# Confidence Threshold (0.0 - 1.0)
CONFIDENCE_THRESHOLD=${config.confidenceThreshold}

# Data Storage
DATA_PROVIDER=${config.storageType === 'sqlite' ? 'prisma' : 'supabase'}
${config.storageType === 'sqlite' ? 'DATABASE_URL="file:./claudefi.db"' : ''}
`;

  if (config.storageType === 'supabase' && config.supabaseUrl && config.supabaseKey) {
    envContent += `
# Supabase
SUPABASE_URL=${config.supabaseUrl}
SUPABASE_SERVICE_ROLE_KEY=${config.supabaseKey}
`;
  }

  if (config.firecrawlApiKey) {
    envContent += `
# Firecrawl (for market research)
FIRECRAWL_API_KEY=${config.firecrawlApiKey}
`;
  }

  if (!config.paperTrading) {
    envContent += `
# Wallet Keys (KEEP THESE SECRET!)
`;
    if (config.solanaWallet) {
      envContent += `SOLANA_PRIVATE_KEY=${config.solanaWallet.privateKey}
`;
    }
    if (config.ethereumWallet) {
      envContent += `ETHEREUM_PRIVATE_KEY=${config.ethereumWallet.privateKey}
`;
    }
    if (config.hyperliquidApiKey) {
      envContent += `HYPERLIQUID_API_KEY=${config.hyperliquidApiKey}
HYPERLIQUID_API_SECRET=${config.hyperliquidApiSecret || ''}
`;
    }
    if (config.polymarketApiKey) {
      envContent += `POLYMARKET_API_KEY=${config.polymarketApiKey}
POLYMARKET_API_SECRET=${config.polymarketApiSecret || ''}
POLYMARKET_PASSPHRASE=${config.polymarketPassphrase || ''}
`;
    }
  }

  await fs.writeFile(envPath, envContent, 'utf-8');
}

async function initializeAgentConfig(supabase: any, config: SetupConfig): Promise<void> {
  const { data } = await supabase
    .from('agent_config')
    .select('id')
    .limit(1);

  const configData = {
    paper_trading: config.paperTrading,
    active_domains: config.domains,
    dlmm_balance: config.domains.includes('dlmm') ? config.balancePerDomain : 0,
    perps_balance: config.domains.includes('perps') ? config.balancePerDomain : 0,
    polymarket_balance: config.domains.includes('polymarket') ? config.balancePerDomain : 0,
    spot_balance: config.domains.includes('spot') ? config.balancePerDomain : 0,
    cycle_interval_ms: config.cycleIntervalMs,
    confidence_threshold: config.confidenceThreshold,
    updated_at: new Date().toISOString(),
  };

  if (data && data.length > 0) {
    await supabase
      .from('agent_config')
      .update(configData)
      .eq('id', data[0].id);
  } else {
    await supabase
      .from('agent_config')
      .insert({
        name: 'claudefi',
        ...configData,
      });
  }
}
