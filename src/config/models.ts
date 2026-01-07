/**
 * Model fallback configuration for graceful degradation
 *
 * Provides a model chain for automatic fallback when models are overloaded
 * or rate limited, enabling more resilient agent operations.
 */

export interface ModelFallbackConfig {
  primary: string;
  fallbacks: string[];
  cooldownMs: number; // Per-model cooldown on failure
}

/**
 * Default model fallback chain
 */
export const MODEL_CHAIN: ModelFallbackConfig = {
  primary: 'claude-opus-4-5-20251101',
  fallbacks: [
    'claude-sonnet-4-20250514',
    'claude-3-5-sonnet-20241022',
  ],
  cooldownMs: 60000, // 1 minute cooldown
};

/**
 * Check if an error is retryable (should trigger fallback)
 *
 * Returns true for transient errors like rate limits, overload, and timeouts
 * that may succeed with a different model.
 */
export function isRetryableModelError(error: Error): boolean {
  const message = error.message.toLowerCase();
  return (
    message.includes('overloaded') ||
    message.includes('rate_limit') ||
    message.includes('rate limit') ||
    message.includes('capacity') ||
    message.includes('timeout') ||
    message.includes('529') || // Overloaded
    message.includes('503') || // Service unavailable
    message.includes('502')    // Bad gateway
  );
}

/**
 * Get all models in order (primary first, then fallbacks)
 */
export function getModelChain(config?: ModelFallbackConfig): string[] {
  const c = config || MODEL_CHAIN;
  return [c.primary, ...c.fallbacks];
}
