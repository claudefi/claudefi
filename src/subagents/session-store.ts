/**
 * Session Store
 *
 * Persists Agent SDK session IDs for conversation continuity.
 * Each domain agent maintains its own session, allowing it to
 * remember context across trading cycles.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import type { Domain } from '../types/index.js';

const CACHE_DIR = '.cache/claudefi-sessions';
const SESSION_FILE = 'sessions.json';

interface SessionData {
  sessions: Record<Domain, string | null>;
  lastUpdated: string;
  metadata: Record<Domain, {
    createdAt?: string;
    turnCount?: number;
    lastActive?: string;
  }>;
}

/**
 * Session store for persisting agent session IDs
 */
export class SessionStore {
  private cacheDir: string;
  private sessionFile: string;
  private data: SessionData | null = null;

  constructor(baseDir?: string) {
    this.cacheDir = path.join(baseDir || process.cwd(), CACHE_DIR);
    this.sessionFile = path.join(this.cacheDir, SESSION_FILE);
  }

  /**
   * Initialize the store (create directories if needed)
   */
  async init(): Promise<void> {
    try {
      await fs.mkdir(this.cacheDir, { recursive: true });
      await this.load();
    } catch (error) {
      console.warn('[SessionStore] Init warning:', error);
      this.data = this.createEmptyData();
    }
  }

  /**
   * Load session data from disk
   */
  private async load(): Promise<void> {
    try {
      const raw = await fs.readFile(this.sessionFile, 'utf-8');
      this.data = JSON.parse(raw);
    } catch {
      this.data = this.createEmptyData();
    }
  }

  /**
   * Save session data to disk
   */
  private async save(): Promise<void> {
    if (!this.data) return;
    this.data.lastUpdated = new Date().toISOString();
    await fs.writeFile(this.sessionFile, JSON.stringify(this.data, null, 2));
  }

  /**
   * Create empty session data structure
   */
  private createEmptyData(): SessionData {
    return {
      sessions: {
        dlmm: null,
        perps: null,
        polymarket: null,
        spot: null,
      },
      lastUpdated: new Date().toISOString(),
      metadata: {
        dlmm: {},
        perps: {},
        polymarket: {},
        spot: {},
      },
    };
  }

  /**
   * Get session ID for a domain
   */
  async getSessionId(domain: Domain): Promise<string | null> {
    if (!this.data) await this.load();
    return this.data?.sessions[domain] ?? null;
  }

  /**
   * Set session ID for a domain
   */
  async setSessionId(domain: Domain, sessionId: string): Promise<void> {
    if (!this.data) {
      this.data = this.createEmptyData();
    }

    const isNew = !this.data.sessions[domain];
    this.data.sessions[domain] = sessionId;

    // Update metadata
    if (!this.data.metadata[domain]) {
      this.data.metadata[domain] = {};
    }
    if (isNew) {
      this.data.metadata[domain].createdAt = new Date().toISOString();
      this.data.metadata[domain].turnCount = 0;
    }
    this.data.metadata[domain].lastActive = new Date().toISOString();
    this.data.metadata[domain].turnCount = (this.data.metadata[domain].turnCount || 0) + 1;

    await this.save();
  }

  /**
   * Clear session for a domain (start fresh)
   */
  async clearSession(domain: Domain): Promise<void> {
    if (!this.data) {
      this.data = this.createEmptyData();
    }
    this.data.sessions[domain] = null;
    this.data.metadata[domain] = {};
    await this.save();
    console.log(`[SessionStore] Cleared session for ${domain}`);
  }

  /**
   * Clear all sessions
   */
  async clearAll(): Promise<void> {
    this.data = this.createEmptyData();
    await this.save();
    console.log('[SessionStore] Cleared all sessions');
  }

  /**
   * Get session metadata
   */
  async getMetadata(domain: Domain): Promise<{
    createdAt?: string;
    turnCount?: number;
    lastActive?: string;
  }> {
    if (!this.data) await this.load();
    return this.data?.metadata[domain] ?? {};
  }

  /**
   * Get all session statuses
   */
  async getStatus(): Promise<{
    sessions: Record<Domain, { active: boolean; turnCount: number; lastActive?: string }>;
    lastUpdated: string;
  }> {
    if (!this.data) await this.load();

    const data = this.data ?? this.createEmptyData();
    const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];

    const sessions = Object.fromEntries(
      domains.map(domain => [
        domain,
        {
          active: !!data.sessions[domain],
          turnCount: data.metadata[domain]?.turnCount ?? 0,
          lastActive: data.metadata[domain]?.lastActive,
        },
      ])
    ) as Record<Domain, { active: boolean; turnCount: number; lastActive?: string }>;

    return {
      sessions,
      lastUpdated: data.lastUpdated,
    };
  }

  /**
   * Check if a domain has an active session
   */
  async hasSession(domain: Domain): Promise<boolean> {
    const sessionId = await this.getSessionId(domain);
    return sessionId !== null;
  }
}

// Singleton instance
export const sessionStore = new SessionStore();
