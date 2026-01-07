/**
 * Config Test Script
 * Run with: npx tsx src/test-config.ts
 */

import 'dotenv/config';
import { getConfig, logConfig, validateConfig } from './config.js';

console.log('Testing Claudefi Configuration\n');

// Log the full config
logConfig();

// Get and display raw config
const config = getConfig();
console.log('\nRaw Config Values:');
console.log(`  Trading Mode: ${config.mode}`);
console.log(`  Is Paper: ${config.isPaperTrading}`);
console.log(`  Is Testnet: ${config.isTestnet}`);
console.log(`  Is Mainnet: ${config.isMainnet}`);
console.log(`  Solana RPC: ${config.network.solanaRpc.substring(0, 50)}...`);
console.log(`  Hyperliquid API: ${config.network.hyperliquidApi}`);
console.log(`  Solana Wallet: ${config.wallets.solana ? 'Set' : 'Not set'}`);
console.log(`  Hyperliquid Wallet: ${config.wallets.hyperliquid ? 'Set' : 'Not set'}`);

// Validate
const validation = validateConfig();
console.log('\nValidation:');
console.log(`  Valid: ${validation.valid}`);
if (validation.warnings.length) {
  console.log('  Warnings:', validation.warnings);
}
if (validation.errors.length) {
  console.log('  Errors:', validation.errors);
}
