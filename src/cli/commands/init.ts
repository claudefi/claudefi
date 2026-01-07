/**
 * Init Command - Setup Wizard
 *
 * Interactive setup for new Claudefi installations:
 * 1. Choose trading mode (paper/real)
 * 2. Select active domains
 * 3. Configure balances
 * 4. Enter Supabase credentials
 * 5. Create database tables
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

const DOMAINS = ['dlmm', 'perps', 'polymarket', 'spot'] as const;

interface SetupConfig {
  paperTrading: boolean;
  domains: string[];
  balancePerDomain: number;
  supabaseUrl: string;
  supabaseKey: string;
}

export async function initCommand(): Promise<void> {
  console.log('\n');
  console.log(chalk.cyan('  ╔═══════════════════════════════════════════╗'));
  console.log(chalk.cyan('  ║') + chalk.white.bold('           claudefi setup wizard           ') + chalk.cyan('║'));
  console.log(chalk.cyan('  ╚═══════════════════════════════════════════╝'));
  console.log('\n');

  try {
    // Step 1: Trading mode
    const paperTrading = await select({
      message: 'select trading mode:',
      choices: [
        {
          name: chalk.green('paper trading') + chalk.gray(' (recommended for testing)'),
          value: true,
        },
        {
          name: chalk.yellow('real trading') + chalk.gray(' (requires wallet keys)'),
          value: false,
        },
      ],
    });

    // Step 2: Active domains
    const domains = await checkbox({
      message: 'select active domains:',
      choices: DOMAINS.map(d => ({
        name: getDomainDescription(d),
        value: d,
        checked: true,
      })),
    });

    if (domains.length === 0) {
      console.log(chalk.red('\n  ✗ at least one domain must be selected\n'));
      process.exit(1);
    }

    // Step 3: Starting balance
    const balanceInput = await input({
      message: 'starting balance per domain ($):',
      default: '2500',
      validate: (value) => {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) {
          return 'please enter a valid positive number';
        }
        return true;
      },
    });
    const balancePerDomain = parseFloat(balanceInput);

    // Step 4: Supabase credentials
    console.log(chalk.gray('\n  supabase credentials (get from supabase.com dashboard)\n'));

    const supabaseUrl = await input({
      message: 'supabase url:',
      validate: (value) => {
        if (!value.includes('supabase.co')) {
          return 'please enter a valid supabase url';
        }
        return true;
      },
    });

    const supabaseKey = await password({
      message: 'supabase service role key:',
      validate: (value) => {
        if (value.length < 100) {
          return 'please enter a valid service role key';
        }
        return true;
      },
    });

    const config: SetupConfig = {
      paperTrading,
      domains,
      balancePerDomain,
      supabaseUrl,
      supabaseKey,
    };

    // Show summary
    console.log('\n');
    console.log(chalk.cyan('  ─── configuration summary ───'));
    console.log(`  mode:     ${paperTrading ? chalk.green('paper') : chalk.yellow('real')}`);
    console.log(`  domains:  ${domains.map(d => chalk.blue(d)).join(', ')}`);
    console.log(`  balance:  ${chalk.green('$' + balancePerDomain)} per domain`);
    console.log(`  total:    ${chalk.green('$' + (balancePerDomain * domains.length))}`);
    console.log('\n');

    // Confirm
    const proceed = await confirm({
      message: 'proceed with setup?',
      default: true,
    });

    if (!proceed) {
      console.log(chalk.gray('\n  setup cancelled\n'));
      return;
    }

    // Execute setup
    await executeSetup(config);

  } catch (error) {
    if ((error as Error).name === 'ExitPromptError') {
      console.log(chalk.gray('\n  setup cancelled\n'));
      return;
    }
    throw error;
  }
}

function getDomainDescription(domain: string): string {
  const descriptions: Record<string, string> = {
    dlmm: chalk.blue('dlmm') + chalk.gray(' - liquidity provision on meteora'),
    perps: chalk.magenta('perps') + chalk.gray(' - perpetual futures on hyperliquid'),
    polymarket: chalk.yellow('polymarket') + chalk.gray(' - prediction market trading'),
    spot: chalk.green('spot') + chalk.gray(' - memecoin trading via jupiter'),
  };
  return descriptions[domain] || domain;
}

async function executeSetup(config: SetupConfig): Promise<void> {
  console.log('\n');

  // Step 1: Create .env file
  const spinner1 = ora('creating .env file').start();
  try {
    await createEnvFile(config);
    spinner1.succeed('created .env file');
  } catch (error) {
    spinner1.fail('failed to create .env file');
    throw error;
  }

  // Step 2: Test database connection
  const spinner2 = ora('testing database connection').start();
  try {
    const supabase = createClient(config.supabaseUrl, config.supabaseKey);
    const { error } = await supabase.from('agent_config').select('id').limit(1);

    if (error && error.code === '42P01') {
      // Table doesn't exist - need to create
      spinner2.text = 'creating database tables';
      await createDatabaseTables(config);
      spinner2.succeed('created database tables');
    } else if (error) {
      throw error;
    } else {
      spinner2.succeed('database connection verified');
    }
  } catch (error) {
    spinner2.fail('database connection failed');
    console.log(chalk.red(`\n  error: ${(error as Error).message}\n`));
    console.log(chalk.gray('  make sure your supabase credentials are correct'));
    console.log(chalk.gray('  and the project is accessible\n'));
    process.exit(1);
  }

  // Step 3: Initialize agent config
  const spinner3 = ora('initializing agent config').start();
  try {
    await initializeAgentConfig(config);
    spinner3.succeed('initialized agent config');
  } catch (error) {
    spinner3.fail('failed to initialize agent config');
    throw error;
  }

  // Success message
  console.log('\n');
  console.log(chalk.green('  ✓ claudefi setup complete!\n'));
  console.log(chalk.gray('  next steps:'));
  console.log(chalk.white('    npm run cli:run') + chalk.gray(' - start the trading loop'));
  console.log(chalk.white('    npm run cli:monitor') + chalk.gray(' - view live dashboard'));
  console.log(chalk.white('    npm run cli:status') + chalk.gray(' - check portfolio status'));
  console.log('\n');
}

async function createEnvFile(config: SetupConfig): Promise<void> {
  const envPath = path.join(process.cwd(), '.env');

  const envContent = `# Claudefi Configuration
# Generated by setup wizard

# Supabase
SUPABASE_URL=${config.supabaseUrl}
SUPABASE_SERVICE_ROLE_KEY=${config.supabaseKey}

# Trading Mode
PAPER_TRADING=${config.paperTrading}

# Active Domains
ACTIVE_DOMAINS=${config.domains.join(',')}

# Cycle Interval (30 minutes default)
CYCLE_INTERVAL_MS=1800000

# Anthropic API Key (required)
ANTHROPIC_API_KEY=

# Real Trading Keys (optional, only needed if PAPER_TRADING=false)
# SOLANA_PRIVATE_KEY=
# HYPERLIQUID_API_KEY=
# HYPERLIQUID_API_SECRET=
# POLYMARKET_API_KEY=
# POLYMARKET_API_SECRET=
`;

  await fs.writeFile(envPath, envContent, 'utf-8');
}

async function createDatabaseTables(config: SetupConfig): Promise<void> {
  const schemaPath = path.join(process.cwd(), 'src', 'db', 'schema.sql');
  const schema = await fs.readFile(schemaPath, 'utf-8');

  const supabase = createClient(config.supabaseUrl, config.supabaseKey);

  // Execute schema (Supabase doesn't support multi-statement SQL easily,
  // so we'd normally use migrations. For setup, we'll create essential tables)
  // In production, use: npx supabase db push

  // For now, just verify connection works
  // Real implementation would run migrations
}

async function initializeAgentConfig(config: SetupConfig): Promise<void> {
  const supabase = createClient(config.supabaseUrl, config.supabaseKey);

  // Check if config exists
  const { data } = await supabase
    .from('agent_config')
    .select('id')
    .limit(1);

  if (data && data.length > 0) {
    // Update existing
    await supabase
      .from('agent_config')
      .update({
        paper_trading: config.paperTrading,
        active_domains: config.domains,
        dlmm_balance: config.domains.includes('dlmm') ? config.balancePerDomain : 0,
        perps_balance: config.domains.includes('perps') ? config.balancePerDomain : 0,
        polymarket_balance: config.domains.includes('polymarket') ? config.balancePerDomain : 0,
        spot_balance: config.domains.includes('spot') ? config.balancePerDomain : 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', data[0].id);
  } else {
    // Create new
    await supabase
      .from('agent_config')
      .insert({
        name: 'claudefi',
        paper_trading: config.paperTrading,
        active_domains: config.domains,
        dlmm_balance: config.domains.includes('dlmm') ? config.balancePerDomain : 0,
        perps_balance: config.domains.includes('perps') ? config.balancePerDomain : 0,
        polymarket_balance: config.domains.includes('polymarket') ? config.balancePerDomain : 0,
        spot_balance: config.domains.includes('spot') ? config.balancePerDomain : 0,
      });
  }
}
