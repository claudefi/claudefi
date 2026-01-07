/**
 * Spot Tools Test
 * Tests the updated spot tools with Jupiter V2 API
 */

import 'dotenv/config';
import { spotTools, handleSpotTool } from './mcp-server/tools/spot/index.js';
import { jupiterClient } from './clients/jupiter/client.js';

async function main() {
  console.log('🧪 SPOT TOOLS TEST');
  console.log('==================\n');

  console.log('Jupiter API Key:', jupiterClient.hasApiKey() ? '✅ Set' : '❌ Not set');

  console.log('\nAvailable Spot Tools:');
  for (const tool of spotTools) {
    console.log(`  • ${tool.name}`);
  }

  // Test 1: Trending tokens
  console.log('\n--- Test 1: spot_trending_tokens ---');
  try {
    const result = await handleSpotTool('spot_trending_tokens', {
      category: 'toptrending',
      interval: '24h',
      limit: 5,
    }) as any;

    if (result.tokens) {
      console.log(`   Source: ${result.source}`);
      console.log(`   Found ${result.count} tokens:`);
      for (const token of result.tokens.slice(0, 3)) {
        console.log(`   • ${token.symbol}: ${token.price} (${token.change24h})`);
        console.log(`     MCap: ${token.mcap}, Organic: ${token.organicScore}`);
      }
      console.log('   ✅ Works');
    } else {
      console.log('   ❌', result.error);
    }
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // Test 2: Recent tokens
  console.log('\n--- Test 2: spot_recent_tokens ---');
  try {
    const result = await handleSpotTool('spot_recent_tokens', {}) as any;

    if (result.tokens) {
      console.log(`   Source: ${result.source}`);
      console.log(`   Found ${result.count} new tokens:`);
      for (const token of result.tokens.slice(0, 3)) {
        console.log(`   • ${token.symbol}: ${token.name}`);
        console.log(`     First Pool: ${token.firstPool}`);
      }
      console.log('   ✅ Works');
    } else {
      console.log('   ❌', result.error);
    }
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // Test 3: Search token
  console.log('\n--- Test 3: spot_search_token ---');
  try {
    const result = await handleSpotTool('spot_search_token', {
      query: 'BONK',
    }) as any;

    if (result.tokens) {
      console.log(`   Source: ${result.source}`);
      console.log(`   Found ${result.count} results for "${result.query}":`);
      for (const token of result.tokens.slice(0, 3)) {
        console.log(`   • ${token.symbol}: ${token.name}`);
        console.log(`     Mint: ${token.mint.substring(0, 20)}...`);
      }
      console.log('   ✅ Works');
    } else {
      console.log('   ❌', result.message || result.error);
    }
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  // Test 4: Fetch tokens (should use Jupiter V2)
  console.log('\n--- Test 4: spot_fetch_tokens ---');
  try {
    const result = await handleSpotTool('spot_fetch_tokens', {
      limit: 5,
      minLiquidity: 100000,
    }) as any;

    if (result.tokens) {
      console.log(`   Source: ${result.source}`);
      console.log(`   Found ${result.count} tokens:`);
      for (const token of result.tokens.slice(0, 3)) {
        console.log(`   • ${token.symbol}: ${token.price}`);
      }
      console.log('   ✅ Works');
    } else {
      console.log('   ❌ Error');
    }
  } catch (error) {
    console.log('   ❌ Failed:', (error as Error).message);
  }

  console.log('\n==================');
  console.log('✅ Spot tools updated with Jupiter V2 API');
  console.log('==================\n');
}

main().catch(console.error);
