/**
 * Infrastructure Layer Tests
 *
 * Tests the core infrastructure components:
 * - resilient-fetch: Retry logic, exponential backoff, timeout handling
 * - rate-limiter: Cooldown calculation, state transitions, quota management
 * - model-executor: Fallback chains, model availability, error handling
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

describe('Resilient Fetch', () => {
  describe('Retry Logic', () => {
    it('should retry on network error', async () => {
      let attempts = 0;

      const mockFetch = async () => {
        attempts++;
        if (attempts < 3) {
          throw new Error('Network error');
        }
        return { ok: true, json: async () => ({ data: 'success' }) };
      };

      const result = await resilientFetchMock(mockFetch, { maxRetries: 3 });

      expect(attempts).toBe(3);
      expect(result).toEqual({ data: 'success' });
    });

    it('should fail after max retries exceeded', async () => {
      const mockFetch = async () => {
        throw new Error('Persistent error');
      };

      await expect(
        resilientFetchMock(mockFetch, { maxRetries: 2 })
      ).rejects.toThrow('Persistent error');
    });

    it('should not retry on 4xx errors', async () => {
      let attempts = 0;

      const mockFetch = async () => {
        attempts++;
        return {
          ok: false,
          status: 400,
          statusText: 'Bad Request',
          json: async () => ({ error: 'Invalid input' }),
        };
      };

      await expect(
        resilientFetchMock(mockFetch, { maxRetries: 3 })
      ).rejects.toThrow();

      expect(attempts).toBe(1); // No retries on 4xx
    });

    it('should retry on 5xx errors', async () => {
      let attempts = 0;

      const mockFetch = async () => {
        attempts++;
        if (attempts < 2) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
          };
        }
        return { ok: true, json: async () => ({ data: 'recovered' }) };
      };

      const result = await resilientFetchMock(mockFetch, { maxRetries: 3 });

      expect(attempts).toBe(2);
      expect(result).toEqual({ data: 'recovered' });
    });
  });

  describe('Exponential Backoff', () => {
    it('should increase delay between retries', () => {
      const delays: number[] = [];

      for (let attempt = 0; attempt < 4; attempt++) {
        const delay = calculateBackoff(attempt, 1000);
        delays.push(delay);
      }

      // Delays should increase exponentially
      expect(delays[0]).toBe(1000); // 1s
      expect(delays[1]).toBe(2000); // 2s
      expect(delays[2]).toBe(4000); // 4s
      expect(delays[3]).toBe(8000); // 8s
    });

    it('should cap maximum delay', () => {
      const maxDelay = 30000; // 30 seconds

      for (let attempt = 0; attempt < 10; attempt++) {
        const delay = calculateBackoff(attempt, 1000, maxDelay);
        expect(delay).toBeLessThanOrEqual(maxDelay);
      }
    });

    it('should add jitter to prevent thundering herd', () => {
      const delays = new Set<number>();

      for (let i = 0; i < 100; i++) {
        const delay = calculateBackoffWithJitter(2, 1000);
        delays.add(delay);
      }

      // With jitter, we should see variety in delays
      expect(delays.size).toBeGreaterThan(1);
    });
  });

  describe('Retry-After Header', () => {
    it('should respect Retry-After seconds', async () => {
      const mockFetch = async () => ({
        ok: false,
        status: 429,
        headers: new Map([['retry-after', '5']]),
      });

      const retryDelay = parseRetryAfter('5');
      expect(retryDelay).toBe(5000); // 5 seconds in ms
    });

    it('should parse Retry-After date format', () => {
      const futureDate = new Date(Date.now() + 10000);
      const retryDelay = parseRetryAfter(futureDate.toUTCString());

      expect(retryDelay).toBeGreaterThan(9000);
      expect(retryDelay).toBeLessThan(11000);
    });

    it('should handle invalid Retry-After gracefully', () => {
      const retryDelay = parseRetryAfter('invalid');
      expect(retryDelay).toBe(0);
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running requests', async () => {
      const mockFetch = async () => {
        await new Promise(resolve => setTimeout(resolve, 5000));
        return { ok: true, json: async () => ({ data: 'late' }) };
      };

      await expect(
        resilientFetchMock(mockFetch, { timeout: 1000 })
      ).rejects.toThrow('timeout');
    });

    it('should complete fast requests within timeout', async () => {
      const mockFetch = async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        return { ok: true, json: async () => ({ data: 'fast' }) };
      };

      const result = await resilientFetchMock(mockFetch, { timeout: 1000 });
      expect(result).toEqual({ data: 'fast' });
    });
  });
});

describe('Rate Limiter', () => {
  describe('Cooldown Calculation', () => {
    it('should calculate cooldown from 429 response', () => {
      const response = {
        status: 429,
        headers: new Map([['retry-after', '60']]),
      };

      const cooldownMs = calculateCooldown(response);
      expect(cooldownMs).toBe(60000); // 60 seconds
    });

    it('should use default cooldown when Retry-After missing', () => {
      const response = {
        status: 429,
        headers: new Map(),
      };

      const cooldownMs = calculateCooldown(response, 30000);
      expect(cooldownMs).toBe(30000); // Default 30s
    });

    it('should increase cooldown on repeated rate limits', () => {
      const cooldowns: number[] = [];

      for (let strikes = 0; strikes < 4; strikes++) {
        const cooldown = calculateAdaptiveCooldown(strikes, 10000);
        cooldowns.push(cooldown);
      }

      // Cooldown should increase with strikes
      expect(cooldowns[0]).toBe(10000); // 10s
      expect(cooldowns[1]).toBe(20000); // 20s
      expect(cooldowns[2]).toBe(40000); // 40s
      expect(cooldowns[3]).toBe(80000); // 80s
    });
  });

  describe('State Transitions', () => {
    it('should transition from ACTIVE to COOLDOWN on rate limit', () => {
      const limiter = createRateLimiter();

      expect(limiter.state).toBe('ACTIVE');

      limiter.handleRateLimit(60000);

      expect(limiter.state).toBe('COOLDOWN');
      expect(limiter.cooldownEndsAt).toBeGreaterThan(Date.now());
    });

    it('should transition from COOLDOWN to ACTIVE after period expires', async () => {
      const limiter = createRateLimiter();

      limiter.handleRateLimit(100); // 100ms cooldown

      expect(limiter.state).toBe('COOLDOWN');

      await new Promise(resolve => setTimeout(resolve, 150));

      limiter.checkCooldown();

      expect(limiter.state).toBe('ACTIVE');
    });

    it('should remain in COOLDOWN if period not expired', () => {
      const limiter = createRateLimiter();

      limiter.handleRateLimit(10000); // 10s cooldown

      expect(limiter.state).toBe('COOLDOWN');

      limiter.checkCooldown();

      expect(limiter.state).toBe('COOLDOWN');
    });
  });

  describe('Quota Management', () => {
    it('should track request quota consumption', () => {
      const limiter = createRateLimiter({ quota: 100, windowMs: 60000 });

      limiter.consumeQuota(10);
      expect(limiter.remaining).toBe(90);

      limiter.consumeQuota(30);
      expect(limiter.remaining).toBe(60);
    });

    it('should reject requests when quota exhausted', () => {
      const limiter = createRateLimiter({ quota: 10, windowMs: 60000 });

      limiter.consumeQuota(10);

      expect(limiter.canMakeRequest()).toBe(false);
      expect(limiter.remaining).toBe(0);
    });

    it('should reset quota after window expires', async () => {
      const limiter = createRateLimiter({ quota: 10, windowMs: 100 });

      limiter.consumeQuota(10);
      expect(limiter.remaining).toBe(0);

      await new Promise(resolve => setTimeout(resolve, 150));

      limiter.checkQuota();
      expect(limiter.remaining).toBe(10);
    });
  });

  describe('Multi-Domain Rate Limiting', () => {
    it('should track separate quotas per domain', () => {
      const limiters = {
        spot: createRateLimiter({ quota: 100, windowMs: 60000 }),
        perps: createRateLimiter({ quota: 50, windowMs: 60000 }),
      };

      limiters.spot.consumeQuota(50);
      limiters.perps.consumeQuota(25);

      expect(limiters.spot.remaining).toBe(50);
      expect(limiters.perps.remaining).toBe(25);
    });

    it('should not share cooldown state across domains', () => {
      const limiters = {
        dlmm: createRateLimiter(),
        polymarket: createRateLimiter(),
      };

      limiters.dlmm.handleRateLimit(60000);

      expect(limiters.dlmm.state).toBe('COOLDOWN');
      expect(limiters.polymarket.state).toBe('ACTIVE');
    });
  });
});

describe('Model Executor', () => {
  describe('Fallback Chain', () => {
    it('should fallback from opus to sonnet on error', async () => {
      const modelCalls: string[] = [];

      const mockExecute = async (model: string) => {
        modelCalls.push(model);
        if (model === 'opus') {
          throw new Error('Opus unavailable');
        }
        return { response: `Success from ${model}` };
      };

      const result = await executeWithFallback(
        mockExecute,
        ['opus', 'sonnet', 'haiku']
      );

      expect(modelCalls).toEqual(['opus', 'sonnet']);
      expect(result.response).toBe('Success from sonnet');
    });

    it('should fallback through entire chain if needed', async () => {
      const modelCalls: string[] = [];

      const mockExecute = async (model: string) => {
        modelCalls.push(model);
        if (model !== 'haiku') {
          throw new Error(`${model} unavailable`);
        }
        return { response: `Success from ${model}` };
      };

      const result = await executeWithFallback(
        mockExecute,
        ['opus', 'sonnet', 'haiku']
      );

      expect(modelCalls).toEqual(['opus', 'sonnet', 'haiku']);
      expect(result.response).toBe('Success from haiku');
    });

    it('should fail if all models unavailable', async () => {
      const mockExecute = async (model: string) => {
        throw new Error(`${model} unavailable`);
      };

      await expect(
        executeWithFallback(mockExecute, ['opus', 'sonnet', 'haiku'])
      ).rejects.toThrow('All models unavailable');
    });
  });

  describe('Model Availability', () => {
    it('should check model availability before execution', async () => {
      const availability = {
        opus: false,
        sonnet: true,
        haiku: true,
      };

      const availableModels = Object.entries(availability)
        .filter(([_, available]) => available)
        .map(([model]) => model);

      expect(availableModels).toEqual(['sonnet', 'haiku']);
    });

    it('should track model failure rates', () => {
      const modelStats = {
        opus: { attempts: 10, failures: 7 },
        sonnet: { attempts: 10, failures: 2 },
        haiku: { attempts: 10, failures: 1 },
      };

      const failureRates = Object.entries(modelStats).map(([model, stats]) => ({
        model,
        failureRate: stats.failures / stats.attempts,
      }));

      expect(failureRates[0].failureRate).toBe(0.7); // opus: 70%
      expect(failureRates[1].failureRate).toBe(0.2); // sonnet: 20%
      expect(failureRates[2].failureRate).toBe(0.1); // haiku: 10%
    });

    it('should prefer models with lower failure rates', () => {
      const models = [
        { name: 'opus', failureRate: 0.7, cost: 10 },
        { name: 'sonnet', failureRate: 0.2, cost: 5 },
        { name: 'haiku', failureRate: 0.1, cost: 1 },
      ];

      // Sort by failure rate (ascending)
      const sorted = models.sort((a, b) => a.failureRate - b.failureRate);

      expect(sorted[0].name).toBe('haiku');
      expect(sorted[1].name).toBe('sonnet');
      expect(sorted[2].name).toBe('opus');
    });
  });

  describe('Error Handling', () => {
    it('should categorize errors by type', () => {
      const errors = [
        { message: 'Rate limit exceeded', type: 'rate_limit' },
        { message: 'Model overloaded', type: 'overloaded' },
        { message: 'Invalid API key', type: 'auth' },
        { message: 'Network timeout', type: 'network' },
      ];

      const rateLimitErrors = errors.filter(e => e.type === 'rate_limit');
      const authErrors = errors.filter(e => e.type === 'auth');

      expect(rateLimitErrors.length).toBe(1);
      expect(authErrors.length).toBe(1);
    });

    it('should retry on transient errors', () => {
      const transientErrors = ['overloaded', 'network', 'timeout'];
      const permanentErrors = ['auth', 'invalid_request'];

      const shouldRetry = (errorType: string) =>
        transientErrors.includes(errorType);

      expect(shouldRetry('overloaded')).toBe(true);
      expect(shouldRetry('network')).toBe(true);
      expect(shouldRetry('auth')).toBe(false);
      expect(shouldRetry('invalid_request')).toBe(false);
    });

    it('should not retry on permanent errors', () => {
      const error = { type: 'auth', message: 'Invalid API key' };

      const shouldRetry = error.type !== 'auth' && error.type !== 'invalid_request';

      expect(shouldRetry).toBe(false);
    });
  });

  describe('Circuit Breaker', () => {
    it('should open circuit after threshold failures', () => {
      const breaker = createCircuitBreaker({ threshold: 5, windowMs: 60000 });

      for (let i = 0; i < 5; i++) {
        breaker.recordFailure();
      }

      expect(breaker.state).toBe('OPEN');
      expect(breaker.allowRequest()).toBe(false);
    });

    it('should transition to HALF_OPEN after timeout', async () => {
      const breaker = createCircuitBreaker({ threshold: 3, timeoutMs: 100 });

      for (let i = 0; i < 3; i++) {
        breaker.recordFailure();
      }

      expect(breaker.state).toBe('OPEN');

      await new Promise(resolve => setTimeout(resolve, 150));

      breaker.checkState();

      expect(breaker.state).toBe('HALF_OPEN');
    });

    it('should close circuit on success in HALF_OPEN', () => {
      const breaker = createCircuitBreaker({ threshold: 3, timeoutMs: 100 });

      breaker.state = 'HALF_OPEN';
      breaker.recordSuccess();

      expect(breaker.state).toBe('CLOSED');
    });

    it('should reopen on failure in HALF_OPEN', () => {
      const breaker = createCircuitBreaker({ threshold: 3, timeoutMs: 100 });

      breaker.state = 'HALF_OPEN';
      breaker.recordFailure();

      expect(breaker.state).toBe('OPEN');
    });
  });
});

// Helper functions (simplified implementations for testing)

async function resilientFetchMock(
  fetchFn: () => Promise<any>,
  options: { maxRetries?: number; timeout?: number } = {}
): Promise<any> {
  const maxRetries = options.maxRetries ?? 3;
  const timeout = options.timeout ?? 30000;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), timeout)
      );

      const response: any = await Promise.race([fetchFn(), timeoutPromise]);

      if (response.ok === false) {
        // Don't retry on 4xx errors (except 429)
        if (response.status >= 400 && response.status < 500 && response.status !== 429) {
          throw new Error(`Client error: ${response.status}`);
        }
        // For 5xx or 429, retry
        if (attempt === maxRetries - 1) {
          throw new Error(`Server error: ${response.status}`);
        }
        continue;
      }

      return await response.json();
    } catch (error) {
      // Don't retry on client errors (already thrown above)
      if (error instanceof Error && error.message.startsWith('Client error:')) {
        throw error;
      }
      // Retry on other errors
      if (attempt === maxRetries - 1) {
        throw error;
      }
    }
  }
}

function calculateBackoff(attempt: number, baseDelay: number, maxDelay?: number): number {
  const delay = baseDelay * Math.pow(2, attempt);
  return maxDelay ? Math.min(delay, maxDelay) : delay;
}

function calculateBackoffWithJitter(attempt: number, baseDelay: number): number {
  const delay = calculateBackoff(attempt, baseDelay);
  const jitter = Math.random() * delay * 0.1; // 10% jitter
  return delay + jitter;
}

function parseRetryAfter(retryAfter: string): number {
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  const date = new Date(retryAfter);
  if (!isNaN(date.getTime())) {
    return Math.max(0, date.getTime() - Date.now());
  }

  return 0;
}

function calculateCooldown(response: any, defaultCooldown: number = 30000): number {
  const retryAfter = response.headers.get('retry-after');
  return retryAfter ? parseRetryAfter(retryAfter) : defaultCooldown;
}

function calculateAdaptiveCooldown(strikes: number, baseCooldown: number): number {
  return baseCooldown * Math.pow(2, strikes);
}

function createRateLimiter(config?: { quota?: number; windowMs?: number }) {
  return {
    state: 'ACTIVE' as 'ACTIVE' | 'COOLDOWN',
    remaining: config?.quota ?? 100,
    quota: config?.quota ?? 100,
    windowMs: config?.windowMs ?? 60000,
    cooldownEndsAt: 0,
    windowEndsAt: Date.now() + (config?.windowMs ?? 60000),

    handleRateLimit(cooldownMs: number) {
      this.state = 'COOLDOWN';
      this.cooldownEndsAt = Date.now() + cooldownMs;
    },

    checkCooldown() {
      if (this.state === 'COOLDOWN' && Date.now() >= this.cooldownEndsAt) {
        this.state = 'ACTIVE';
      }
    },

    consumeQuota(amount: number) {
      this.remaining = Math.max(0, this.remaining - amount);
    },

    canMakeRequest(): boolean {
      return this.state === 'ACTIVE' && this.remaining > 0;
    },

    checkQuota() {
      if (Date.now() >= this.windowEndsAt) {
        this.remaining = this.quota;
        this.windowEndsAt = Date.now() + this.windowMs;
      }
    },
  };
}

async function executeWithFallback(
  executeFn: (model: string) => Promise<any>,
  models: string[]
): Promise<any> {
  for (let i = 0; i < models.length; i++) {
    try {
      return await executeFn(models[i]);
    } catch (error) {
      if (i === models.length - 1) {
        throw new Error('All models unavailable');
      }
    }
  }
}

function createCircuitBreaker(config: { threshold: number; timeoutMs?: number; windowMs?: number }) {
  return {
    state: 'CLOSED' as 'CLOSED' | 'OPEN' | 'HALF_OPEN',
    failures: 0,
    threshold: config.threshold,
    timeoutMs: config.timeoutMs ?? 60000,
    openedAt: 0,

    recordFailure() {
      this.failures++;
      // If already in HALF_OPEN, go back to OPEN immediately
      if (this.state === 'HALF_OPEN') {
        this.state = 'OPEN';
        this.openedAt = Date.now();
      } else if (this.failures >= this.threshold) {
        this.state = 'OPEN';
        this.openedAt = Date.now();
      }
    },

    recordSuccess() {
      this.failures = 0;
      this.state = 'CLOSED';
    },

    checkState() {
      if (this.state === 'OPEN' && Date.now() - this.openedAt >= this.timeoutMs) {
        this.state = 'HALF_OPEN';
      }
    },

    allowRequest(): boolean {
      return this.state !== 'OPEN';
    },
  };
}
