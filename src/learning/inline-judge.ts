/**
 * Inline Judge Evaluation (Phase 2)
 *
 * Same-cycle judge feedback that can block bad decisions BEFORE execution.
 * Uses a fast model (Haiku) for quick turnaround, with thorough mode for high-stakes.
 *
 * Key difference from judge-feedback.ts:
 * - judge-feedback.ts: Async evaluation AFTER decision (for learning)
 * - inline-judge.ts: Sync evaluation BEFORE execution (for prevention)
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Domain, AgentDecision, DomainContext } from '../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

export interface InlineJudgeResult {
  shouldProceed: boolean;         // Should we execute this trade?
  qualityScore: number;           // 0-1 quality rating
  warnings: string[];             // Issues to be aware of
  keyInsight: string | null;      // Most important observation
  suggestedModifications?: {
    adjustedConfidence?: number;
    adjustedAmount?: number;
    additionalReasoning?: string;
  };
  latencyMs: number;              // How long the evaluation took
}

export type JudgeMode = 'fast' | 'thorough';

// =============================================================================
// CONFIGURATION
// =============================================================================

/**
 * Model configuration by mode
 */
const MODEL_CONFIG = {
  fast: {
    model: 'claude-3-5-haiku-20241022',
    maxTokens: 500,
    targetLatencyMs: 2000,
  },
  thorough: {
    model: 'claude-opus-4-5-20251101',
    maxTokens: 1000,
    targetLatencyMs: 8000,
  },
};

/**
 * Thresholds for automatic blocking
 */
const BLOCK_THRESHOLDS = {
  minQualityScore: 0.4,           // Block if quality < 40%
  maxRiskLevel: 0.8,              // Block if risk > 80%
  minConfidenceAfterReview: 0.5,  // Block if adjusted confidence < 50%
};

// =============================================================================
// INLINE EVALUATION
// =============================================================================

/**
 * Evaluate a decision BEFORE execution
 *
 * Use 'fast' mode for most decisions (~1-2s latency)
 * Use 'thorough' mode for high-stakes decisions (>$500, >80% confidence)
 */
