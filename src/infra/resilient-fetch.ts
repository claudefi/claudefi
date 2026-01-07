/**
 * Resilient Fetch Utility
 *
 * Provides robust HTTP fetching with:
 * - Exponential backoff retry logic
 * - Jitter to prevent thundering herd
 * - 429 rate limit handling with Retry-After parsing
 * - Timeout via AbortController
 * - Error classification (retryable vs permanent)
 */

/**
 * Configuration for retry behavior
 */
export interface RetryConfig {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number;
  /** Base delay in milliseconds for exponential backoff (default: 300) */
  baseDelayMs: number;
  /** Maximum delay cap in milliseconds (default: 30000) */
  maxDelayMs: number;
  /** Jitter factor as decimal (0.1 = 10% jitter) (default: 0.1) */
  jitter: number;
  /** Request timeout in milliseconds (default: 10000) */
  timeoutMs: number;
  /** Custom function to determine if an error/response should trigger retry */
  retryOn?: (error: Error, response?: Response) => boolean;
}

/**
 * Error thrown when all retry attempts are exhausted
 */
export class ResilientFetchError extends Error {
  /** The URL that was being fetched */
  readonly url: string;
  /** Number of attempts made */
  readonly attempts: number;
  /** The last error encountered */
  readonly lastError: Error;
  /** The last response received (if any) */
  readonly lastResponse?: Response;
  /** Whether the error is considered retryable */
  readonly isRetryable: boolean;
  /** HTTP status code if available */
  readonly statusCode?: number;

  constructor(
    message: string,
    url: string,
    attempts: number,
    lastError: Error,
    lastResponse?: Response,
    isRetryable: boolean = false
  ) {
    super(message);
    this.name = 'ResilientFetchError';
    this.url = url;
    this.attempts = attempts;
    this.lastError = lastError;
    this.lastResponse = lastResponse;
    this.isRetryable = isRetryable;
    this.statusCode = lastResponse?.status;
  }
}

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 300,
  maxDelayMs: 30000,
  jitter: 0.1,
  timeoutMs: 10000,
};

/**
 * HTTP status codes that are considered retryable
 */
const RETRYABLE_STATUS_CODES = new Set([
  408, // Request Timeout
  429, // Too Many Requests
  500, // Internal Server Error
  502, // Bad Gateway
  503, // Service Unavailable
  504, // Gateway Timeout
  522, // Connection Timed Out (Cloudflare)
  524, // A Timeout Occurred (Cloudflare)
]);

/**
 * Determines if an error is a network-level error that should be retried
 */
function isNetworkError(error: Error): boolean {
  const networkErrorPatterns = [
    'ECONNRESET',
    'ECONNREFUSED',
    'ENOTFOUND',
    'ETIMEDOUT',
    'EPIPE',
    'EAI_AGAIN',
    'EHOSTUNREACH',
    'ENETUNREACH',
    'fetch failed',
    'network error',
  ];

  const message = error.message.toLowerCase();
  const name = error.name.toLowerCase();

  return networkErrorPatterns.some(
    pattern => message.includes(pattern.toLowerCase()) || name.includes(pattern.toLowerCase())
  );
}

/**
 * Determines if a response status code is retryable
 */
function isRetryableStatus(status: number): boolean {
  return RETRYABLE_STATUS_CODES.has(status);
}

/**
 * Default function to determine if an error/response should be retried
 */
function defaultShouldRetry(error: Error, response?: Response): boolean {
  // Timeout errors are retryable
  if (error.name === 'AbortError') {
    return true;
  }

  // Network errors are retryable
  if (isNetworkError(error)) {
    return true;
  }

  // Check response status code
  if (response && isRetryableStatus(response.status)) {
    return true;
  }

  return false;
}

/**
 * Parses the Retry-After header value
 * @returns Delay in milliseconds, or null if header is not present/parseable
 */
function parseRetryAfter(response: Response): number | null {
  const retryAfter = response.headers.get('Retry-After');
  if (!retryAfter) {
    return null;
  }

  // Try parsing as seconds (integer)
  const seconds = parseInt(retryAfter, 10);
  if (!isNaN(seconds)) {
    return seconds * 1000;
  }

  // Try parsing as HTTP-date
  const date = Date.parse(retryAfter);
  if (!isNaN(date)) {
    const delayMs = date - Date.now();
    return delayMs > 0 ? delayMs : null;
  }

  return null;
}

/**
 * Calculates the delay for a retry attempt with exponential backoff and jitter
 */
function calculateDelay(attempt: number, config: RetryConfig, response?: Response): number {
  // Check for Retry-After header (especially for 429 responses)
  if (response?.status === 429) {
    const retryAfterMs = parseRetryAfter(response);
    if (retryAfterMs !== null) {
      // Add a small amount of jitter to Retry-After to prevent thundering herd
      const jitterFactor = 1 + Math.random() * config.jitter;
      return Math.min(retryAfterMs * jitterFactor, config.maxDelayMs);
    }
  }

  // Exponential backoff: delay = min(baseDelay * 2^attempt, maxDelay)
  const exponentialDelay = config.baseDelayMs * Math.pow(2, attempt);
  const cappedDelay = Math.min(exponentialDelay, config.maxDelayMs);

  // Add jitter: delay *= (1 + random() * jitter)
  const jitterFactor = 1 + Math.random() * config.jitter;
  return cappedDelay * jitterFactor;
}

