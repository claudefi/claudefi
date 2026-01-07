/**
 * Telegram Bot Runner
 *
 * Standalone script to run the Telegram bot for claudefi.
 * Usage: npm run telegram
 */

import 'dotenv/config';
import { startBot, stopBot } from './bot.js';

console.log('');
console.log('='.repeat(50));
console.log('  CLAUDEFI TELEGRAM BOT');
console.log('='.repeat(50));
console.log('');

// Check for token
if (!process.env.TELEGRAM_BOT_TOKEN) {
  console.error('ERROR: TELEGRAM_BOT_TOKEN not set in environment');
  console.log('');
  console.log('To set up the Telegram bot:');
  console.log('1. Message @BotFather on Telegram');
  console.log('2. Send /newbot and follow the prompts');
  console.log('3. Copy the bot token');
  console.log('4. Add to .env: TELEGRAM_BOT_TOKEN=your_token_here');
  console.log('');
  process.exit(1);
}

// Start the bot
startBot()
  .then((bot) => {
    if (bot) {
      console.log('');
      console.log('Bot is running! Commands available:');
      console.log('  /start     - Subscribe to alerts');
      console.log('  /status    - Portfolio status');
      console.log('  /positions - Open positions');
      console.log('  /domains   - Domain breakdown');
      console.log('  /stop      - Pause alerts');
      console.log('  /resume    - Resume alerts');
      console.log('  /help      - Show all commands');
      console.log('');
      console.log('Press Ctrl+C to stop the bot');
    }
  })
  .catch((error) => {
    console.error('Failed to start bot:', error);
    process.exit(1);
  });

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down bot...');
  stopBot();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down bot...');
  stopBot();
  process.exit(0);
});
