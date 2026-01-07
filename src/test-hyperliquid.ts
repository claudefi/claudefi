/**
 * Hyperliquid API Test
 */

import 'dotenv/config';
import { hyperliquidClient } from './clients/hyperliquid/client.js';

async function main() {
  console.log('🧪 HYPERLIQUID API TEST');
  console.log('========================\n');

  // Test 1: Get markets
  console.log('--- Test 1: Get Markets ---');
  const markets = await hyperliquidClient.getMarkets();
  console.log('✅ Fetched', markets.length, 'markets');

  const btc = markets.find(m => m.symbol === 'BTC');
  const eth = markets.find(m => m.symbol === 'ETH');
  const sol = markets.find(m => m.symbol === 'SOL');

  if (btc) console.log('   BTC:', btc.markPrice.toFixed(2), '| Max Leverage:', btc.maxLeverage);
  if (eth) console.log('   ETH:', eth.markPrice.toFixed(2), '| Max Leverage:', eth.maxLeverage);
  if (sol) console.log('   SOL:', sol.markPrice.toFixed(2), '| Max Leverage:', sol.maxLeverage);

  // Test 2: Get mark price
  console.log('\n--- Test 2: Get Mark Price ---');
  const btcPrice = await hyperliquidClient.getMarkPrice('BTC');
  console.log('✅ BTC Mark Price:', btcPrice.toFixed(2));

  // Test 3: Simulate order
  console.log('\n--- Test 3: Simulate Order ---');
  const sim = await hyperliquidClient.simulateOrder('ETH', 'LONG', 1000);
  console.log('✅ Simulated LONG ETH $1000');
  console.log('   Fill Price:', sim.fillPrice.toFixed(2));
  console.log('   Order ID:', sim.orderId);

  // Test 4: Calculate liquidation
  console.log('\n--- Test 4: Calculate Liquidation Price ---');
  const liqLong = hyperliquidClient.calculateLiquidationPrice(btcPrice, 'LONG', 10);
  const liqShort = hyperliquidClient.calculateLiquidationPrice(btcPrice, 'SHORT', 10);
  console.log('✅ BTC 10x LONG liq:', liqLong.toFixed(2));
  console.log('✅ BTC 10x SHORT liq:', liqShort.toFixed(2));

  console.log('\n========================');
  console.log('✅ Hyperliquid API working');
}

main().catch(console.error);
