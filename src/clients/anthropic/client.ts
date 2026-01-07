/**
 * Anthropic Claude Client
 * Makes real Claude API calls for trading decisions
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Domain, AgentDecision } from '../../types/index.js';

let anthropicInstance: Anthropic | null = null;

/**
 * Get or create Anthropic client instance
 */
export function getAnthropic(): Anthropic {
  if (!anthropicInstance) {
    const apiKey = process.env.ANTHROPIC_API_KEY;

    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is required for real Claude calls');
    }

    anthropicInstance = new Anthropic({ apiKey });
  }
  return anthropicInstance;
}

/**
 * Parse Claude's response to extract the decision JSON
 */
function parseDecisionFromResponse(content: string, domain: Domain): AgentDecision {
  // Try to extract JSON from the response
  const jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/) ||
                    content.match(/\{[\s\S]*"action"[\s\S]*\}/);

  if (jsonMatch) {
    try {
      const jsonStr = jsonMatch[1] || jsonMatch[0];
      const parsed = JSON.parse(jsonStr);
      return {
        domain,
        action: parsed.action || 'hold',
        target: parsed.target,
        amountUsd: parsed.amountUsd || parsed.amount_usd,
        reasoning: parsed.reasoning || 'No reasoning provided',
        confidence: parsed.confidence || 0.5,
      };
    } catch (e) {
      console.error('Failed to parse decision JSON:', e);
    }
  }

  // Fallback: try to infer from text
  return {
    domain,
    action: 'hold',
    reasoning: content.slice(0, 500),
    confidence: 0.3,
  };
}

/**
 * Get trading decision from Claude
 */
export async function getClaudeDecision(
  systemPrompt: string,
  userPrompt: string,
  domain: Domain
): Promise<AgentDecision> {
  const anthropic = getAnthropic();

  console.log('   Calling Claude Opus 4.5...');

  const message = await anthropic.messages.create({
    model: 'claude-opus-4-5-20251101', // Always use Opus 4.5 for best quality
    max_tokens: 1024,
    system: systemPrompt,
    messages: [
      {
        role: 'user',
        content: userPrompt,
      },
    ],
  });

  // Extract text content
  const textContent = message.content.find(block => block.type === 'text');
  const responseText = textContent?.type === 'text' ? textContent.text : '';

  console.log('   Claude response received');

  return parseDecisionFromResponse(responseText, domain);
}

/**
 * Check if Claude API is available
 */
export function isClaudeAvailable(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}
