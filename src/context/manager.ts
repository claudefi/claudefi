/**
 * Context Pruning Manager
 *
 * Manages context window size by intelligently pruning older messages
 * to prevent token limit exhaustion during long-running agent sessions.
 *
 * Pruning Strategy:
 * 1. Keep the most recent N user/assistant message pairs intact
 * 2. For older tool_result blocks, summarize to first 200 chars + truncation notice
 * 3. If still over threshold, drop oldest messages entirely
 */

import type Anthropic from '@anthropic-ai/sdk';
import {
  estimateConversationTokens,
  estimateMessageTokens,
  getContextRatio,
} from './tokenizer.js';

/**
 * Configuration for context pruning behavior
 */
export interface PruningConfig {
  /** Maximum tokens for the context window. Default: 180000 */
  maxTokens: number;

  /** Ratio (0-1) at which to start summarizing tool results. Default: 0.7 */
  softThreshold: number;

  /** Ratio (0-1) at which to start dropping old messages. Default: 0.9 */
  hardThreshold: number;

  /** Number of recent message pairs to always preserve. Default: 3 */
  preserveRecentTurns: number;

  /** Whether to preserve the system prompt (if first message). Default: true */
  preserveSystemPrompt: boolean;
}

/**
 * Result of a pruning operation
 */
export interface PruneResult {
  /** The pruned message array */
  pruned: Anthropic.MessageParam[];

  /** Number of messages dropped entirely */
  droppedCount: number;

  /** Estimated tokens before pruning */
  estimatedTokensBefore: number;

  /** Estimated tokens after pruning */
  estimatedTokensAfter: number;

  /** Whether any pruning was performed */
  wasPruned: boolean;

  /** Summary of actions taken */
  actions: string[];
}

/**
 * Default configuration values
 */
const DEFAULT_CONFIG: PruningConfig = {
  maxTokens: 180000,
  softThreshold: 0.7,
  hardThreshold: 0.9,
  preserveRecentTurns: 3,
  preserveSystemPrompt: true,
};

/**
 * Maximum characters for summarized tool results
 */
const TOOL_RESULT_SUMMARY_LENGTH = 200;

/**
 * Truncation indicator appended to summarized content
 */
const TRUNCATION_MARKER = '... [truncated]';

/**
 * Context Manager for intelligent message pruning
 *
 * @example
 * ```typescript
 * const manager = new ContextManager({ maxTokens: 150000 });
 *
 * // Check if pruning is needed
 * if (manager.shouldPrune(messages)) {
 *   const result = manager.prune(messages);
 *   console.log(`Pruned ${result.droppedCount} messages`);
 *   messages = result.pruned;
 * }
 * ```
 */
export class ContextManager {
  private config: PruningConfig;

