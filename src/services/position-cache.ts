import { promises as fs } from 'fs';
import path from 'path';
import type { Domain, Position } from '../types/index.js';

interface PartialCloseRecord {
  timestamp: string;
  proportion: number; // 0-1
  realizedValueUsd: number;
  realizedPnlUsd: number;
}

interface CachedEntry {
  position: Position;
  partialHistory: PartialCloseRecord[];
  closed: boolean;
  updatedAt: string;
}

type DomainCache = Map<string, CachedEntry>;

const CACHE_DIR = path.join(process.cwd(), '.claude', 'cache');
const CACHE_FILE = path.join(CACHE_DIR, 'positions.json');

interface PersistedCache {
  [domain: string]: {
    [id: string]: CachedEntry;
  };
}

class PositionCache {
  private cache = new Map<Domain, DomainCache>();
  private isLoaded = false;

  constructor() {
    void this.loadFromDisk();
  }

  private getDomainCache(domain: Domain): DomainCache {
    if (!this.cache.has(domain)) {
      this.cache.set(domain, new Map());
    }
    return this.cache.get(domain)!;
  }

  update(domain: Domain, positions: Position[]): void {
    const domainCache = this.getDomainCache(domain);
    const now = new Date().toISOString();

    // Merge or insert positions
    for (const position of positions) {
      const existing = domainCache.get(position.id);
      domainCache.set(position.id, {
        position,
        partialHistory: existing?.partialHistory ?? [],
        closed: position.status === 'closed',
        updatedAt: now,
      });
    }

    // Remove entries that are no longer returned (unless we want to keep history)
    for (const cachedId of domainCache.keys()) {
      if (!positions.find(p => p.id === cachedId)) {
        const existing = domainCache.get(cachedId);
        if (existing && existing.position.status !== 'closed') {
          existing.position.status = 'closed';
          existing.closed = true;
          existing.updatedAt = now;
        }
      }
    }

    void this.saveToDisk();
  }

  /**
   * Record a partial close so history survives restarts
   */
  recordPartialClose(
    domain: Domain,
    position: Position,
    proportion: number,
    realizedValueUsd: number,
    realizedPnlUsd: number
  ): void {
    const domainCache = this.getDomainCache(domain);
    const entry = domainCache.get(position.id) ?? {
      position,
      partialHistory: [],
      closed: false,
      updatedAt: new Date().toISOString(),
    };

    entry.partialHistory.push({
      timestamp: new Date().toISOString(),
      proportion,
      realizedValueUsd,
      realizedPnlUsd,
    });

    // Update cached position snapshot to reflect remaining value
    entry.position.currentValueUsd = Math.max(0, entry.position.currentValueUsd - realizedValueUsd);
    entry.updatedAt = new Date().toISOString();

    domainCache.set(position.id, entry);
    void this.saveToDisk();
  }

  markClosed(domain: Domain, position: Position, realizedPnlUsd: number): void {
    const domainCache = this.getDomainCache(domain);
    const entry = domainCache.get(position.id) ?? {
      position,
      partialHistory: [],
      closed: false,
      updatedAt: new Date().toISOString(),
    };

    entry.position.status = 'closed';
    entry.position.closedAt = new Date().toISOString();
    entry.position.realizedPnl = realizedPnlUsd;
    entry.closed = true;
    entry.updatedAt = new Date().toISOString();
    domainCache.set(position.id, entry);
    void this.saveToDisk();
  }

  get(domain: Domain): Position[] {
    return Array.from(this.getDomainCache(domain).values()).map(entry => entry.position);
  }

  find(domain: Domain, predicate: (position: Position) => boolean): Position | undefined {
    return this.get(domain).find(predicate);
  }

  private async loadFromDisk(): Promise<void> {
    if (this.isLoaded) return;
    this.isLoaded = true;

    try {
      const content = await fs.readFile(CACHE_FILE, 'utf-8');
      const data = JSON.parse(content) as PersistedCache;

      for (const domain of Object.keys(data) as Domain[]) {
        const domainMap: DomainCache = new Map();
        for (const [id, entry] of Object.entries(data[domain])) {
          domainMap.set(id, entry);
        }
        this.cache.set(domain, domainMap);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        console.warn('[PositionCache] Failed to load cache:', error);
      }
    }
  }

  private async saveToDisk(): Promise<void> {
    try {
      await fs.mkdir(CACHE_DIR, { recursive: true });
      const serializable: PersistedCache = {};

      for (const [domain, entries] of this.cache.entries()) {
        serializable[domain] = {};
        for (const [id, entry] of entries.entries()) {
          serializable[domain][id] = entry;
        }
      }

      await fs.writeFile(CACHE_FILE, JSON.stringify(serializable, null, 2), 'utf-8');
    } catch (error) {
      console.warn('[PositionCache] Failed to persist cache:', error);
    }
  }
}

export const positionCache = new PositionCache();
