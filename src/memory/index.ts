/**
 * Memory System
 *
 * Provides persistent memory for agents across sessions.
 * Memory is stored in markdown files for easy inspection.
 *
 * Structure:
 * .claude/memory/
 *   ├── dlmm/
 *   │   ├── MEMORY.md        # Persistent facts
 *   │   ├── 2024-01-07.md    # Daily log
 *   │   └── 2024-01-06.md
 *   ├── perps/
 *   │   └── ...
 *   ├── polymarket/
 *   │   └── ...
 *   ├── spot/
 *   │   └── ...
 *   └── general/
 *       └── MEMORY.md        # Cross-domain facts
 */

import { promises as fs } from 'fs';
import path from 'path';
import type { Domain } from '../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A memory fact with metadata
 */
export interface MemoryFact {
  fact: string;
  importance: 'low' | 'medium' | 'high';
  source?: string;      // What triggered this memory
  timestamp: Date;
  expiresAt?: Date;     // Optional expiration
  domain: Domain | 'general';
}

/**
 * Daily memory entry
 */
export interface DailyMemoryEntry {
  timestamp: Date;
  type: 'observation' | 'learning' | 'decision' | 'outcome' | 'error';
  content: string;
  metadata?: Record<string, unknown>;
}

/**
 * Memory context for prompts
 */
export interface MemoryContext {
  persistentFacts: string[];
  recentDailyLogs: string[];
  generalFacts: string[];
}

// =============================================================================
// CONFIGURATION
// =============================================================================

const MEMORY_BASE_DIR = path.join(process.cwd(), '.claude', 'memory');
const DAYS_TO_LOAD = 7; // Load last 7 days of daily logs
const MAX_FACTS_IN_PROMPT = 20; // Limit facts in prompt to avoid context bloat

// =============================================================================
// FILE HELPERS
// =============================================================================

/**
 * Get path to domain memory directory
 */
function getDomainMemoryDir(domain: Domain | 'general'): string {
  return path.join(MEMORY_BASE_DIR, domain);
}

/**
 * Get path to persistent memory file
 */
function getMemoryFilePath(domain: Domain | 'general'): string {
  return path.join(getDomainMemoryDir(domain), 'MEMORY.md');
}

/**
 * Get path to daily log file
 */
function getDailyLogPath(domain: Domain | 'general', date: Date = new Date()): string {
  const dateStr = date.toISOString().split('T')[0]; // YYYY-MM-DD
  return path.join(getDomainMemoryDir(domain), `${dateStr}.md`);
}

/**
 * Ensure memory directories exist
 */
async function ensureMemoryDirs(domain: Domain | 'general'): Promise<void> {
  const dir = getDomainMemoryDir(domain);
  await fs.mkdir(dir, { recursive: true });
}

// =============================================================================
// PERSISTENT MEMORY
// =============================================================================

/**
 * Remember a fact persistently
 */
export async function remember(
  domain: Domain | 'general',
  fact: string,
  importance: 'low' | 'medium' | 'high' = 'medium',
  source?: string
): Promise<void> {
  await ensureMemoryDirs(domain);

  const filePath = getMemoryFilePath(domain);

  // Read existing content
  let content = '';
  try {
    content = await fs.readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist, start fresh
    content = `# ${domain === 'general' ? 'General' : domain.toUpperCase()} Memory\n\nPersistent facts and knowledge.\n\n---\n\n`;
  }

  // Add new fact
  const timestamp = new Date().toISOString();
  const importanceEmoji = { low: '📝', medium: '📌', high: '⭐' }[importance];
  const sourceText = source ? ` (from: ${source})` : '';

  const newFact = `${importanceEmoji} **[${importance.toUpperCase()}]** ${fact}${sourceText}\n_Added: ${timestamp}_\n\n`;

  content += newFact;

  await fs.writeFile(filePath, content, 'utf-8');
  console.log(`[Memory] Remembered ${importance} fact for ${domain}`);
}

/**
 * Read all persistent facts for a domain
 */
export async function recall(domain: Domain | 'general'): Promise<string[]> {
  const filePath = getMemoryFilePath(domain);

  try {
    const content = await fs.readFile(filePath, 'utf-8');

    // Parse facts from markdown
    const facts: string[] = [];
    const lines = content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // Match fact lines (emoji followed by importance tag)
      if (line.match(/^[📝📌⭐] \*\*\[/)) {
        // Extract just the fact text
        const factMatch = line.match(/^\S+ \*\*\[\w+\]\*\* (.+?)(?:\s*\(from:.*\))?$/);
        if (factMatch) {
          facts.push(factMatch[1]);
        }
      }
    }

    return facts;
  } catch {
    return [];
  }
}

