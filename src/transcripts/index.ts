/**
 * Transcript System
 *
 * JSONL-based transcript storage for conversation history.
 * Used for debugging, recovery, and audit trails.
 *
 * Structure:
 * .claude/transcripts/
 *   dlmm/
 *     2024-01-07-abc123.jsonl
 *     2024-01-06-def456.jsonl.gz  (compressed)
 *   perps/
 *     ...
 */

export * from './types.js';
export { TranscriptStore } from './store.js';

import { TranscriptStore } from './store.js';

// Singleton instance for use across the app
export const transcriptStore = new TranscriptStore();
