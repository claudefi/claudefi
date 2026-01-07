/**
 * Transcript Types
 *
 * Types for the JSONL transcript storage system.
 * Used to persist conversation history for debugging and recovery.
 */

import type { Domain } from '../types/index.js';

/**
 * A single entry in a transcript session
 */
export interface TranscriptEntry {
  timestamp: string;
  role: 'user' | 'assistant' | 'tool_use' | 'tool_result';
  content: string | object;
  metadata?: {
    domain?: Domain;
    model?: string;
    toolName?: string;
    toolInput?: unknown;
    tokensUsed?: number;
    turnNumber?: number;
  };
}

/**
 * Metadata for a transcript session
 */
export interface TranscriptSession {
  sessionId: string;
  domain: Domain;
  startedAt: string;
  endedAt?: string;
}
