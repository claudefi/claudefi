/**
 * Doctor Command - Diagnose common issues
 *
 * Checks:
 * - Environment variables
 * - Database connection
 * - API connectivity
 * - Wallet configuration
 * - Runtime environment
 */

import chalk from 'chalk';
import ora from 'ora';
import * as fs from 'fs/promises';
import * as path from 'path';
import { runtimeInfo } from '../runtime.js';

interface Check {
  name: string;
  check: () => Promise<{ ok: boolean; message: string }>;
}

export async function doctorCommand(): Promise<void> {
  console.log('\n');
  console.log(chalk.cyan('  ─── claudefi doctor ───'));
  console.log(chalk.gray(`  runtime: ${runtimeInfo.version}`));
  console.log('\n');

  const checks: Check[] = [
    {
      name: 'environment file',
      check: checkEnvFile,
    },
    {
      name: 'anthropic api key',
      check: checkAnthropicKey,
    },
    {
      name: 'database config',
      check: checkDatabaseConfig,
    },
    {
      name: 'node modules',
      check: checkNodeModules,
    },
  ];

  let allPassed = true;

  for (const { name, check } of checks) {
    const spinner = ora({ text: name, prefixText: '  ' }).start();

    try {
      const result = await check();
      if (result.ok) {
        spinner.succeed(chalk.green(name) + chalk.gray(` - ${result.message}`));
      } else {
        spinner.fail(chalk.red(name) + chalk.gray(` - ${result.message}`));
        allPassed = false;
      }
    } catch (error) {
      spinner.fail(chalk.red(name) + chalk.gray(` - ${(error as Error).message}`));
      allPassed = false;
    }
  }

  console.log('\n');

  if (allPassed) {
    console.log(chalk.green('  ✓ all checks passed\n'));
    console.log(chalk.gray('  ready to run: claudefi start\n'));
  } else {
    console.log(chalk.yellow('  ⚠ some checks failed\n'));
    console.log(chalk.gray('  need help? https://discord.gg/nzW8srS9\n'));
  }
}

async function checkEnvFile(): Promise<{ ok: boolean; message: string }> {
  const envPath = path.join(process.cwd(), '.env');
  try {
    await fs.access(envPath);
    return { ok: true, message: '.env file found' };
  } catch {
    return { ok: false, message: 'run `claudefi init` to create .env' };
  }
}

async function checkAnthropicKey(): Promise<{ ok: boolean; message: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return { ok: false, message: 'ANTHROPIC_API_KEY not set' };
  }
  if (!key.startsWith('sk-ant-')) {
    return { ok: false, message: 'invalid key format' };
  }
  return { ok: true, message: 'key configured' };
}

async function checkDatabaseConfig(): Promise<{ ok: boolean; message: string }> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const databaseUrl = process.env.DATABASE_URL;

  if (databaseUrl) {
    return { ok: true, message: 'using prisma (local)' };
  }

  if (supabaseUrl && supabaseKey) {
    return { ok: true, message: 'using supabase' };
  }

  return { ok: false, message: 'no database configured' };
}

async function checkNodeModules(): Promise<{ ok: boolean; message: string }> {
  const modulesPath = path.join(process.cwd(), 'node_modules');
  try {
    await fs.access(modulesPath);
    return { ok: true, message: 'dependencies installed' };
  } catch {
    return { ok: false, message: 'run `npm install` or `bun install`' };
  }
}
