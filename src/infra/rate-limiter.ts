/**
 * Rate Limit Tracker
 *
 * Tracks rate limit state per endpoint with exponential cooldown.
 * Inspired by ClawdBot's auth profile rotation pattern.
 */

/**
 * State for a single endpoint's rate limiting
 */
export interface RateLimitState {
  /** The endpoint identifier */
  endpoint: string;
  /** When the cooldown expires (null if not in cooldown) */
  cooldownUntil: Date | null;
  /** Number of consecutive failures */
  consecutiveFailures: number;
  /** Last successful request timestamp */
  lastSuccess: Date | null;
  /** Last failure timestamp */
  lastFailure: Date | null;
}

/**
 * Configuration for rate limit tracking
 */
export interface RateLimitConfig {
  /** Initial cooldown in milliseconds (default: 60000 = 1 minute) */
  initialCooldownMs: number;
  /** Maximum cooldown in milliseconds (default: 3600000 = 1 hour) */
  maxCooldownMs: number;
  /** Multiplier for exponential backoff (default: 5) */
  cooldownMultiplier: number;
  /** Number of successes required to reset failure count (default: 3) */
  successesForReset: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  initialCooldownMs: 60_000,      // 1 minute
  maxCooldownMs: 3_600_000,       // 1 hour
  cooldownMultiplier: 5,          // 1min → 5min → 25min → 60min (capped)
  successesForReset: 3,
};

/**
 * Tracks rate limiting state across multiple endpoints
 *
 * @example
 * ```typescript
 * const tracker = new RateLimitTracker();
 *
 * // Before making a request
 * if (!tracker.isAllowed('https://api.example.com')) {
 *   const remaining = tracker.getCooldownRemaining('https://api.example.com');
 *   console.log(`Rate limited, wait ${remaining}ms`);
 *   return;
 * }
 *
 * try {
 *   const result = await fetch('https://api.example.com');
 *   tracker.recordSuccess('https://api.example.com');
 * } catch (error) {
 *   if (isRateLimitError(error)) {
 *     tracker.recordFailure('https://api.example.com', 60); // Retry-After seconds
 *   }
 * }
 * ```
 */
export class RateLimitTracker {
  private state: Map<string, RateLimitState> = new Map();
  private successCounts: Map<string, number> = new Map();
  private config: RateLimitConfig;

  constructor(config?: Partial<RateLimitConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get or create state for an endpoint
   */
  private getState(endpoint: string): RateLimitState {
    let state = this.state.get(endpoint);
    if (!state) {
      state = {
        endpoint,
        cooldownUntil: null,
        consecutiveFailures: 0,
        lastSuccess: null,
        lastFailure: null,
      };
      this.state.set(endpoint, state);
    }
    return state;
  }

  /**
   * Check if an endpoint is allowed (not in cooldown)
   */
  isAllowed(endpoint: string): boolean {
    const state = this.getState(endpoint);
    if (!state.cooldownUntil) {
      return true;
    }
    return Date.now() >= state.cooldownUntil.getTime();
  }

  /**
   * Record a rate limit failure for an endpoint
   * @param endpoint - The endpoint that was rate limited
   * @param retryAfterSeconds - Optional Retry-After value from the response
   */
  recordFailure(endpoint: string, retryAfterSeconds?: number): void {
    const state = this.getState(endpoint);
    state.consecutiveFailures++;
    state.lastFailure = new Date();

    // Reset success counter on failure
    this.successCounts.set(endpoint, 0);

    // Calculate cooldown duration
    let cooldownMs: number;
    if (retryAfterSeconds !== undefined && retryAfterSeconds > 0) {
      // Use Retry-After if provided
      cooldownMs = retryAfterSeconds * 1000;
    } else {
      // Exponential backoff: initialCooldown * multiplier^(failures-1)
      cooldownMs = this.config.initialCooldownMs *
        Math.pow(this.config.cooldownMultiplier, state.consecutiveFailures - 1);
    }

    // Cap at max cooldown
    cooldownMs = Math.min(cooldownMs, this.config.maxCooldownMs);

    state.cooldownUntil = new Date(Date.now() + cooldownMs);

    console.warn(
      `[RateLimitTracker] ${endpoint} rate limited. ` +
      `Cooldown: ${Math.round(cooldownMs / 1000)}s, ` +
      `Consecutive failures: ${state.consecutiveFailures}`
    );
  }

  /**
   * Record a successful request for an endpoint
   */
  recordSuccess(endpoint: string): void {
    const state = this.getState(endpoint);
    state.lastSuccess = new Date();

    // Increment success counter
    const currentSuccesses = (this.successCounts.get(endpoint) || 0) + 1;
    this.successCounts.set(endpoint, currentSuccesses);

    // Reset failure count after enough consecutive successes
    if (currentSuccesses >= this.config.successesForReset) {
      if (state.consecutiveFailures > 0) {
        console.log(
          `[RateLimitTracker] ${endpoint} recovered after ` +
          `${currentSuccesses} successful requests`
        );
      }
      state.consecutiveFailures = 0;
      state.cooldownUntil = null;
      this.successCounts.set(endpoint, 0);
    }
  }

  /**
   * Get remaining cooldown time in milliseconds (null if not in cooldown)
   */
  getCooldownRemaining(endpoint: string): number | null {
    const state = this.getState(endpoint);
    if (!state.cooldownUntil) {
      return null;
    }
    const remaining = state.cooldownUntil.getTime() - Date.now();
    return remaining > 0 ? remaining : null;
  }

  /**
   * Get the current state for an endpoint
   */
  getEndpointState(endpoint: string): RateLimitState {
    return { ...this.getState(endpoint) };
  }

  /**
   * Get all tracked endpoints and their states
   */
  getAllStates(): RateLimitState[] {
    return Array.from(this.state.values()).map(s => ({ ...s }));
  }

  /**
   * Clear cooldown for a specific endpoint (manual override)
   */
  clearCooldown(endpoint: string): void {
    const state = this.getState(endpoint);
    state.cooldownUntil = null;
    state.consecutiveFailures = 0;
    this.successCounts.set(endpoint, 0);
    console.log(`[RateLimitTracker] Manually cleared cooldown for ${endpoint}`);
  }

  /**
   * Clear all tracking state
   */
  clearAll(): void {
    this.state.clear();
    this.successCounts.clear();
    console.log('[RateLimitTracker] Cleared all rate limit state');
  }

  /**
   * Get a summary of current rate limit status
   */
  getSummary(): {
    total: number;
    inCooldown: number;
    healthy: number;
    endpoints: Array<{
      endpoint: string;
      status: 'healthy' | 'cooldown' | 'recovering';
      cooldownRemaining?: number;
      consecutiveFailures: number;
    }>;
  } {
    const endpoints = Array.from(this.state.values()).map(state => {
      const cooldownRemaining = this.getCooldownRemaining(state.endpoint);
      let status: 'healthy' | 'cooldown' | 'recovering';

      if (cooldownRemaining !== null) {
        status = 'cooldown';
      } else if (state.consecutiveFailures > 0) {
        status = 'recovering';
      } else {
        status = 'healthy';
      }

      return {
        endpoint: state.endpoint,
        status,
        cooldownRemaining: cooldownRemaining ?? undefined,
        consecutiveFailures: state.consecutiveFailures,
      };
    });

    return {
      total: endpoints.length,
      inCooldown: endpoints.filter(e => e.status === 'cooldown').length,
      healthy: endpoints.filter(e => e.status === 'healthy').length,
      endpoints,
    };
  }
}

// Singleton instance for global rate limit tracking
export const globalRateLimitTracker = new RateLimitTracker();
