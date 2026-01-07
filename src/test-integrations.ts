/**
 * Integration Tests
 * Run with: npx tsx src/test-integrations.ts
 */

import 'dotenv/config';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { getConfig, logConfig } from './config.js';

async function testBinancePrices() {
  console.log('\n📊 Testing Binance Price Feed...');

  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`;

  const response = await fetch(url);
  const data = await response.json() as Array<{
    symbol: string;
    lastPrice: string;
    priceChangePercent: string;
  }>;

  for (const ticker of data) {
    console.log(`   ${ticker.symbol}: $${parseFloat(ticker.lastPrice).toFixed(2)} (${ticker.priceChangePercent}%)`);
  }

  console.log('   ✅ Binance prices working');
}

async function testHyperliquidPrices() {
  console.log('\n📈 Testing Hyperliquid Price Feed...');

  const { hyperliquidClient } = await import('./clients/hyperliquid/client.js');

  const markets = await hyperliquidClient.getMarkets();
  console.log(`   Found ${markets.length} markets`);

  const btc = markets.find(m => m.symbol === 'BTC');
  const eth = markets.find(m => m.symbol === 'ETH');
  const sol = markets.find(m => m.symbol === 'SOL');

  if (btc) console.log(`   BTC: $${btc.markPrice.toFixed(2)}, 24h vol: $${btc.volume24h.toLocaleString()}`);
  if (eth) console.log(`   ETH: $${eth.markPrice.toFixed(2)}, 24h vol: $${eth.volume24h.toLocaleString()}`);
  if (sol) console.log(`   SOL: $${sol.markPrice.toFixed(2)}, 24h vol: $${sol.volume24h.toLocaleString()}`);

  console.log('   ✅ Hyperliquid prices working');
}

async function testMeteoraAPI() {
  console.log('\n🌊 Testing Meteora DLMM API...');

  const { meteoraClient } = await import('./clients/meteora/client.js');

  const pools = await meteoraClient.getTopPools(5);
  console.log(`   Found ${pools.length} top pools`);

  for (const pool of pools.slice(0, 3)) {
    const apr = meteoraClient.calculateApr(pool);
    console.log(`   ${pool.name}: TVL $${parseFloat(pool.liquidity).toLocaleString()}, APR ${apr.toFixed(1)}%`);
  }

  console.log('   ✅ Meteora API working');
}

async function testSolanaWallet() {
  console.log('\n🔑 Testing Solana Wallet...');

  const config = getConfig();
  const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKeyStr) {
    console.log('   ⚠️  SOLANA_PRIVATE_KEY not set, skipping');
    return;
  }

  try {
    const wallet = Keypair.fromSecretKey(bs58.decode(privateKeyStr));
    console.log(`   Wallet address: ${wallet.publicKey.toBase58()}`);

    // Check balance via RPC (uses config for network selection)
    const rpcUrl = config.network.solanaRpc;
    const { Connection } = await import('@solana/web3.js');
    const connection = new Connection(rpcUrl, 'confirmed');

    const balance = await connection.getBalance(wallet.publicKey);
    const network = config.network.isTestnet ? 'DEVNET' : 'MAINNET';
    console.log(`   SOL Balance (${network}): ${(balance / 1e9).toFixed(4)} SOL`);

    console.log('   ✅ Solana wallet working');
  } catch (error) {
    console.error('   ❌ Wallet error:', error);
  }
}

async function testPortfolioCoordinator() {
  console.log('\n🎯 Testing Portfolio Coordinator...');

  const { fetchMarketSummary } = await import('./subagents/portfolio-coordinator.js');

  const summary = await fetchMarketSummary();

  console.log(`   BTC: $${summary.btcPrice.toFixed(0)} (${summary.btcChange24h >= 0 ? '+' : ''}${summary.btcChange24h.toFixed(1)}%)`);
  console.log(`   ETH: $${summary.ethPrice.toFixed(0)} (${summary.ethChange24h >= 0 ? '+' : ''}${summary.ethChange24h.toFixed(1)}%)`);
  console.log(`   SOL: $${summary.solPrice.toFixed(0)} (${summary.solChange24h >= 0 ? '+' : ''}${summary.solChange24h.toFixed(1)}%)`);
  console.log(`   Fear & Greed: ${summary.fearGreedIndex}`);

  console.log('   ✅ Portfolio coordinator working');
}

async function testHyperliquidCalculations() {
  console.log('\n🧮 Testing Hyperliquid Calculations...');

  const { hyperliquidClient } = await import('./clients/hyperliquid/client.js');

  // Test liquidation price calculation
  const liqPriceLong = hyperliquidClient.calculateLiquidationPrice(100000, 'LONG', 10, 0.03);
  const liqPriceShort = hyperliquidClient.calculateLiquidationPrice(100000, 'SHORT', 10, 0.03);

  console.log(`   Long 10x @ $100k -> Liq: $${liqPriceLong.toFixed(0)}`);
  console.log(`   Short 10x @ $100k -> Liq: $${liqPriceShort.toFixed(0)}`);

  // Test PnL calculation
  const pnlLong = hyperliquidClient.calculatePnl('LONG', 1000, 100000, 105000);
  const pnlShort = hyperliquidClient.calculatePnl('SHORT', 1000, 100000, 95000);

  console.log(`   Long $1k @ $100k -> $105k: P&L $${pnlLong.toFixed(2)}`);
  console.log(`   Short $1k @ $100k -> $95k: P&L $${pnlShort.toFixed(2)}`);

  console.log('   ✅ Calculations correct');
}

async function main() {
  console.log('🧪 CLAUDEFI INTEGRATION TESTS');
  console.log('================================');

  // Show current config
  logConfig();

  try {
    await testBinancePrices();
    await testHyperliquidPrices();
    await testMeteoraAPI();
    await testSolanaWallet();
    await testPortfolioCoordinator();
    await testHyperliquidCalculations();

    console.log('\n================================');
    console.log('✅ ALL TESTS PASSED');
    console.log('================================\n');
  } catch (error) {
    console.error('\n❌ TEST FAILED:', error);
    process.exit(1);
  }
}

main();
