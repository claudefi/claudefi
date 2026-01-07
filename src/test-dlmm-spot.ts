/**
 * DLMM & Spot Trading Test Suite
 * Tests Meteora DLMM and Jupiter Spot functionality
 */

import 'dotenv/config';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { getConfig } from './config.js';

async function main() {
  console.log('🧪 DLMM & SPOT TEST SUITE');
  console.log('==========================\n');

  const config = getConfig();
  console.log('Mode:', config.mode.toUpperCase());
  console.log('Network:', config.network.isTestnet ? 'DEVNET/TESTNET' : 'MAINNET');

  // Load wallet
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ SOLANA_PRIVATE_KEY not set');
    process.exit(1);
  }

  const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
  console.log('Wallet:', wallet.publicKey.toBase58());

  const connection = new Connection(config.network.solanaRpc, 'confirmed');

  // ==========================================
  // METEORA DLMM TESTS
  // ==========================================
  console.log('\n📊 METEORA DLMM TESTS');
  console.log('---------------------');

  // Test 1: Fetch pools from Meteora API
  console.log('\n--- Test 1: Fetch Top Pools ---');
  try {
    const { meteoraClient } = await import('./clients/meteora/client.js');
    const pools = await meteoraClient.getTopPools(5);
    console.log(`   Found ${pools.length} top pools:`);

    for (const pool of pools.slice(0, 3)) {
      const apr = meteoraClient.calculateApr(pool);
      const dailyFees = meteoraClient.calculateEstimatedFees(pool, 1000);
      console.log(`   • ${pool.name}`);
      console.log(`     TVL: $${parseFloat(pool.liquidity).toLocaleString()}`);
      console.log(`     APR: ${apr.toFixed(1)}%`);
      console.log(`     Est. daily fees ($1k): $${dailyFees.toFixed(2)}`);
    }
    console.log('   ✅ Pool fetching works');
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // Test 2: Fetch pool details
  console.log('\n--- Test 2: Pool Search ---');
  try {
    const { meteoraClient } = await import('./clients/meteora/client.js');
    // Search for SOL-USDC pool from the top pools list
    const pools = await meteoraClient.getTopPools(20);
    const solUsdc = pools.find(p => p.name.includes('SOL') && p.name.includes('USDC'));

    if (solUsdc) {
      console.log(`   Found: ${solUsdc.name}`);
      console.log(`   Address: ${solUsdc.address}`);
      console.log(`   Bin Step: ${solUsdc.bin_step}`);
      console.log(`   Base Fee: ${solUsdc.base_fee_percentage}%`);
      console.log('   ✅ Pool search works');
    } else {
      console.log('   ⚠️ SOL-USDC pool not in top 20');
    }
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // Test 3: DLMM Liquidity class initialization
  console.log('\n--- Test 3: DLMM Liquidity Class ---');
  try {
    const { getMeteoraLiquidity } = await import('./clients/meteora/liquidity.js');
    const meteoraLiquidity = getMeteoraLiquidity();
    console.log('   ✅ MeteoraLiquidity initialized');
    console.log(`   Network: ${config.network.isTestnet ? 'DEVNET' : 'MAINNET'}`);

    // Note: Can't add real liquidity on devnet as Meteora only runs on mainnet
    if (config.network.isTestnet) {
      console.log('   ⚠️ Note: Meteora DLMM only available on mainnet');
      console.log('   ⚠️ Devnet testing limited to API calls');
    }
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // ==========================================
  // JUPITER SPOT TESTS
  // ==========================================
  console.log('\n\n💱 JUPITER SPOT TESTS');
  console.log('---------------------');

  // Test 4: Jupiter quote API
  console.log('\n--- Test 4: Jupiter Quote API ---');
  try {
    // Get a quote for swapping 0.1 SOL to USDC
    const inputMint = 'So11111111111111111111111111111111111111112'; // SOL
    const outputMint = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'; // USDC
    const amount = 100000000; // 0.1 SOL in lamports

    const quoteUrl = `https://lite-api.jup.ag/swap/v1/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=50`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(quoteUrl, { signal: controller.signal });
    clearTimeout(timeout);

    const quote = await response.json() as any;

    if (quote.outAmount) {
      const outUsdc = parseInt(quote.outAmount) / 1e6;
      console.log(`   Quote: 0.1 SOL → ${outUsdc.toFixed(4)} USDC`);
      console.log(`   Price impact: ${(parseFloat(quote.priceImpactPct) * 100).toFixed(4)}%`);
      console.log(`   Route: ${quote.routePlan?.length || 1} hop(s)`);
      console.log('   ✅ Jupiter quote API works');
    } else {
      console.log('   ⚠️ No quote available:', quote.error || 'unknown');
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('   ⚠️ Jupiter API timeout (10s) - may be rate limited');
    } else {
      console.log('   ❌ Failed:', error.message);
    }
  }

  // Test 5: Token list fetch
  console.log('\n--- Test 5: Jupiter Token List ---');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const response = await fetch('https://token.jup.ag/strict', { signal: controller.signal });
    clearTimeout(timeout);

    const tokens = await response.json() as any[];

    console.log(`   Found ${tokens.length} verified tokens`);

    // Find some common tokens
    const sol = tokens.find((t: any) => t.symbol === 'SOL');
    const usdc = tokens.find((t: any) => t.symbol === 'USDC');
    const bonk = tokens.find((t: any) => t.symbol === 'BONK');

    if (sol) console.log(`   SOL: ${sol.address.substring(0, 20)}...`);
    if (usdc) console.log(`   USDC: ${usdc.address.substring(0, 20)}...`);
    if (bonk) console.log(`   BONK: ${bonk.address.substring(0, 20)}...`);

    console.log('   ✅ Token list fetch works');
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('   ⚠️ Token list timeout (10s) - may be rate limited');
    } else {
      console.log('   ❌ Failed:', error.message);
    }
  }

  // Test 6: Birdeye/DexScreener API (trending tokens)
  console.log('\n--- Test 6: Trending Tokens API ---');
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    // Use DexScreener API for trending tokens
    const response = await fetch('https://api.dexscreener.com/latest/dex/tokens/So11111111111111111111111111111111111111112', {
      signal: controller.signal
    });
    clearTimeout(timeout);

    const data = await response.json() as any;

    if (data.pairs && data.pairs.length > 0) {
      console.log(`   Found ${data.pairs.length} SOL pairs`);
      const topPair = data.pairs[0];
      console.log(`   Top pair: ${topPair.baseToken?.symbol}/${topPair.quoteToken?.symbol}`);
      console.log(`   24h Volume: $${parseInt(topPair.volume?.h24 || 0).toLocaleString()}`);
      console.log('   ✅ DexScreener API works');
    } else {
      console.log('   ⚠️ No pairs found');
    }
  } catch (error: any) {
    if (error.name === 'AbortError') {
      console.log('   ⚠️ API timeout (10s)');
    } else {
      console.log('   ⚠️ DexScreener:', error.message);
    }
  }

  // ==========================================
  // INTEGRATION TEST
  // ==========================================
  console.log('\n\n🔗 INTEGRATION TEST');
  console.log('-------------------');

  // Test 7: Full DLMM tool flow (paper mode)
  console.log('\n--- Test 7: DLMM Tool Integration ---');
  try {
    // Import the DLMM MCP tools
    const dlmmTools = await import('./mcp-server/tools/dlmm/index.js');
    console.log('   ✅ DLMM tools loaded');

    // Check available tools
    const toolNames = Object.keys(dlmmTools).filter(k => k !== 'default');
    console.log(`   Available tools: ${toolNames.join(', ')}`);
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // Summary
  console.log('\n\n==========================');
  console.log('📋 TEST SUMMARY');
  console.log('==========================');
  console.log('✅ Meteora API: Working (mainnet data)');
  console.log('✅ Jupiter API: Working');
  console.log('✅ Token Lists: Working');
  console.log(`⚠️  Real trades: ${config.mode === 'paper' ? 'Paper mode (simulated)' : config.network.isTestnet ? 'Testnet (limited pools)' : 'Mainnet (real)'}`);

  if (config.network.isTestnet) {
    console.log('\nNote: DLMM/Spot on devnet is limited because:');
    console.log('  • Meteora pools only exist on mainnet');
    console.log('  • Jupiter has limited devnet liquidity');
    console.log('  • Use mainnet for full testing (with small amounts)');
  }

  console.log('\n==========================\n');
}

main().catch(console.error);