/**
 * Delays execution for a specified number of milliseconds
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Performs an HTTP fetch with resilience features including retries,
 * exponential backoff, jitter, and timeout handling.
 *
 * @param url - The URL to fetch
 * @param options - Standard fetch RequestInit options
 * @param config - Retry configuration options
 * @returns Parsed JSON response of type T
 * @throws ResilientFetchError when all retries are exhausted
 *
 * @example
 * ```typescript
 * // Basic usage
 * const data = await resilientFetch<UserData>('https://api.example.com/users/1');
 *
 * // With custom configuration
 * const data = await resilientFetch<OrderData>(
 *   'https://api.example.com/orders',
 *   { method: 'POST', body: JSON.stringify(order) },
 *   { maxRetries: 5, timeoutMs: 30000 }
 * );
 *
 * // With custom retry logic
 * const data = await resilientFetch<Data>(
 *   url,
 *   options,
 *   {
 *     retryOn: (error, response) => {
 *       // Only retry on specific conditions
 *       return response?.status === 503;
 *     }
 *   }
 * );
 * ```
 */
export async function resilientFetch<T>(
  url: string,
  options?: RequestInit,
  config?: Partial<RetryConfig>
): Promise<T> {
  const mergedConfig: RetryConfig = { ...DEFAULT_CONFIG, ...config };
  const shouldRetry = mergedConfig.retryOn ?? defaultShouldRetry;

  let lastError: Error = new Error('No attempts made');
  let lastResponse: Response | undefined;

  for (let attempt = 0; attempt <= mergedConfig.maxRetries; attempt++) {
    // Create AbortController for timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), mergedConfig.timeoutMs);

    try {
      // Merge abort signal with any existing signal
      const requestOptions: RequestInit = {
        ...options,
        signal: controller.signal,
      };

      const response = await fetch(url, requestOptions);
      clearTimeout(timeoutId);
      lastResponse = response;

      // Check if response is successful
      if (response.ok) {
        return (await response.json()) as T;
      }

      // Response not OK - create error for retry logic
      const errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      lastError = new Error(errorMessage);

      // Check if we should retry based on response
      if (attempt < mergedConfig.maxRetries && shouldRetry(lastError, response)) {
        const delayMs = calculateDelay(attempt, mergedConfig, response);
        await delay(delayMs);
        continue;
      }

      // Non-retryable error or max retries reached
      throw new ResilientFetchError(
        `Request failed after ${attempt + 1} attempt(s): ${errorMessage}`,
        url,
        attempt + 1,
        lastError,
        response,
        isRetryableStatus(response.status)
      );
    } catch (error) {
      clearTimeout(timeoutId);

      // Already a ResilientFetchError - rethrow
      if (error instanceof ResilientFetchError) {
        throw error;
      }

      // Convert to Error if needed
      lastError = error instanceof Error ? error : new Error(String(error));

      // Handle AbortError (timeout)
      if (lastError.name === 'AbortError') {
        lastError = new Error(`Request timed out after ${mergedConfig.timeoutMs}ms`);
        lastError.name = 'AbortError';
      }

      // Check if we should retry
      if (attempt < mergedConfig.maxRetries && shouldRetry(lastError, lastResponse)) {
        const delayMs = calculateDelay(attempt, mergedConfig, lastResponse);
        await delay(delayMs);
        continue;
      }

      // Max retries reached or non-retryable error
      throw new ResilientFetchError(
        `Request failed after ${attempt + 1} attempt(s): ${lastError.message}`,
        url,
        attempt + 1,
        lastError,
        lastResponse,
        isNetworkError(lastError) || lastError.name === 'AbortError'
      );
    }
  }

  // This should not be reached, but TypeScript needs it
  throw new ResilientFetchError(
    `Request failed after ${mergedConfig.maxRetries + 1} attempt(s): ${lastError.message}`,
    url,
    mergedConfig.maxRetries + 1,
    lastError,
    lastResponse,
    false
  );
}

/**
 * Convenience function to check if an error is a ResilientFetchError
 */
export function isResilientFetchError(error: unknown): error is ResilientFetchError {
  return error instanceof ResilientFetchError;
}

/**
 * Convenience function to check if an error was caused by rate limiting
 */
export function isRateLimitError(error: unknown): boolean {
  if (error instanceof ResilientFetchError) {
    return error.statusCode === 429;
  }
  return false;
}

/**
 * Convenience function to check if an error was caused by a timeout
 */
export function isTimeoutError(error: unknown): boolean {
  if (error instanceof ResilientFetchError) {
    return error.lastError.name === 'AbortError';
  }
  return false;
}