/**
 * Clear expired facts from memory
 * Parses expiration dates from facts and removes expired entries
 */
export async function clearExpiredFacts(domain: Domain | 'general'): Promise<number> {
  const filePath = getMemoryFilePath(domain);

  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const lines = content.split('\n');
    const now = new Date();
    let removedCount = 0;
    const keptLines: string[] = [];
    let skipNextLine = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Skip lines marked for removal
      if (skipNextLine) {
        skipNextLine = false;
        continue;
      }

      // Check for expiration in fact metadata
      // Format: "_Expires: 2024-01-15T00:00:00.000Z_" or "_Added: ... | Expires: ..._"
      const expiresMatch = line.match(/_(?:Expires|expires):\s*(\d{4}-\d{2}-\d{2}(?:T[\d:\.]+Z)?)/);

      if (expiresMatch) {
        const expiresDate = new Date(expiresMatch[1]);
        if (expiresDate < now) {
          // This is an expiration line, and it's expired
          // Remove the previous fact line too (fact is above its metadata)
          if (keptLines.length > 0) {
            const lastLine = keptLines[keptLines.length - 1];
            if (lastLine.match(/^[📝📌⭐] \*\*\[/)) {
              keptLines.pop(); // Remove the expired fact
              removedCount++;
            }
          }
          continue; // Skip the expiration line itself
        }
      }

      // Check for inline expiration in the fact line itself
      // Format: "[EXPIRES: 2024-01-15]" within the fact text
      if (line.match(/^[📝📌⭐] \*\*\[/)) {
        const inlineExpires = line.match(/\[EXPIRES:\s*(\d{4}-\d{2}-\d{2})\]/i);
        if (inlineExpires) {
          const expiresDate = new Date(inlineExpires[1]);
          if (expiresDate < now) {
            removedCount++;
            // Skip the metadata line that follows
            skipNextLine = true;
            continue;
          }
        }
      }

      keptLines.push(line);
    }

    if (removedCount > 0) {
      await fs.writeFile(filePath, keptLines.join('\n'), 'utf-8');
      console.log(`[Memory] Cleared ${removedCount} expired fact(s) from ${domain}`);
    }

    return removedCount;
  } catch {
    return 0;
  }
}

// =============================================================================
// DAILY LOGS
// =============================================================================

/**
 * Log a memory entry for today
 */
export async function logDailyMemory(
  domain: Domain | 'general',
  type: DailyMemoryEntry['type'],
  content: string,
  metadata?: Record<string, unknown>
): Promise<void> {
  await ensureMemoryDirs(domain);

  const filePath = getDailyLogPath(domain);
  const timestamp = new Date().toISOString();

  // Read existing content
  let existingContent = '';
  try {
    existingContent = await fs.readFile(filePath, 'utf-8');
  } catch {
    // File doesn't exist, create header
    const dateStr = new Date().toISOString().split('T')[0];
    existingContent = `# ${domain === 'general' ? 'General' : domain.toUpperCase()} Daily Log - ${dateStr}\n\n`;
  }

  // Type emojis
  const typeEmoji = {
    observation: '👁️',
    learning: '🎓',
    decision: '🎯',
    outcome: '📊',
    error: '❌',
  }[type];

  // Format entry
  let entry = `\n### ${typeEmoji} ${type.toUpperCase()} - ${timestamp}\n\n${content}\n`;

  if (metadata && Object.keys(metadata).length > 0) {
    entry += `\n<details>\n<summary>Metadata</summary>\n\n\`\`\`json\n${JSON.stringify(metadata, null, 2)}\n\`\`\`\n</details>\n`;
  }

  existingContent += entry;

  await fs.writeFile(filePath, existingContent, 'utf-8');
}

/**
 * Read daily log for a specific date
 */
