/**
 * Transcript Store
 *
 * JSONL-based transcript storage for conversation history.
 * Provides persistence, rotation, and compression of transcripts.
 *
 * Structure:
 * .claude/transcripts/
 *   dlmm/
 *     2024-01-07-abc123.jsonl
 *     2024-01-06-def456.jsonl.gz  (compressed)
 *   perps/
 *     ...
 */

import { promises as fs } from 'fs';
import path from 'path';
import { createGzip, createGunzip } from 'zlib';
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';
import type { Domain } from '../types/index.js';
import type { TranscriptEntry } from './types.js';

const DEFAULT_BASE_DIR = '.claude/transcripts';
const RETENTION_DAYS = 30;
const COMPRESSION_AGE_HOURS = 24;

export class TranscriptStore {
  private baseDir: string;

  constructor(baseDir?: string) {
    this.baseDir = baseDir || path.join(process.cwd(), DEFAULT_BASE_DIR);
  }

  /**
   * Append a single entry to the session transcript
   */
  async append(domain: Domain, sessionId: string, entry: TranscriptEntry): Promise<void> {
    await this.ensureDir(domain);

    const filePath = this.getSessionPath(domain, sessionId);
    const line = JSON.stringify(entry) + '\n';

    await fs.appendFile(filePath, line, 'utf-8');
  }

  /**
   * Read all entries from a session
   */
  async readSession(domain: Domain, sessionId: string): Promise<TranscriptEntry[]> {
    const filePath = this.getSessionPath(domain, sessionId);
    const entries: TranscriptEntry[] = [];

    try {
      // Check if compressed version exists
      const gzPath = filePath + '.gz';
      let content: string;

      try {
        await fs.access(gzPath);
        // Read from compressed file
        content = await this.readGzipFile(gzPath);
      } catch {
        // Read from regular file
        content = await fs.readFile(filePath, 'utf-8');
      }

      const lines = content.trim().split('\n');
      for (const line of lines) {
        if (line.trim()) {
          try {
            entries.push(JSON.parse(line));
          } catch (parseError) {
            console.error(`[TranscriptStore] Failed to parse line: ${line}`, parseError);
          }
        }
      }
    } catch (error) {
      // File doesn't exist
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return entries;
  }

  /**
   * List recent session files for a domain
   */
  async listSessions(domain: Domain, days: number = 7): Promise<string[]> {
    const domainDir = path.join(this.baseDir, domain);
    const sessions: string[] = [];

    try {
      const files = await fs.readdir(domainDir);
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - days);

      for (const file of files) {
        // Match pattern: YYYY-MM-DD-sessionId.jsonl or .jsonl.gz
        const match = file.match(/^(\d{4}-\d{2}-\d{2})-(.+?)\.jsonl(\.gz)?$/);
        if (match) {
          const dateStr = match[1];
          const fileDate = new Date(dateStr);

          if (fileDate >= cutoffDate) {
            // Extract session ID without extension
            const sessionId = match[2];
            sessions.push(`${dateStr}-${sessionId}`);
          }
        }
      }

      // Sort by date descending (most recent first)
      sessions.sort((a, b) => b.localeCompare(a));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error;
      }
    }

    return sessions;
  }

  /**
   * Get the file path for a session
   */
  getSessionPath(domain: Domain, sessionId: string): string {
    return path.join(this.baseDir, domain, `${sessionId}.jsonl`);
  }

  /**
   * Rotate old transcripts: gzip files older than 24h, delete older than RETENTION_DAYS
   */
  async rotate(): Promise<{ gzipped: number; deleted: number }> {
    const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
    let gzipped = 0;
    let deleted = 0;

    const now = new Date();
    const compressionCutoff = new Date(now.getTime() - COMPRESSION_AGE_HOURS * 60 * 60 * 1000);
    const deletionCutoff = new Date(now.getTime() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    for (const domain of domains) {
      const domainDir = path.join(this.baseDir, domain);

      try {
        const files = await fs.readdir(domainDir);

        for (const file of files) {
          const filePath = path.join(domainDir, file);
          const stat = await fs.stat(filePath);

          // Handle .jsonl files (not yet compressed)
          if (file.endsWith('.jsonl') && !file.endsWith('.jsonl.gz')) {
            const fileDate = this.extractDateFromFilename(file);

            if (fileDate) {
              // Delete if older than retention period
              if (fileDate < deletionCutoff) {
                await fs.unlink(filePath);
                deleted++;
                console.log(`[TranscriptStore] Deleted old transcript: ${file}`);
                continue;
              }

              // Compress if older than compression age
              if (fileDate < compressionCutoff) {
                await this.gzipFile(filePath);
                await fs.unlink(filePath);
                gzipped++;
                console.log(`[TranscriptStore] Compressed transcript: ${file}`);
              }
            }
          }

          // Handle .jsonl.gz files (already compressed)
          if (file.endsWith('.jsonl.gz')) {
            const fileDate = this.extractDateFromFilename(file);

            if (fileDate && fileDate < deletionCutoff) {
              await fs.unlink(filePath);
              deleted++;
              console.log(`[TranscriptStore] Deleted old compressed transcript: ${file}`);
            }
          }
        }
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.error(`[TranscriptStore] Error rotating ${domain}:`, error);
        }
      }
    }

    return { gzipped, deleted };
  }

  /**
   * Ensure directory exists for a domain
   */
  private async ensureDir(domain: Domain): Promise<void> {
    const dir = path.join(this.baseDir, domain);
    await fs.mkdir(dir, { recursive: true });
  }

  /**
   * Extract date from filename
   */
  private extractDateFromFilename(filename: string): Date | null {
    const match = filename.match(/^(\d{4}-\d{2}-\d{2})/);
    if (match) {
      return new Date(match[1]);
    }
    return null;
  }

  /**
   * Compress a file using gzip
   */
  private async gzipFile(filePath: string): Promise<void> {
    const gzPath = filePath + '.gz';

    await pipeline(
      createReadStream(filePath),
      createGzip(),
      createWriteStream(gzPath)
    );
  }

  /**
   * Read a gzipped file
   */
  private async readGzipFile(gzPath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      const gunzip = createGunzip();

      createReadStream(gzPath)
        .pipe(gunzip)
        .on('data', (chunk: Buffer) => chunks.push(chunk))
        .on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')))
        .on('error', reject);
    });
  }

  /**
   * Generate a new session ID with current date prefix
   */
  static generateSessionId(): string {
    const dateStr = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const randomId = Math.random().toString(36).substring(2, 10);
    return `${dateStr}-${randomId}`;
  }
}