  /**
   * Create a new ContextManager
   *
   * @param config - Partial configuration to override defaults
   */
  constructor(config?: Partial<PruningConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Check if the message array should be pruned
   *
   * Returns true if the context ratio exceeds the soft threshold.
   *
   * @param messages - The conversation messages
   * @returns Whether pruning should be performed
   */
  shouldPrune(messages: Anthropic.MessageParam[]): boolean {
    const ratio = getContextRatio(messages, this.config.maxTokens);
    return ratio >= this.config.softThreshold;
  }

  /**
   * Get the current context usage ratio
   *
   * @param messages - The conversation messages
   * @returns Context usage ratio (0-1)
   */
  getContextRatio(messages: Anthropic.MessageParam[]): number {
    return getContextRatio(messages, this.config.maxTokens);
  }

  /**
   * Prune messages to fit within context limits
   *
   * Applies pruning in stages:
   * 1. Summarize tool results in older messages
   * 2. Drop oldest messages if still over hard threshold
   *
   * @param messages - The conversation messages to prune
   * @returns Pruning result with the pruned messages and statistics
   */
  prune(messages: Anthropic.MessageParam[]): PruneResult {
    const estimatedTokensBefore = estimateConversationTokens(messages);
    const actions: string[] = [];
    let droppedCount = 0;

    // If we're below soft threshold, no pruning needed
    const initialRatio = getContextRatio(messages, this.config.maxTokens);
    if (initialRatio < this.config.softThreshold) {
      return {
        pruned: messages,
        droppedCount: 0,
        estimatedTokensBefore,
        estimatedTokensAfter: estimatedTokensBefore,
        wasPruned: false,
        actions: ['No pruning needed'],
      };
    }

    // Calculate how many messages to preserve at the end
    // Each "turn" is a user + assistant pair, so preserve 2x turns
    const preserveCount = this.config.preserveRecentTurns * 2;

    // Split messages into preserved (recent) and prunable (older)
    const splitIndex = Math.max(0, messages.length - preserveCount);
    const prunableMessages = messages.slice(0, splitIndex);
    const preservedMessages = messages.slice(splitIndex);

    // Stage 1: Summarize tool results in prunable messages
    let prunedMessages = prunableMessages.map((msg) =>
      this.summarizeMessageToolResults(msg)
    );
    actions.push(`Summarized tool results in ${prunableMessages.length} older messages`);

    // Combine and check ratio
    let combined = [...prunedMessages, ...preservedMessages];
    let currentRatio = getContextRatio(combined, this.config.maxTokens);

    // Stage 2: If still over hard threshold, drop oldest messages
    if (currentRatio >= this.config.hardThreshold) {
      const targetTokens = this.config.maxTokens * this.config.softThreshold;
      let currentTokens = estimateConversationTokens(combined);

      // Drop messages from the start until under target
      while (prunedMessages.length > 0 && currentTokens > targetTokens) {
        const dropped = prunedMessages.shift();
        if (dropped) {
          droppedCount++;
          currentTokens -= estimateMessageTokens(dropped);
        }
      }

      combined = [...prunedMessages, ...preservedMessages];
      actions.push(`Dropped ${droppedCount} oldest messages to meet hard threshold`);
    }

    const estimatedTokensAfter = estimateConversationTokens(combined);

    return {
      pruned: combined,
      droppedCount,
      estimatedTokensBefore,
      estimatedTokensAfter,
      wasPruned: true,
      actions,
    };
  }

  /**
   * Summarize tool results within a message
   *
   * Replaces long tool_result content with truncated summaries.
   *
   * @param message - The message to process
   * @returns Message with summarized tool results
   */
  private summarizeMessageToolResults(
    message: Anthropic.MessageParam
  ): Anthropic.MessageParam {
    // String content doesn't have tool results
    if (typeof message.content === 'string') {
      return message;
    }

    // Process content blocks
    const newContent = message.content.map((block) => {
      if (block.type === 'tool_result') {
        return this.summarizeToolResult(block as Anthropic.ToolResultBlockParam);
      }
      return block;
    });

    return {
      ...message,
      content: newContent,
    };
  }

  /**
   * Summarize a tool_result block to reduce token usage
   *
   * Truncates the content to TOOL_RESULT_SUMMARY_LENGTH characters
   * and appends a truncation marker.
   *
   * @param block - The tool result block to summarize
   * @returns Summarized tool result block
   */
  private summarizeToolResult(
    block: Anthropic.ToolResultBlockParam
  ): Anthropic.ToolResultBlockParam {
    // Handle string content
    if (typeof block.content === 'string') {
      if (block.content.length <= TOOL_RESULT_SUMMARY_LENGTH) {
        return block;
      }

      return {
        ...block,
        content:
          block.content.slice(0, TOOL_RESULT_SUMMARY_LENGTH) + TRUNCATION_MARKER,
      };
    }

    // Handle array content (text and image blocks)
    if (Array.isArray(block.content)) {
      const summarizedContent = block.content.map((item) => {
        if (item.type === 'text') {
          if (item.text.length <= TOOL_RESULT_SUMMARY_LENGTH) {
            return item;
          }
          return {
            ...item,
            text: item.text.slice(0, TOOL_RESULT_SUMMARY_LENGTH) + TRUNCATION_MARKER,
          };
        }
        // Keep image blocks as-is (they can't be easily summarized)
        return item;
      });

      return {
        ...block,
        content: summarizedContent,
      };
    }

    // Return as-is if content format is unexpected
    return block;
  }

  /**
   * Get statistics about the current context
   *
   * @param messages - The conversation messages
   * @returns Context statistics
   */
  getStats(messages: Anthropic.MessageParam[]): {
    messageCount: number;
    estimatedTokens: number;
    contextRatio: number;
    isOverSoftThreshold: boolean;
    isOverHardThreshold: boolean;
    toolResultCount: number;
  } {
    const estimatedTokens = estimateConversationTokens(messages);
    const contextRatio = getContextRatio(messages, this.config.maxTokens);

    // Count tool results
    let toolResultCount = 0;
    for (const msg of messages) {
      if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.type === 'tool_result') {
            toolResultCount++;
          }
        }
      }
    }

    return {
      messageCount: messages.length,
      estimatedTokens,
      contextRatio,
      isOverSoftThreshold: contextRatio >= this.config.softThreshold,
      isOverHardThreshold: contextRatio >= this.config.hardThreshold,
      toolResultCount,
    };
  }

  /**
   * Get the current configuration
   *
   * @returns Current pruning configuration
   */
  getConfig(): Readonly<PruningConfig> {
    return { ...this.config };
  }

  /**
   * Update configuration
   *
   * @param config - Partial configuration to update
   */
  updateConfig(config: Partial<PruningConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/**
 * Create a context manager with default settings
 *
 * @returns New ContextManager instance
 */
export function createContextManager(
  config?: Partial<PruningConfig>
): ContextManager {
  return new ContextManager(config);
}
