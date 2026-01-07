/**
 * Cache Layer with Redis/In-Memory Fallback
 *
 * Provides a unified caching interface that:
 * 1. Uses Redis if REDIS_URL is configured
 * 2. Falls back to in-memory Map otherwise
 *
 * Perfect for local-first development without external dependencies.
 */

interface CacheEntry<T> {
  value: T;
  expires: number | null; // null = no expiration
}

interface CacheInterface {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  clear(): Promise<void>;
  keys(pattern?: string): Promise<string[]>;
}

/**
 * In-Memory Cache Implementation
 */
class MemoryCache implements CacheInterface {
  private store: Map<string, CacheEntry<unknown>> = new Map();
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every 60 seconds
    this.cleanupInterval = setInterval(() => this.cleanup(), 60000);
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (entry.expires !== null && entry.expires < now) {
        this.store.delete(key);
      }
    }
  }

  async get<T>(key: string): Promise<T | null> {
    const entry = this.store.get(key);
    if (!entry) return null;

    // Check expiration
    if (entry.expires !== null && entry.expires < Date.now()) {
      this.store.delete(key);
      return null;
    }

    return entry.value as T;
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const expires = ttlSeconds ? Date.now() + ttlSeconds * 1000 : null;
    this.store.set(key, { value, expires });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async clear(): Promise<void> {
    this.store.clear();
  }

  async keys(pattern?: string): Promise<string[]> {
    const allKeys = Array.from(this.store.keys());
    if (!pattern) return allKeys;

    // Simple glob pattern matching (supports * wildcard)
    const regex = new RegExp('^' + pattern.replace(/\*/g, '.*') + '$');
    return allKeys.filter(k => regex.test(k));
  }

  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }
}

/**
 * Redis Cache Implementation (optional)
 */
class RedisCache implements CacheInterface {
  private client: any; // Redis client type

  constructor(client: any) {
    this.client = client;
  }

  async get<T>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (!value) return null;
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  async set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> {
    const serialized = JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.setEx(key, ttlSeconds, serialized);
    } else {
      await this.client.set(key, serialized);
    }
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async clear(): Promise<void> {
    await this.client.flushDb();
  }

  async keys(pattern?: string): Promise<string[]> {
    return this.client.keys(pattern || '*');
  }
}

// Singleton cache instance
let cacheInstance: CacheInterface | null = null;

/**
 * Get the cache instance (creates on first call)
 */
export async function getCache(): Promise<CacheInterface> {
  if (cacheInstance) return cacheInstance;

  const redisUrl = process.env.REDIS_URL;

  if (redisUrl) {
    try {
      // Dynamic import to avoid requiring redis when not used
      // @ts-ignore - redis is an optional dependency
      const { createClient } = await import('redis');
      const client = createClient({ url: redisUrl });

      client.on('error', (err: Error) => {
        console.error('[Cache] Redis error:', err.message);
      });

      await client.connect();
      console.log('[Cache] Connected to Redis');
      cacheInstance = new RedisCache(client);
    } catch (error) {
      console.warn('[Cache] Redis connection failed, falling back to in-memory:', error);
      cacheInstance = new MemoryCache();
    }
  } else {
    console.log('[Cache] Using in-memory cache (no REDIS_URL configured)');
    cacheInstance = new MemoryCache();
  }

  return cacheInstance;
}

/**
 * Cache key prefixes for different data types
 */
export const CacheKeys = {
  // Portfolio
  portfolioSummary: 'portfolio:summary',

  // Session state
  session: (id: string) => `session:${id}`,

  // Market data (short TTL)
  marketData: (domain: string, id: string) => `market:${domain}:${id}`,
} as const;

/**
 * Default TTL values in seconds
 */
export const CacheTTL = {
  PORTFOLIO_SUMMARY: 60,      // 1 minute
  MARKET_DATA: 300,           // 5 minutes
  SESSION: 3600,              // 1 hour
} as const;
