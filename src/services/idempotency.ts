/**
 * Idempotency Service
 * Prevents duplicate trade execution by tracking operations with deterministic keys
 *
 * Key generation uses hour buckets to allow the same trade parameters after an hour,
 * preventing runaway duplicate trades while still allowing intentional repeated trades.
 */

import { prisma } from '../db/prisma.js';
import type { Domain } from '../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Result of checking an idempotency key
 */
export interface IdempotencyCheckResult {
  exists: boolean;
  result?: unknown;
  createdAt?: Date;
}

// =============================================================================
// IDEMPOTENCY SERVICE
// =============================================================================

/**
 * Idempotency service to prevent duplicate trade execution
 */
export class IdempotencyService {
  private ttlMs: number;

  /**
   * Create an idempotency service instance
   * @param ttlMs - Time-to-live for idempotency keys in milliseconds (default: 24 hours)
   */
  constructor(ttlMs: number = 24 * 60 * 60 * 1000) {
    this.ttlMs = ttlMs;
  }

  /**
   * Generate a deterministic idempotency key from decision parameters
   *
   * Format: {domain}:{action}:{target}:{amountBucket}:{hourBucket}
   *
   * The key uses bucketing strategies to prevent exact duplicates while allowing
   * intentional repeated trades:
   * - Amount bucket: Rounds to nearest $10 to catch near-duplicate amounts
   * - Hour bucket: Uses current hour to allow same trade after an hour
   *
   * @param domain - Trading domain (dlmm, perps, polymarket, spot)
   * @param action - Action being taken (buy, sell, open_long, etc.)
   * @param target - Target of the action (pool address, symbol, condition ID)
   * @param amountUsd - Amount in USD for the operation
   * @returns Deterministic idempotency key
   */
  generateKey(
    domain: Domain,
    action: string,
    target: string | undefined,
    amountUsd: number | undefined
  ): string {
    // Normalize target to lowercase alphanumeric only
    const normalizedTarget = (target || 'none').toLowerCase().replace(/[^a-z0-9]/g, '');

    // Round amount to nearest $10 to catch near-duplicates
    const amountBucket = Math.floor((amountUsd || 0) / 10) * 10;

    // Use current hour as bucket to allow same trade after an hour
    const hourBucket = Math.floor(Date.now() / (60 * 60 * 1000));

    return `${domain}:${action}:${normalizedTarget}:${amountBucket}:${hourBucket}`;
  }

  /**
   * Check if an operation with this key was already executed
   *
   * @param key - Idempotency key to check
   * @returns Object indicating if key exists and the previous result if available
   */
  async check(key: string): Promise<IdempotencyCheckResult> {
    try {
      const record = await prisma.tradeIdempotency.findUnique({
        where: { idempotencyKey: key },
      });

      if (!record) {
        return { exists: false };
      }

      // Check if the record has expired
      if (record.expiresAt < new Date()) {
        // Clean up expired record
        await prisma.tradeIdempotency.delete({
          where: { idempotencyKey: key },
        }).catch(() => {
          // Ignore deletion errors (might have been cleaned up by another process)
        });
        return { exists: false };
      }

      // Parse the result to check status
      let parsedResult: unknown = undefined;
      if (record.result) {
        try {
          parsedResult = JSON.parse(record.result);
        } catch {
          parsedResult = record.result;
        }
      }

      // If record is marked as failed and is older than 10 minutes, allow retry
      if (parsedResult && typeof parsedResult === 'object' && 'status' in parsedResult) {
        if (parsedResult.status === 'failed') {
          const ageMs = Date.now() - record.createdAt.getTime();
          const TEN_MINUTES = 10 * 60 * 1000;

          if (ageMs > TEN_MINUTES) {
            // Old failed attempt - allow retry by treating as non-existent
            return { exists: false };
          }
        }
      }

      return {
        exists: true,
        result: parsedResult,
        createdAt: record.createdAt,
      };
    } catch (error) {
      // If database is not available, allow the operation to proceed
      // This is a safety measure to prevent blocking trades when DB is down
      console.error('[Idempotency] Failed to check key:', error);
      return { exists: false };
    }
  }

  /**
   * Record a successful operation
   *
   * @param key - Idempotency key for the operation
   * @param domain - Trading domain
   * @param action - Action that was taken
   * @param target - Target of the action
   * @param amountUsd - Amount in USD
   * @param result - Result of the operation to store
   */
  async record(
    key: string,
    domain: Domain,
    action: string,
    target: string | undefined,
    amountUsd: number | undefined,
    result: unknown
  ): Promise<void> {
    try {
      const expiresAt = new Date(Date.now() + this.ttlMs);
      const resultJson = result ? JSON.stringify(result) : null;

      await prisma.tradeIdempotency.upsert({
        where: { idempotencyKey: key },
        create: {
          idempotencyKey: key,
          domain,
          action,
          target: target || 'none',
          amountUsd: amountUsd || 0,
          result: resultJson,
          expiresAt,
        },
        update: {
          result: resultJson,
          expiresAt,
        },
      });

      console.log(`[Idempotency] Recorded operation: ${key}`);
    } catch (error) {
      // Log but don't throw - recording failure shouldn't block the trade
      console.error('[Idempotency] Failed to record operation:', error);
    }
  }

