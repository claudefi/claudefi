/**
 * Jupiter API Test Suite
 * Tests Swap API (no key) and Tokens V2 API (requires key)
 */

import 'dotenv/config';
import { jupiterClient, TOKENS } from './clients/jupiter/client.js';

async function main() {
  console.log('🧪 JUPITER API TEST SUITE');
  console.log('============================\n');

  const hasApiKey = jupiterClient.hasApiKey();
  console.log(`API Key: ${hasApiKey ? '✅ Configured' : '⚠️ Not set (Tokens V2 will be skipped)'}`);

  // Test 1: Get price
  console.log('--- Test 1: Get Price (SOL) ---');
  try {
    const price = await jupiterClient.getPrice(TOKENS.SOL);
    console.log(`   SOL price: $${price.toFixed(2)}`);
    console.log('   ✅ Price API works');
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // Test 2: Get quote
  console.log('\n--- Test 2: Get Quote (0.01 SOL → USDC) ---');
  try {
    const quote = await jupiterClient.getQuote({
      inputMint: TOKENS.SOL,
      outputMint: TOKENS.USDC,
      amount: 10_000_000, // 0.01 SOL in lamports
    });

    if (quote) {
      const inSol = parseInt(quote.inAmount) / 1e9;
      const outUsdc = parseInt(quote.outAmount) / 1e6;
      console.log(`   Input:  ${inSol} SOL`);
      console.log(`   Output: ${outUsdc.toFixed(4)} USDC`);
      console.log(`   Price Impact: ${(parseFloat(quote.priceImpactPct) * 100).toFixed(4)}%`);
      console.log(`   Route: ${quote.routePlan?.length || 1} hop(s)`);
      console.log('   ✅ Quote API works');
    } else {
      console.log('   ❌ No quote returned');
    }
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // Test 3: Get USD quote
  console.log('\n--- Test 3: Get USD Quote ($10 SOL → USDC) ---');
  try {
    const result = await jupiterClient.getQuoteUsd({
      inputMint: TOKENS.SOL,
      outputMint: TOKENS.USDC,
      amountUsd: 10,
    });

    if (result) {
      console.log(`   Input:  $${result.inputAmountUsd.toFixed(2)}`);
      console.log(`   Output: $${result.outputAmountUsd.toFixed(2)}`);
      console.log(`   Price Impact: ${(result.priceImpact * 100).toFixed(4)}%`);
      console.log('   ✅ USD Quote API works');
    } else {
      console.log('   ❌ No result returned');
    }
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // Test 4: Simulate swap (paper trading)
  console.log('\n--- Test 4: Simulate Swap (Paper) ---');
  try {
    const simulation = await jupiterClient.simulateSwap({
      inputMint: TOKENS.USDC,
      outputMint: TOKENS.BONK,
      amountUsd: 10,
    });

    if (simulation) {
      console.log(`   Order ID: ${simulation.orderId}`);
      console.log(`   Input:  $${simulation.inputAmountUsd.toFixed(2)} USDC`);
      console.log(`   Output: $${simulation.outputAmountUsd.toFixed(2)} BONK`);
      console.log(`   Execution Price: ${simulation.executionPrice.toFixed(4)}`);
      console.log('   ✅ Paper swap simulation works');
    } else {
      console.log('   ❌ Simulation failed');
    }
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // Test 5: Get multiple prices
  console.log('\n--- Test 5: Get Multiple Prices ---');
  try {
    const mints = [TOKENS.SOL, TOKENS.BONK, TOKENS.WIF, TOKENS.JUP];
    const prices = await jupiterClient.getPrices(mints);

    console.log(`   Found ${prices.size} prices:`);
    for (const [mint, price] of prices) {
      const symbol = Object.entries(TOKENS).find(([_, m]) => m === mint)?.[0] || 'UNKNOWN';
      console.log(`   • ${symbol}: $${price.toFixed(6)}`);
    }
    console.log('   ✅ Batch price API works');
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // ==========================================
  // TOKENS V2 API TESTS (requires API key)
  // ==========================================
  console.log('\n\n🔑 TOKENS V2 API TESTS (requires API key)');
  console.log('------------------------------------------');

  if (hasApiKey) {
    // Test 6: Search tokens
    console.log('\n--- Test 6: Search Tokens V2 ---');
    try {
      const tokens = await jupiterClient.searchTokensV2('BONK');
      if (tokens.length > 0) {
        console.log(`   Found ${tokens.length} results for "BONK":`);
        for (const token of tokens.slice(0, 3)) {
          console.log(`   • ${token.symbol} (${token.name})`);
          console.log(`     Price: $${token.usdPrice?.toFixed(8) || 'N/A'}`);
          console.log(`     MCap: $${token.mcap?.toLocaleString() || 'N/A'}`);
          console.log(`     Organic Score: ${token.organicScoreLabel || 'N/A'}`);
        }
        console.log('   ✅ Token search V2 works');
      } else {
        console.log('   ⚠️ No results (API key may be invalid)');
      }
    } catch (error) {
      console.log('   ❌ Failed:', (error as Error).message);
    }

    // Test 7: Trending tokens
    console.log('\n--- Test 7: Trending Tokens ---');
    try {
      const tokens = await jupiterClient.getTrendingTokens('24h', 5);
      if (tokens.length > 0) {
        console.log(`   Top ${tokens.length} trending tokens (24h):`);
        for (const token of tokens) {
          const priceChange = token.stats24h?.priceChange;
          console.log(`   • ${token.symbol}: $${token.usdPrice?.toFixed(6) || 'N/A'} (${priceChange ? (priceChange > 0 ? '+' : '') + priceChange.toFixed(1) + '%' : 'N/A'})`);
        }
        console.log('   ✅ Trending tokens works');
      } else {
        console.log('   ⚠️ No results');
      }
    } catch (error) {
      console.log('   ❌ Failed:', (error as Error).message);
    }

    // Test 8: Recent tokens
    console.log('\n--- Test 8: Recent Tokens (New Pools) ---');
    try {
      const tokens = await jupiterClient.getRecentTokens();
      if (tokens.length > 0) {
        console.log(`   ${tokens.length} recently created tokens:`);
        for (const token of tokens.slice(0, 3)) {
          console.log(`   • ${token.symbol}: ${token.name}`);
          console.log(`     First Pool: ${token.firstPool?.createdAt || 'N/A'}`);
          console.log(`     Liquidity: $${token.liquidity?.toLocaleString() || 'N/A'}`);
        }
        console.log('   ✅ Recent tokens works');
      } else {
        console.log('   ⚠️ No results');
      }
    } catch (error) {
      console.log('   ❌ Failed:', (error as Error).message);
    }
  } else {
    console.log('   ⚠️ Skipped - Set JUPITER_API_KEY to test Tokens V2 API');
    console.log('   Get an API key at: https://portal.jup.ag');
  }

  console.log('\n============================');
  console.log('📋 SUMMARY');
  console.log('============================');
  console.log('Swap API (lite-api): No API key required');
  console.log('Tokens V2 API: Requires API key from portal.jup.ag');
  console.log('');
  console.log('Swap API Endpoints (lite-api.jup.ag):');
  console.log('  • /swap/v1/quote - Get swap quote');
  console.log('  • /swap/v1/swap - Get swap transaction');
  console.log('');
  console.log('Tokens V2 Endpoints (api.jup.ag, requires key):');
  console.log('  • /tokens/v2/search - Search tokens');
  console.log('  • /tokens/v2/{category}/{interval} - Category tokens');
  console.log('  • /tokens/v2/recent - Recently created tokens');
  console.log('============================\n');
}

main().catch(console.error);
