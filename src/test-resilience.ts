/**
 * Resilience Modules Integration Test
 *
 * Tests all resilience features:
 * 1. resilientFetch - Retry logic, timeout, error handling
 * 2. TranscriptStore - JSONL logging and rotation
 * 3. ContextManager - Token estimation and pruning
 * 4. IdempotencyService - Duplicate prevention
 * 5. Model Fallback - Model switching on failure
 */

import 'dotenv/config';
import { resilientFetch, ResilientFetchError } from './infra/resilient-fetch.js';
import { TranscriptStore } from './transcripts/store.js';
import type { TranscriptEntry } from './transcripts/types.js';
import { createContextManager } from './context/manager.js';
import { estimateTokens } from './context/tokenizer.js';
import { IdempotencyService } from './services/idempotency.js';
import { MODEL_CHAIN, isRetryableModelError } from './config/models.js';

// Colors for output
const green = (s: string) => `\x1b[32m${s}\x1b[0m`;
const red = (s: string) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`;

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void) {
  return async () => {
    try {
      await fn();
      console.log(green(`  ✓ ${name}`));
      passed++;
    } catch (error) {
      console.log(red(`  ✗ ${name}`));
      console.log(red(`    Error: ${error instanceof Error ? error.message : error}`));
      failed++;
    }
  };
}

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

// =============================================================================
// TEST SUITES
// =============================================================================

async function testResilientFetch() {
  console.log(cyan('\n📡 Testing resilientFetch...'));

  await test('fetches valid URL successfully', async () => {
    const data = await resilientFetch<{ ip: string }>('https://api.ipify.org?format=json');
    assert(typeof data.ip === 'string', 'Should return IP address');
  })();

  await test('throws ResilientFetchError on 404', async () => {
    try {
      await resilientFetch('https://jsonplaceholder.typicode.com/posts/99999999');
      throw new Error('Should have thrown');
    } catch (error) {
      assert(error instanceof ResilientFetchError, 'Should be ResilientFetchError');
      assert(error.statusCode === 404, `Should have 404 status, got ${error.statusCode}`);
    }
  })();

  await test('respects timeout', async () => {
    const start = Date.now();
    try {
      await resilientFetch('https://httpstat.us/200?sleep=5000', {}, { timeoutMs: 1000, maxRetries: 0 });
      throw new Error('Should have thrown');
    } catch (error) {
      const elapsed = Date.now() - start;
      assert(elapsed < 3000, `Should timeout quickly, took ${elapsed}ms`);
    }
  })();

  await test('retries on 500 errors', async () => {
    // This will fail but should retry
    const start = Date.now();
    try {
      await resilientFetch('https://httpstat.us/500', {}, { maxRetries: 2, baseDelayMs: 100 });
    } catch (error) {
      const elapsed = Date.now() - start;
      // Should take at least 200ms for 2 retries with 100ms base delay
      assert(elapsed >= 150, `Should have retried, took ${elapsed}ms`);
    }
  })();
}

async function testTranscriptStore() {
  console.log(cyan('\n📝 Testing TranscriptStore...'));

  const store = new TranscriptStore('.claude/transcripts-test');
  // Use the proper session ID format: YYYY-MM-DD-randomId
  const testSessionId = TranscriptStore.generateSessionId();

  await test('generates valid session IDs', () => {
    const id = TranscriptStore.generateSessionId();
    assert(id.match(/^\d{4}-\d{2}-\d{2}-[a-z0-9]+$/) !== null, 'Should match date-id pattern');
  })();

  await test('appends entries to transcript', async () => {
    const entry: TranscriptEntry = {
      timestamp: new Date().toISOString(),
      role: 'user',
      content: 'Test message',
      metadata: { domain: 'dlmm' },
    };
    await store.append('dlmm', testSessionId, entry);
  })();

  await test('reads transcript entries', async () => {
    const entries = await store.readSession('dlmm', testSessionId);
    assert(entries.length >= 1, 'Should have at least one entry');
    assert(entries[0].content === 'Test message', 'Should have correct content');
  })();

  await test('lists sessions by domain', async () => {
    const sessions = await store.listSessions('dlmm');
    assert(sessions.length > 0, 'Should have sessions');
    assert(sessions.some(s => s === testSessionId), `Should include test session ${testSessionId}`);
  })();

  // Cleanup
  const fs = await import('fs/promises');
  try {
    await fs.rm('.claude/transcripts-test', { recursive: true });
  } catch {}
}

async function testContextManager() {
  console.log(cyan('\n🧠 Testing ContextManager...'));

  const manager = createContextManager();

  await test('estimates tokens correctly', () => {
    const text = 'Hello world, this is a test message.';
    const tokens = estimateTokens(text);
    // ~4 chars per token, so 36 chars ≈ 9 tokens
    assert(tokens >= 5 && tokens <= 15, `Expected ~9 tokens, got ${tokens}`);
  })();

  await test('detects when pruning is needed', () => {
    // Create messages that exceed soft threshold
    const longContent = 'x'.repeat(500000); // ~125k tokens
    const messages = [
      { role: 'user' as const, content: longContent },
      { role: 'assistant' as const, content: longContent },
    ];
    const shouldPrune = manager.shouldPrune(messages);
    assert(shouldPrune === true, 'Should need pruning with 250k+ tokens');
  })();

  await test('prunes old messages while preserving recent', () => {
    const messages = [
      { role: 'system' as const, content: 'System prompt' },
      { role: 'user' as const, content: 'Old message 1' },
      { role: 'assistant' as const, content: 'Old response 1' },
      { role: 'user' as const, content: 'Old message 2' },
      { role: 'assistant' as const, content: 'Old response 2' },
      { role: 'user' as const, content: 'Recent message' },
      { role: 'assistant' as const, content: 'Recent response' },
    ];
    const result = manager.prune(messages);
    // Should keep system prompt and recent messages
    assert(result.pruned.length >= 3, 'Should keep at least system + 2 recent');
    assert(result.pruned[0].content === 'System prompt', 'Should preserve system prompt');
  })();
}

async function testIdempotencyService() {
  console.log(cyan('\n🔒 Testing IdempotencyService...'));

  // Use a short TTL for testing
  const service = new IdempotencyService(5000); // 5 second TTL

  await test('generates deterministic keys', () => {
    const key1 = service.generateKey('dlmm', 'add_liquidity', 'POOL123', 100);
    const key2 = service.generateKey('dlmm', 'add_liquidity', 'POOL123', 100);
    assert(key1 === key2, 'Same params should generate same key');
  })();

  await test('different amounts create different keys', () => {
    const key1 = service.generateKey('dlmm', 'add_liquidity', 'POOL123', 100);
    const key2 = service.generateKey('dlmm', 'add_liquidity', 'POOL123', 200);
    assert(key1 !== key2, 'Different amounts should generate different keys');
  })();

  await test('buckets similar amounts together', () => {
    // $101 and $105 should be in same $10 bucket (100)
    const key1 = service.generateKey('dlmm', 'add_liquidity', 'POOL123', 101);
    const key2 = service.generateKey('dlmm', 'add_liquidity', 'POOL123', 105);
    assert(key1 === key2, 'Similar amounts should bucket together');
  })();

  await test('checkAndReserve works correctly', async () => {
    const result1 = await service.checkAndReserve('perps', 'open_long', 'BTC', 500);
    assert(result1.isDuplicate === false, 'First call should not be duplicate');

    const result2 = await service.checkAndReserve('perps', 'open_long', 'BTC', 500);
    assert(result2.isDuplicate === true, 'Second call should be duplicate');

    // Cleanup
    await service.remove(result1.key);
  })();
}

async function testModelFallback() {
  console.log(cyan('\n🤖 Testing Model Fallback Config...'));

  await test('MODEL_CHAIN has correct structure', () => {
    assert(typeof MODEL_CHAIN.primary === 'string', 'Should have primary model');
    assert(Array.isArray(MODEL_CHAIN.fallbacks), 'Should have fallbacks array');
    assert(MODEL_CHAIN.fallbacks.length >= 1, 'Should have at least one fallback');
    assert(typeof MODEL_CHAIN.cooldownMs === 'number', 'Should have cooldown');
  })();

  await test('isRetryableModelError identifies retryable errors', () => {
    const overloaded = new Error('Model overloaded, please retry');
    const rateLimit = new Error('rate_limit exceeded');
    const timeout = new Error('Request timeout after 30s');
    const status529 = new Error('HTTP 529: Overloaded');
    const authError = new Error('authentication_error');

    assert(isRetryableModelError(overloaded) === true, 'Overloaded should be retryable');
    assert(isRetryableModelError(rateLimit) === true, 'Rate limit should be retryable');
    assert(isRetryableModelError(timeout) === true, 'Timeout should be retryable');
    assert(isRetryableModelError(status529) === true, '529 should be retryable');
    assert(isRetryableModelError(authError) === false, 'Auth error should not be retryable');
  })();
}

async function testApiClients() {
  console.log(cyan('\n🌐 Testing API Client Integration...'));

  await test('Hyperliquid client uses resilientFetch', async () => {
    const { hyperliquidClient } = await import('./clients/hyperliquid/client.js');
    const markets = await hyperliquidClient.getMarkets();
    assert(Array.isArray(markets), 'Should return markets array');
    assert(markets.length > 0, 'Should have markets');
    console.log(`    ${yellow(`(${markets.length} markets loaded)`)}`);
  })();

  await test('Jupiter client uses resilientFetch', async () => {
    const { jupiterClient } = await import('./clients/jupiter/client.js');
    const price = await jupiterClient.getPrice('So11111111111111111111111111111111111111112'); // SOL
    assert(typeof price === 'number', 'Should return price');
    assert(price > 0, 'Price should be positive');
    console.log(`    ${yellow(`(SOL price: $${price.toFixed(2)})`)}`);
  })();

  await test('Meteora client uses resilientFetch', async () => {
    const { meteoraClient } = await import('./clients/meteora/client.js');
    const pools = await meteoraClient.getPools(5);
    assert(Array.isArray(pools), 'Should return pools array');
    console.log(`    ${yellow(`(${pools.length} pools loaded)`)}`);
  })();
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 CLAUDEFI RESILIENCE MODULES TEST SUITE');
  console.log('='.repeat(60));

  try {
    await testResilientFetch();
    await testTranscriptStore();
    await testContextManager();
    await testIdempotencyService();
    await testModelFallback();
    await testApiClients();
  } catch (error) {
    console.error(red('\n❌ Test suite crashed:'), error);
    process.exit(1);
  }

  console.log('\n' + '='.repeat(60));
  console.log(`Results: ${green(`${passed} passed`)}, ${failed > 0 ? red(`${failed} failed`) : `${failed} failed`}`);
  console.log('='.repeat(60) + '\n');

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(console.error);
