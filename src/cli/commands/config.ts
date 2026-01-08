/**
 * Config Command - View/edit configuration
 *
 * Usage:
 *   claudefi config              - Show all config
 *   claudefi config <key>        - Get specific key
 *   claudefi config <key> <val>  - Set specific key
 */

import chalk from 'chalk';
import * as fs from 'fs/promises';
import * as path from 'path';

export async function configCommand(key?: string, value?: string): Promise<void> {
  console.log('\n');
  console.log(chalk.cyan('  ─── claudefi config ───'));
  console.log('\n');

  // Try to read .env file
  const envPath = path.join(process.cwd(), '.env');

  try {
    const envContent = await fs.readFile(envPath, 'utf-8');
    const lines = envContent.split('\n').filter(line => line && !line.startsWith('#'));

    if (!key) {
      // Show all config
      for (const line of lines) {
        const [k, v] = line.split('=');
        if (k && v) {
          // Mask sensitive values
          const masked = k.includes('KEY') || k.includes('SECRET')
            ? '***'
            : v;
          console.log(chalk.gray(`  ${k}=`) + chalk.white(masked));
        }
      }
      console.log('\n');
      return;
    }

    if (value) {
      // Set config value
      console.log(chalk.yellow('  config set not yet implemented'));
      console.log(chalk.gray('  edit .env file directly for now\n'));
      return;
    }

    // Get specific key
    const match = lines.find(line => line.startsWith(`${key}=`));
    if (match) {
      const [, v] = match.split('=');
      const masked = key.includes('KEY') || key.includes('SECRET') ? '***' : v;
      console.log(chalk.gray(`  ${key}=`) + chalk.white(masked));
    } else {
      console.log(chalk.yellow(`  ${key} not found`));
    }
    console.log('\n');

  } catch (error) {
    console.log(chalk.red('  no .env file found'));
    console.log(chalk.gray('  run `claudefi init` to create one\n'));
  }
}
