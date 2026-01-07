/**
 * Context Management Module
 *
 * Provides utilities for managing Claude API context windows:
 * - Token estimation for messages and conversations
 * - Context pruning to prevent token limit exhaustion
 * - Statistics and monitoring for context usage
 *
 * @example
 * ```typescript
 * import {
 *   ContextManager,
 *   estimateConversationTokens,
 *   getContextRatio
 * } from './context/index.js';
 *
 * // Create a context manager
 * const manager = new ContextManager({ maxTokens: 150000 });
 *
 * // Check if pruning is needed and prune if necessary
 * if (manager.shouldPrune(messages)) {
 *   const result = manager.prune(messages);
 *   messages = result.pruned;
 *   console.log(`Pruned ${result.droppedCount} messages`);
 * }
 *
 * // Get token estimates
 * const tokens = estimateConversationTokens(messages);
 * const ratio = getContextRatio(messages, 180000);
 * ```
 */

// Token estimation utilities
export {
  estimateTokens,
  estimateContentBlockTokens,
  estimateMessageTokens,
  estimateConversationTokens,
  getContextRatio,
  getTokenBreakdown,
} from './tokenizer.js';

// Context pruning manager
export {
  ContextManager,
  createContextManager,
  type PruningConfig,
  type PruneResult,
} from './manager.js';
