/**
 * Hook System Types
 *
 * Defines the event-driven hook architecture for Claudefi.
 * Hooks intercept agent actions for validation, logging, and control.
 */

import type { Domain, AgentDecision } from '../types/index.js';

/**
 * Hook events that can be intercepted
 */
export type HookEvent =
  | 'PreToolUse'      // Before any tool execution
  | 'PostToolUse'     // After tool execution
  | 'PreDecision'     // Before submit_decision is processed
  | 'PostDecision'    // After submit_decision is processed
  | 'SessionStart'    // Agent session starts
  | 'SessionEnd'      // Agent session completes
  | 'OnError';        // Any error during execution

/**
 * Context passed to hooks
 */
export interface HookContext {
  domain: Domain;
  toolName?: string;
  toolInput?: unknown;
  toolOutput?: unknown;
  decision?: AgentDecision;
  error?: Error;
  sessionId?: string;
  timestamp: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Result returned by hooks
 */
export interface HookResult {
  /** Whether to proceed with the action */
  proceed: boolean;
  /** Reason for blocking (if proceed is false) */
  reason?: string;
  /** Modified input to use instead (optional) */
  modifiedInput?: unknown;
  /** Additional metadata to attach */
  metadata?: Record<string, unknown>;
}

/**
 * Hook function signature
 */
export type Hook = (ctx: HookContext) => Promise<HookResult>;

/**
 * Hook registration entry
 */
export interface HookEntry {
  /** Unique name for this hook */
  name: string;
  /** Event to listen for */
  event: HookEvent;
  /** Priority (lower runs first) */
  priority: number;
  /** Optional domain filter (runs for all if not specified) */
  domains?: Domain[];
  /** Whether the hook is enabled */
  enabled: boolean;
  /** The hook function */
  hook: Hook;
}

/**
 * Hook execution summary (for logging)
 */
export interface HookExecutionSummary {
  hookName: string;
  event: HookEvent;
  domain: Domain;
  proceeded: boolean;
  reason?: string;
  durationMs: number;
  timestamp: Date;
}
