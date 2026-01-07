/**
 * Polymarket CLOB Client Test
 * Tests connection and basic functionality
 */

import 'dotenv/config';
import { ClobClient, Side } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { gammaClient } from './clients/polymarket/client.js';

const HOST = 'https://clob.polymarket.com';
const CHAIN_ID = 137; // Polygon

async function main() {
  console.log('🧪 POLYMARKET CLOB CLIENT TEST');
  console.log('================================\n');

  // Use env var or generate test wallet
  let privateKey = process.env.POLYMARKET_PRIVATE_KEY;

  if (!privateKey) {
    console.log('⚠️  No POLYMARKET_PRIVATE_KEY found, generating test wallet...\n');
    const testWallet = Wallet.createRandom();
    privateKey = testWallet.privateKey;
    console.log('Test Wallet Address:', testWallet.address);
    console.log('Test Private Key:', privateKey);
    console.log('\n⚠️  This wallet has no funds - only testing connection\n');
  }

  const wallet = new Wallet(privateKey);
  console.log('Wallet Address:', wallet.address);

  // Test 1: Create CLOB client
  console.log('\n--- Test 1: Create CLOB Client ---');
  try {
    const tempClient = new ClobClient(HOST, CHAIN_ID, wallet);
    console.log('✅ CLOB client created');

    // Test 2: Derive API credentials
    console.log('\n--- Test 2: Derive API Credentials ---');
    try {
      const apiCreds = await tempClient.createOrDeriveApiKey();
      console.log('✅ API credentials derived');
      console.log('   API Key:', (apiCreds as any).apiKey?.slice(0, 20) + '...');

      // Test 3: Create authenticated client
      console.log('\n--- Test 3: Authenticated Client ---');
      const client = new ClobClient(HOST, CHAIN_ID, wallet, apiCreds, 0);
      console.log('✅ Authenticated client created');

      // Test 4: Get open orders (should be empty for new wallet)
      console.log('\n--- Test 4: Get Open Orders ---');
      try {
        const orders = await client.getOpenOrders();
        console.log(`✅ Open orders: ${orders.length}`);
      } catch (err) {
        console.log('⚠️  Could not fetch orders:', (err as Error).message);
      }

    } catch (err) {
      console.log('❌ API credential derivation failed:', (err as Error).message);
      console.log('   This is expected for wallets that haven\'t interacted with Polymarket');
    }

  } catch (err) {
    console.log('❌ CLOB client creation failed:', (err as Error).message);
  }

  // Test 5: Gamma API (read-only, always works)
  console.log('\n--- Test 5: Gamma API (Read-Only) ---');
  try {
    const markets = await gammaClient.getTrendingMarkets(5);
    console.log(`✅ Fetched ${markets.length} trending markets:`);
    for (const market of markets.slice(0, 3)) {
      const prices = gammaClient.getMarketPrices(market);
      console.log(`   • ${market.question.slice(0, 50)}...`);
      console.log(`     YES: $${prices.yesPrice.toFixed(2)} | NO: $${prices.noPrice.toFixed(2)}`);
    }
  } catch (err) {
    console.log('❌ Gamma API failed:', (err as Error).message);
  }

  console.log('\n================================');
  console.log('📋 SUMMARY');
  console.log('================================');
  console.log('CLOB API requires:');
  console.log('  1. Ethereum wallet with USDC on Polygon');
  console.log('  2. First interaction via Polymarket UI to register');
  console.log('  3. POLYMARKET_PRIVATE_KEY in .env');
  console.log('');
  console.log('To fund wallet:');
  console.log('  1. Go to https://app.polymarket.com');
  console.log('  2. Connect wallet or deposit USDC');
  console.log('  3. Make at least one trade via UI');
  console.log('  4. Then API trading will work');
  console.log('================================\n');
}

main().catch(console.error);
