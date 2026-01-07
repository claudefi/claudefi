/**
 * Token Estimation Utilities
 *
 * Provides rough token estimation for Claude API messages.
 * Uses character-based heuristics since exact tokenization
 * requires the actual tokenizer.
 */

import type Anthropic from '@anthropic-ai/sdk';

/**
 * Rough estimation: ~4 characters per token for English text.
 * This is a conservative estimate - actual tokenization varies
 * based on vocabulary, whitespace, and special characters.
 */
const CHARS_PER_TOKEN = 4;

/**
 * Overhead tokens for message structure (role, formatting, etc.)
 */
const MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * Overhead tokens for tool use blocks
 */
const TOOL_USE_OVERHEAD_TOKENS = 20;

/**
 * Overhead tokens for tool result blocks
 */
const TOOL_RESULT_OVERHEAD_TOKENS = 10;

/**
 * Estimate token count for a string
 *
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 *
 * @example
 * ```typescript
 * const tokens = estimateTokens("Hello, world!");
 * // Returns approximately 4 tokens
 * ```
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimate tokens for a message content block
 *
 * Handles different block types:
 * - text: Direct character estimation
 * - tool_use: Includes name, input JSON, and overhead
 * - tool_result: Includes content and overhead
 * - image: Fixed estimate for image blocks
 *
 * @param block - The content block to estimate
 * @returns Estimated token count
 */
export function estimateContentBlockTokens(
  block: Anthropic.ContentBlock | Anthropic.ContentBlockParam
): number {
  if (!block || typeof block !== 'object') return 0;

  switch (block.type) {
    case 'text': {
      const textBlock = block as { type: 'text'; text: string };
      return estimateTokens(textBlock.text);
    }

    case 'tool_use': {
      const toolBlock = block as Anthropic.ToolUseBlock;
      const nameTokens = estimateTokens(toolBlock.name);
      const inputTokens = estimateTokens(
        typeof toolBlock.input === 'string'
          ? toolBlock.input
          : JSON.stringify(toolBlock.input)
      );
      return nameTokens + inputTokens + TOOL_USE_OVERHEAD_TOKENS;
    }

    case 'tool_result': {
      const resultBlock = block as Anthropic.ToolResultBlockParam;
      let contentTokens = 0;

      if (typeof resultBlock.content === 'string') {
        contentTokens = estimateTokens(resultBlock.content);
      } else if (Array.isArray(resultBlock.content)) {
        contentTokens = resultBlock.content.reduce((sum, item) => {
          if (item.type === 'text') {
            return sum + estimateTokens(item.text);
          }
          // Image blocks in tool results
          if (item.type === 'image') {
            return sum + 1000; // Rough estimate for images
          }
          return sum;
        }, 0);
      }

      return contentTokens + TOOL_RESULT_OVERHEAD_TOKENS;
    }

    case 'image': {
      // Images are typically ~1000 tokens depending on size
      return 1000;
    }

    default:
      // Unknown block type - try to stringify and estimate
      try {
        return estimateTokens(JSON.stringify(block));
      } catch {
        return 0;
      }
  }
}

/**
 * Estimate tokens for a full message
 *
 * Accounts for:
 * - Message role overhead
 * - All content blocks
 * - String content shorthand
 *
 * @param message - The message to estimate
 * @returns Estimated token count
 *
 * @example
 * ```typescript
 * const tokens = estimateMessageTokens({
 *   role: 'user',
 *   content: 'What is the weather like?'
 * });
 * ```
 */
export function estimateMessageTokens(message: Anthropic.MessageParam): number {
  if (!message) return 0;

  let contentTokens = 0;

  if (typeof message.content === 'string') {
    // Simple string content
    contentTokens = estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    // Array of content blocks
    contentTokens = message.content.reduce((sum, block) => {
      return sum + estimateContentBlockTokens(block);
    }, 0);
  }

  return contentTokens + MESSAGE_OVERHEAD_TOKENS;
}

/**
 * Estimate tokens for a conversation (array of messages)
 *
 * @param messages - The conversation messages
 * @returns Total estimated token count
 *
 * @example
 * ```typescript
 * const tokens = estimateConversationTokens([
 *   { role: 'user', content: 'Hello' },
 *   { role: 'assistant', content: 'Hi there!' }
 * ]);
 * ```
 */
export function estimateConversationTokens(
  messages: Anthropic.MessageParam[]
): number {
  if (!messages || !Array.isArray(messages)) return 0;

  return messages.reduce((sum, message) => {
    return sum + estimateMessageTokens(message);
  }, 0);
}

/**
 * Get context usage ratio (0-1)
 *
 * Calculates what fraction of the context window is being used.
 * Useful for determining when pruning is needed.
 *
 * @param messages - The conversation messages
 * @param maxTokens - Maximum context window size
 * @returns Ratio of used tokens to max tokens (0-1)
 *
 * @example
 * ```typescript
 * const ratio = getContextRatio(messages, 180000);
 * if (ratio > 0.7) {
 *   console.log('Context is getting full, consider pruning');
 * }
 * ```
 */
export function getContextRatio(
  messages: Anthropic.MessageParam[],
  maxTokens: number
): number {
  if (maxTokens <= 0) return 0;

  const usedTokens = estimateConversationTokens(messages);
  return Math.min(usedTokens / maxTokens, 1);
}

/**
 * Get detailed token breakdown for debugging
 *
 * @param messages - The conversation messages
 * @returns Object with per-message token counts
 */
export function getTokenBreakdown(
  messages: Anthropic.MessageParam[]
): { total: number; byMessage: Array<{ index: number; role: string; tokens: number }> } {
  const byMessage = messages.map((msg, index) => ({
    index,
    role: msg.role,
    tokens: estimateMessageTokens(msg),
  }));

  return {
    total: byMessage.reduce((sum, m) => sum + m.tokens, 0),
    byMessage,
  };
}
