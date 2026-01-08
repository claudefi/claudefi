/**
 * Chat Command
 *
 * Interactive chat with claudefi - the autonomous trading agent.
 * Uses the same Anthropic SDK pattern as the trading loop.
 */

import chalk from 'chalk';
import readline from 'readline';
import { initDatabase } from '../../db/index.js';
import { AgentChatSession } from '../../chat/session.js';

// =============================================================================
// CLI INTERFACE
// =============================================================================

/**
 * Create readline interface with nice prompt
 */
function createReadline(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.cyan('you: '),
  });
}

/**
 * Print claudefi's response with formatting
 */
function printResponse(text: string): void {
  console.log();
  console.log(chalk.green('claudefi: ') + text);
  console.log();
}

/**
 * Print welcome message
 */
function printWelcome(): void {
  console.log();
  console.log(chalk.cyan.bold('  claudefi chat'));
  console.log(chalk.gray('  Talk to claudefi about your agents and portfolio'));
  console.log(chalk.gray('  Type "exit" or "quit" to leave'));
  console.log();
}

// =============================================================================
// MAIN COMMAND
// =============================================================================

export async function chatCommand(): Promise<void> {
  // Initialize
  console.log(chalk.gray('  Initializing...'));

  try {
    await initDatabase();
  } catch (error) {
    console.error(chalk.red('  Failed to initialize database:'), error);
    process.exit(1);
  }

  let session: AgentChatSession;
  try {
    session = await AgentChatSession.create();
  } catch (error) {
    console.error(chalk.red('  Failed to start chat session:'), error);
    process.exit(1);
  }

  // Setup readline
  const rl = createReadline();

  printWelcome();
  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    // Handle exit
    if (input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
      console.log(chalk.gray('\n  Goodbye!\n'));
      rl.close();
      process.exit(0);
    }

    // Handle empty input
    if (!input) {
      rl.prompt();
      return;
    }

    // Handle special commands
    if (input.startsWith('/')) {
      if (input === '/clear') {
        session.clear();
        console.log(chalk.gray('  Conversation cleared.'));
        rl.prompt();
        return;
      }
      if (input === '/help') {
        console.log();
        console.log(chalk.gray('  Commands:'));
        console.log(chalk.gray('    /clear  - Clear conversation history'));
        console.log(chalk.gray('    /help   - Show this help'));
        console.log(chalk.gray('    exit    - Exit chat'));
        console.log();
        rl.prompt();
        return;
      }
      console.log(chalk.gray(`  Unknown command: ${input}`));
      rl.prompt();
      return;
    }

    try {
      const { response } = await session.sendMessage(input, {
        onToolCall: ({ name }) => console.log(chalk.gray(`  [tool] ${name}`)),
      });

      printResponse(response);
    } catch (error) {
      console.error(
        chalk.red('\n  Error:'),
        error instanceof Error ? error.message : error
      );
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