  /**
   * Clean up expired entries
   *
   * This should be called periodically (e.g., every hour) to prevent
   * the idempotency table from growing indefinitely.
   *
   * @returns Number of expired entries that were deleted
   */
  async cleanup(): Promise<number> {
    try {
      const result = await prisma.tradeIdempotency.deleteMany({
        where: {
          expiresAt: {
            lt: new Date(),
          },
        },
      });

      if (result.count > 0) {
        console.log(`[Idempotency] Cleaned up ${result.count} expired entries`);
      }

      return result.count;
    } catch (error) {
      console.error('[Idempotency] Failed to cleanup expired entries:', error);
      return 0;
    }
  }

  /**
   * Check and record in a single atomic-like operation
   *
   * This is a convenience method that combines check and record,
   * useful for the common pattern of checking before executing.
   *
   * @param domain - Trading domain
   * @param action - Action to be taken
   * @param target - Target of the action
   * @param amountUsd - Amount in USD
   * @returns Object with isDuplicate flag and key
   */
  async checkAndReserve(
    domain: Domain,
    action: string,
    target: string | undefined,
    amountUsd: number | undefined
  ): Promise<{ isDuplicate: boolean; key: string; previousResult?: unknown }> {
    const key = this.generateKey(domain, action, target, amountUsd);
    const checkResult = await this.check(key);

    if (checkResult.exists) {
      return {
        isDuplicate: true,
        key,
        previousResult: checkResult.result,
      };
    }

    // Reserve the key with a placeholder result
    // The actual result will be updated after the operation completes
    await this.record(key, domain, action, target, amountUsd, { status: 'pending' });

    return {
      isDuplicate: false,
      key,
    };
  }

  /**
   * Update the result for a previously reserved key
   *
   * @param key - Idempotency key to update
   * @param result - Final result of the operation
   */
  async updateResult(key: string, result: unknown): Promise<void> {
    try {
      await prisma.tradeIdempotency.update({
        where: { idempotencyKey: key },
        data: {
          result: JSON.stringify(result),
        },
      });
    } catch (error) {
      console.error('[Idempotency] Failed to update result:', error);
    }
  }

  /**
   * Remove a key (useful if an operation fails and should be retryable)
   *
   * @param key - Idempotency key to remove
   */
  async remove(key: string): Promise<void> {
    try {
      await prisma.tradeIdempotency.delete({
        where: { idempotencyKey: key },
      }).catch(() => {
        // Ignore if already deleted
      });
    } catch (error) {
      console.error('[Idempotency] Failed to remove key:', error);
    }
  }

  /**
   * Get statistics about idempotency records
   *
   * @returns Statistics about current idempotency state
   */
  async getStats(): Promise<{
    totalRecords: number;
    byDomain: Record<string, number>;
    expiredCount: number;
  }> {
    try {
      const [total, byDomain, expired] = await Promise.all([
        prisma.tradeIdempotency.count(),
        prisma.tradeIdempotency.groupBy({
          by: ['domain'],
          _count: { domain: true },
        }),
        prisma.tradeIdempotency.count({
          where: {
            expiresAt: { lt: new Date() },
          },
        }),
      ]);

      const domainCounts: Record<string, number> = {};
      for (const item of byDomain) {
        domainCounts[item.domain] = item._count.domain;
      }

      return {
        totalRecords: total,
        byDomain: domainCounts,
        expiredCount: expired,
      };
    } catch (error) {
      console.error('[Idempotency] Failed to get stats:', error);
      return {
        totalRecords: 0,
        byDomain: {},
        expiredCount: 0,
      };
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Singleton instance of the idempotency service
 * Uses 24-hour TTL by default
 */
export const idempotencyService = new IdempotencyService();

// =============================================================================
// BACKGROUND CLEANUP JOB
// =============================================================================

let cleanupInterval: NodeJS.Timeout | null = null;

/**
 * Start the background cleanup job
 *
 * @param intervalMs - Interval between cleanups in milliseconds (default: 1 hour)
 * @returns The interval ID for stopping later
 */
export function startIdempotencyCleanup(intervalMs: number = 60 * 60 * 1000): NodeJS.Timeout {
  console.log(`[Idempotency] Starting cleanup job (interval: ${intervalMs}ms)`);

  // Run immediately
  idempotencyService.cleanup().catch(console.error);

  // Then run on interval
  cleanupInterval = setInterval(() => {
    idempotencyService.cleanup().catch(console.error);
  }, intervalMs);

  return cleanupInterval;
}

/**
 * Stop the background cleanup job
 */
export function stopIdempotencyCleanup(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log('[Idempotency] Stopped cleanup job');
  }
}
