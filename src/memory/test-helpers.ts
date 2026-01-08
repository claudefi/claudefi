/**
 * Memory Testing Helpers
 *
 * Utilities for validating memory system functionality in stress tests
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Domain } from '../types/index.js';
import {
  remember,
  recall,
  logDailyMemory,
  readDailyLog,
  clearExpiredFacts,
  formatMemoryForPrompt,
  getMemoryContext,
} from './index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface MemoryTestResult {
  test: string;
  passed: boolean;
  duration: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

// =============================================================================
// VALIDATION TESTS
// =============================================================================

/**
 * Test that facts persist correctly
 */
export async function testFactPersistence(
  domain: Domain,
  fact: string
): Promise<MemoryTestResult> {
  const start = Date.now();

  try {
    // Store a test fact
    await remember(domain, fact, 'high', 'test-persistence');

    // Wait a moment for file write
    await new Promise(resolve => setTimeout(resolve, 50));

    // Recall facts
    const facts = await recall(domain);

    // Check if our fact exists
    const found = facts.some(f => f.includes(fact));

    return {
      test: 'testFactPersistence',
      passed: found,
      duration: Date.now() - start,
      error: found ? undefined : `Fact "${fact}" not found in recall`,
      metadata: { domain, factCount: facts.length },
    };
  } catch (error) {
    return {
      test: 'testFactPersistence',
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test that memory formats correctly for prompts
 */
export async function testMemoryFormatting(
  domain: Domain
): Promise<MemoryTestResult> {
  const start = Date.now();

  try {
    // Get formatted memory
    const formatted = await formatMemoryForPrompt(domain);

    // Check for expected structure (should have markdown headers or be empty)
    const hasProperStructure =
      formatted.length === 0 || formatted.includes('## Agent Memory') ||
      formatted.includes('Knowledge');

    // Check for reasonable size (not too large)
    const reasonableSize = formatted.length < 50000; // 50KB limit

    const passed = hasProperStructure && reasonableSize;

    return {
      test: 'testMemoryFormatting',
      passed,
      duration: Date.now() - start,
      error: passed ? undefined : 'Memory formatting issues detected',
      metadata: {
        domain,
        sizeBytes: formatted.length,
        hasStructure: hasProperStructure,
        reasonableSize,
      },
    };
  } catch (error) {
    return {
      test: 'testMemoryFormatting',
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test that expiration logic works
 */
export async function testExpirationLogic(
  domain: Domain,
  hoursInPast: number = 1
): Promise<MemoryTestResult> {
  const start = Date.now();

  try {
    // Create an expired fact by modifying the memory file directly
    const memoryPath = path.join(
      process.cwd(),
      '.claude',
      'memory',
      domain,
      'MEMORY.md'
    );

    // Read current content
    let content = '';
    try {
      content = await fs.readFile(memoryPath, 'utf-8');
    } catch {
      // File might not exist yet
      content = `# ${domain.toUpperCase()} Memory\n\n`;
    }

    // Add an expired fact
    const pastDate = new Date();
    pastDate.setHours(pastDate.getHours() - hoursInPast);
    const expiredFact = `⭐ **[HIGH]** Test expired fact [EXPIRES: ${pastDate.toISOString().split('T')[0]}]\n_Added: ${new Date().toISOString()}_\n\n`;
    content += expiredFact;

    await fs.writeFile(memoryPath, content, 'utf-8');

    // Get facts before cleanup
    const factsBefore = await recall(domain);
    const countBefore = factsBefore.length;

    // Run cleanup
    const removed = await clearExpiredFacts(domain);

    // Get facts after cleanup
    const factsAfter = await recall(domain);
    const countAfter = factsAfter.length;

    // Verify removal
    const passed = removed > 0 && countAfter < countBefore;

    return {
      test: 'testExpirationLogic',
      passed,
      duration: Date.now() - start,
      error: passed ? undefined : 'Expired facts not removed',
      metadata: {
        domain,
        removed,
        countBefore,
        countAfter,
      },
    };
  } catch (error) {
    return {
      test: 'testExpirationLogic',
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test concurrent memory access
 */
export async function testConcurrentAccess(
  domain: Domain,
  operationCount: number = 10
): Promise<MemoryTestResult> {
  const start = Date.now();

  try {
    // Perform concurrent write operations
    const writes = Array.from({ length: operationCount }, (_, i) =>
      remember(domain, `Concurrent test fact ${i}`, 'low', 'test-concurrent')
    );

    await Promise.all(writes);

    // Wait for writes to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Recall and verify
    const facts = await recall(domain);
    const foundCount = facts.filter(f => f.includes('Concurrent test fact')).length;

    // Should find all facts
    const passed = foundCount === operationCount;

    return {
      test: 'testConcurrentAccess',
      passed,
      duration: Date.now() - start,
      error: passed ? undefined : `Expected ${operationCount} facts, found ${foundCount}`,
      metadata: {
        domain,
        operations: operationCount,
        found: foundCount,
      },
    };
  } catch (error) {
    return {
      test: 'testConcurrentAccess',
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test cross-domain isolation
 */
export async function testMemoryIsolation(): Promise<MemoryTestResult> {
  const start = Date.now();

  try {
    const testFact = `Isolation test ${Date.now()}`;

    // Store fact in dlmm only
    await remember('dlmm', testFact, 'high', 'test-isolation');

    await new Promise(resolve => setTimeout(resolve, 50));

    // Check dlmm has it
    const dlmmFacts = await recall('dlmm');
    const foundInDlmm = dlmmFacts.some(f => f.includes(testFact));

    // Check other domains don't have it
    const perpsFacts = await recall('perps');
    const spotFacts = await recall('spot');
    const polymarketFacts = await recall('polymarket');

    const notInPerps = !perpsFacts.some(f => f.includes(testFact));
    const notInSpot = !spotFacts.some(f => f.includes(testFact));
    const notInPolymarket = !polymarketFacts.some(f => f.includes(testFact));

    const passed = foundInDlmm && notInPerps && notInSpot && notInPolymarket;

    return {
      test: 'testMemoryIsolation',
      passed,
      duration: Date.now() - start,
      error: passed ? undefined : 'Memory leaked across domains',
      metadata: {
        foundInDlmm,
        notInPerps,
        notInSpot,
        notInPolymarket,
      },
    };
  } catch (error) {
    return {
      test: 'testMemoryIsolation',
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Test corrupted file recovery
 */
export async function testCorruptedFileRecovery(
  domain: Domain
): Promise<MemoryTestResult> {
  const start = Date.now();

  try {
    const memoryPath = path.join(
      process.cwd(),
      '.claude',
      'memory',
      domain,
      'MEMORY.md'
    );

    // Create corrupted content (invalid markdown)
    const corruptedContent = '<<<CORRUPTED>>> \x00\x01\x02 {invalid: json';

    await fs.mkdir(path.dirname(memoryPath), { recursive: true });
    await fs.writeFile(memoryPath, corruptedContent, 'utf-8');

    // Try to recall - should not crash
    let recallSucceeded = false;
    let recallError: string | undefined;

    try {
      const facts = await recall(domain);
      recallSucceeded = true; // Should return empty array, not crash
    } catch (error) {
      recallError = error instanceof Error ? error.message : 'Unknown error';
    }

    // Try to remember - should recover
    let rememberSucceeded = false;
    let rememberError: string | undefined;

    try {
      await remember(domain, 'Recovery test fact', 'medium', 'test-recovery');
      rememberSucceeded = true;
    } catch (error) {
      rememberError = error instanceof Error ? error.message : 'Unknown error';
    }

    const passed = recallSucceeded && rememberSucceeded;

    return {
      test: 'testCorruptedFileRecovery',
      passed,
      duration: Date.now() - start,
      error: passed ? undefined : `Recall: ${recallError}, Remember: ${rememberError}`,
      metadata: {
        domain,
        recallSucceeded,
        rememberSucceeded,
      },
    };
  } catch (error) {
    return {
      test: 'testCorruptedFileRecovery',
      passed: false,
      duration: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Inject realistic memory for testing
 */
export async function injectRealisticMemory(
  domain: Domain,
  cycleNum: number
): Promise<void> {
  const facts = [
    `Cycle ${cycleNum} completed successfully`,
    `${domain} market conditions analyzed`,
    `Risk assessment performed for ${domain}`,
  ];

  for (const fact of facts) {
    await remember(domain, fact, cycleNum % 3 === 0 ? 'high' : 'medium', 'stress-test');
  }

  // Log observation
  await logDailyMemory(
    domain,
    'observation',
    `Cycle ${cycleNum}: Market data refreshed, ${Math.floor(Math.random() * 10)} opportunities identified`
  );
}

/**
 * Extract memory references from decision reasoning
 */
export function extractMemoryReferences(
  reasoning: string,
  memoryFacts: string[]
): Array<{ factReferenced: string; confidence: number }> {
  const references: Array<{ factReferenced: string; confidence: number }> = [];

  for (const fact of memoryFacts) {
    // Check if reasoning mentions this fact (case-insensitive, partial match)
    const factWords = fact.toLowerCase().split(' ').filter(w => w.length > 3);

    let matchCount = 0;
    for (const word of factWords) {
      if (reasoning.toLowerCase().includes(word)) {
        matchCount++;
      }
    }

    // If at least 50% of fact words are mentioned, consider it referenced
    if (factWords.length > 0 && matchCount / factWords.length >= 0.5) {
      references.push({
        factReferenced: fact,
        confidence: matchCount / factWords.length,
      });
    }
  }

  return references;
}