export async function readDailyLog(
  domain: Domain | 'general',
  date: Date = new Date()
): Promise<string> {
  const filePath = getDailyLogPath(domain, date);

  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Read recent daily logs (last N days)
 */
export async function readRecentDailyLogs(
  domain: Domain | 'general',
  days: number = DAYS_TO_LOAD
): Promise<string[]> {
  const logs: string[] = [];
  const now = new Date();

  for (let i = 0; i < days; i++) {
    const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
    const log = await readDailyLog(domain, date);
    if (log) {
      logs.push(log);
    }
  }

  return logs;
}

// =============================================================================
// MEMORY CONTEXT FOR PROMPTS
// =============================================================================

/**
 * Get full memory context for a domain (for injection into prompts)
 */
export async function getMemoryContext(domain: Domain): Promise<MemoryContext> {
  const [domainFacts, generalFacts, recentLogs] = await Promise.all([
    recall(domain),
    recall('general'),
    readRecentDailyLogs(domain, 3), // Last 3 days for prompts
  ]);

  return {
    persistentFacts: domainFacts.slice(0, MAX_FACTS_IN_PROMPT),
    recentDailyLogs: recentLogs,
    generalFacts: generalFacts.slice(0, 10), // Limit general facts
  };
}

/**
 * Format memory context for injection into prompts
 */
export async function formatMemoryForPrompt(domain: Domain): Promise<string> {
  const context = await getMemoryContext(domain);

  if (
    context.persistentFacts.length === 0 &&
    context.generalFacts.length === 0 &&
    context.recentDailyLogs.length === 0
  ) {
    return '';
  }

  let output = '## Agent Memory\n\n';

  // General facts
  if (context.generalFacts.length > 0) {
    output += '### Cross-Domain Knowledge\n';
    for (const fact of context.generalFacts) {
      output += `- ${fact}\n`;
    }
    output += '\n';
  }

  // Domain-specific facts
  if (context.persistentFacts.length > 0) {
    output += `### ${domain.toUpperCase()} Knowledge\n`;
    for (const fact of context.persistentFacts) {
      output += `- ${fact}\n`;
    }
    output += '\n';
  }

  // Recent activity (summarized)
  if (context.recentDailyLogs.length > 0) {
    output += '### Recent Activity Summary\n';
    output += '_Last few days of activity are available for context._\n\n';
    // Don't include full logs to avoid context bloat
    // Just indicate they exist
  }

  return output;
}

// =============================================================================
// MEMORY TOOLS (for agents)
// =============================================================================

/**
 * Tool handler: Remember a fact
 * Can be exposed as an MCP tool
 */
export async function handleRememberTool(args: {
  domain: Domain | 'general';
  fact: string;
  importance?: 'low' | 'medium' | 'high';
}): Promise<string> {
  await remember(args.domain, args.fact, args.importance || 'medium');
  return `Fact stored in ${args.domain} memory.`;
}

/**
 * Tool handler: Recall facts
 * Can be exposed as an MCP tool
 */
export async function handleRecallTool(args: {
  domain: Domain | 'general';
}): Promise<string> {
  const facts = await recall(args.domain);

  if (facts.length === 0) {
    return `No facts stored in ${args.domain} memory.`;
  }

  return `## ${args.domain === 'general' ? 'General' : args.domain.toUpperCase()} Memory\n\n${facts.map(f => `- ${f}`).join('\n')}`;
}

/**
 * Tool handler: Log observation
 * Can be exposed as an MCP tool
 */
export async function handleLogObservationTool(args: {
  domain: Domain | 'general';
  observation: string;
}): Promise<string> {
  await logDailyMemory(args.domain, 'observation', args.observation);
  return `Observation logged to ${args.domain} daily log.`;
}

// =============================================================================
// INITIALIZATION
// =============================================================================

/**
 * Initialize memory system
 * Creates directories and loads recent memories
 */
export async function initMemorySystem(): Promise<void> {
  const domains: (Domain | 'general')[] = ['dlmm', 'perps', 'polymarket', 'spot', 'general'];

  for (const domain of domains) {
    await ensureMemoryDirs(domain);
  }

  console.log('[Memory] Memory system initialized');
}

/**
 * Get summary of all memories
 */
export async function getMemorySummary(): Promise<{
  domain: string;
  factCount: number;
  recentLogsCount: number;
}[]> {
  const domains: (Domain | 'general')[] = ['dlmm', 'perps', 'polymarket', 'spot', 'general'];
  const summary = [];

  for (const domain of domains) {
    const facts = await recall(domain);
    const logs = await readRecentDailyLogs(domain, 7);

    summary.push({
      domain,
      factCount: facts.length,
      recentLogsCount: logs.length,
    });
  }

  return summary;
}