export async function evaluateInline(
  decision: AgentDecision,
  context: DomainContext,
  mode: JudgeMode = 'fast'
): Promise<InlineJudgeResult> {
  const startTime = Date.now();
  const config = MODEL_CONFIG[mode];
  const anthropic = new Anthropic();

  // Skip evaluation for hold decisions
  if (decision.action === 'hold') {
    return {
      shouldProceed: true,
      qualityScore: 1.0,
      warnings: [],
      keyInsight: null,
      latencyMs: 0,
    };
  }

  const prompt = buildInlinePrompt(decision, context, mode);

  try {
    const response = await anthropic.messages.create({
      model: config.model,
      max_tokens: config.maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';
    const result = parseInlineResponse(content, decision);

    result.latencyMs = Date.now() - startTime;

    return result;
  } catch (error) {
    console.warn(`[InlineJudge] Evaluation failed:`, error);

    // On error, allow execution but with warning
    return {
      shouldProceed: true,
      qualityScore: 0.5,
      warnings: ['Inline judge evaluation failed - proceeding with caution'],
      keyInsight: null,
      latencyMs: Date.now() - startTime,
    };
  }
}

/**
 * Build the inline evaluation prompt
 */
function buildInlinePrompt(
  decision: AgentDecision,
  context: DomainContext,
  mode: JudgeMode
): string {
  const modeInstructions = mode === 'fast'
    ? 'Be concise. Focus on critical issues only.'
    : 'Be thorough. Consider all aspects of the decision.';

  return `
You are a fast inline judge for Claudefi, an autonomous DeFi trading agent.
Your job is to quickly review this decision BEFORE it executes and flag any issues.

${modeInstructions}

## Decision to Review

- **Domain**: ${context.domain}
- **Action**: ${decision.action}
- **Target**: ${decision.target || 'N/A'}
- **Amount**: $${decision.amountUsd || 0}
- **Confidence**: ${((decision.confidence || 0) * 100).toFixed(0)}%
- **Reasoning**: ${decision.reasoning}

## Current Context

- **Balance**: $${context.balance.toFixed(2)}
- **Open Positions**: ${context.positions.length}
- **Recent Decisions**: ${context.recentDecisions.length}

## Recent Decision Outcomes
${context.recentDecisions.slice(0, 3).map(d =>
  `- ${d.action} ${d.target || ''}: ${d.outcome || 'pending'} (conf: ${d.confidence})`
).join('\n')}

## Your Task

Quickly evaluate if this trade should proceed. Focus on:
1. Is the reasoning sound?
2. Are there obvious red flags?
3. Is the position size appropriate for the balance?
4. Does the confidence match the reasoning quality?

Respond with JSON only:
{
  "shouldProceed": boolean,
  "qualityScore": number (0.0-1.0),
  "warnings": ["string array of concerns"],
  "keyInsight": "string or null - most important observation",
  "suggestedModifications": {
    "adjustedConfidence": number (optional),
    "adjustedAmount": number (optional),
    "additionalReasoning": "string (optional)"
  }
}

Set shouldProceed=false ONLY for serious issues like:
- Reasoning is flawed or circular
- Position size too large relative to balance (>20%)
- Critical market factor ignored
- Recent similar decisions failed repeatedly

Respond ONLY with JSON.
`;
}

/**
 * Parse the judge response
 */
function parseInlineResponse(
  content: string,
  decision: AgentDecision
): InlineJudgeResult {
  try {
    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Validate and apply thresholds
    let shouldProceed = parsed.shouldProceed !== false;
    const qualityScore = Math.max(0, Math.min(1, parsed.qualityScore || 0.5));

    // Block if quality score too low
    if (qualityScore < BLOCK_THRESHOLDS.minQualityScore) {
      shouldProceed = false;
    }

    // Block if suggested confidence is too low
    if (parsed.suggestedModifications?.adjustedConfidence !== undefined) {
      if (parsed.suggestedModifications.adjustedConfidence < BLOCK_THRESHOLDS.minConfidenceAfterReview) {
        shouldProceed = false;
      }
    }

    return {
      shouldProceed,
      qualityScore,
      warnings: Array.isArray(parsed.warnings) ? parsed.warnings : [],
      keyInsight: parsed.keyInsight || null,
      suggestedModifications: parsed.suggestedModifications,
      latencyMs: 0, // Will be set by caller
    };
  } catch (error) {
    console.warn('[InlineJudge] Failed to parse response:', error);

    // Default to allowing with warning
    return {
      shouldProceed: true,
      qualityScore: 0.5,
      warnings: ['Failed to parse judge response'],
      keyInsight: null,
      latencyMs: 0,
    };
  }
}

// =============================================================================
// MODE SELECTION
// =============================================================================

/**
 * Determine which mode to use based on decision characteristics
 */
export function selectJudgeMode(decision: AgentDecision): JudgeMode {
  // Use thorough mode for high-stakes decisions
  const amountUsd = decision.amountUsd || 0;
  const confidence = decision.confidence || 0;

  // High amount or high confidence = use thorough mode
  if (amountUsd > 500 || confidence > 0.8) {
    return 'thorough';
  }

  return 'fast';
}

/**
 * Evaluate with auto-selected mode
 */
export async function evaluateWithAutoMode(
  decision: AgentDecision,
  context: DomainContext
): Promise<InlineJudgeResult> {
  const mode = selectJudgeMode(decision);
  return evaluateInline(decision, context, mode);
}

// =============================================================================
// INTEGRATION HELPERS
// =============================================================================

/**
 * Format inline judge result for logging
 */
export function formatInlineResult(result: InlineJudgeResult): string {
  const emoji = result.shouldProceed ? '✅' : '🚫';
  const quality = `${(result.qualityScore * 100).toFixed(0)}%`;

  let output = `${emoji} InlineJudge: ${result.shouldProceed ? 'PROCEED' : 'BLOCKED'} (${quality} quality, ${result.latencyMs}ms)`;

  if (result.warnings.length > 0) {
    output += `\n   ⚠️ Warnings: ${result.warnings.join('; ')}`;
  }

  if (result.keyInsight) {
    output += `\n   💡 Insight: ${result.keyInsight}`;
  }

  return output;
}

/**
 * Check if decision was modified by judge
 */
export function wasModified(result: InlineJudgeResult): boolean {
  return !!(
    result.suggestedModifications?.adjustedConfidence !== undefined ||
    result.suggestedModifications?.adjustedAmount !== undefined
  );
}

/**
 * Apply judge modifications to decision (if any)
 */
export function applyModifications(
  decision: AgentDecision,
  result: InlineJudgeResult
): AgentDecision {
  if (!result.suggestedModifications) {
    return decision;
  }

  return {
    ...decision,
    confidence: result.suggestedModifications.adjustedConfidence ?? decision.confidence,
    amountUsd: result.suggestedModifications.adjustedAmount ?? decision.amountUsd,
    reasoning: result.suggestedModifications.additionalReasoning
      ? `${decision.reasoning}\n\n[InlineJudge]: ${result.suggestedModifications.additionalReasoning}`
      : decision.reasoning,
  };
}
