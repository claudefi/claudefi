/**
 * Judge Feedback System
 *
 * Enables the feedback loop between decision judge evaluations and future decisions.
 * This is the critical missing piece that makes the learning system actually work.
 *
 * The Flow:
 *   Decision → Execute → Judge Evaluates → DB → THIS MODULE → Prompt Builder → Better Decision
 *
 * Without this module, judge insights were stored but never used.
 */

import Anthropic from '@anthropic-ai/sdk';
import { prisma } from '../db/prisma.js';
import type { Domain } from '../types/index.js';

// Types
export interface JudgeInsight {
  id: string;
  domain: string;
  action: string;
  target: string | null;
  wasGoodDecision: boolean;
  qualityScore: number | null;
  keyInsight: string;
  insightType: string;
  strengths: string | null;
  weaknesses: string | null;
  missedFactors: string | null;
  betterApproach: string | null;
  actualOutcome: string | null;
  actualPnlPercent: number | null;
  judgeWasRight: boolean | null;
  createdAt: Date;
}

export interface SynthesizedFeedback {
  domain: Domain;
  recentInsightsCount: number;
  keyThemes: string[];
  warningsToHeed: string[];
  patternsToFollow: string[];
  calibrationNotes: string;
  fullText: string;
}

/**
 * Save a judge evaluation to the database
 */
export async function saveJudgeEvaluation(evaluation: {
  decisionId: string;
  domain: Domain;
  action: string;
  target?: string;
  wasGoodDecision: boolean;
  qualityScore?: number;
  strengths?: string;
  weaknesses?: string;
  missedFactors?: string;
  betterApproach?: string;
  keyInsight: string;
  insightType: 'timing' | 'sizing' | 'selection' | 'risk' | 'market_read' | 'execution';
  applicability?: 'domain' | 'cross_domain' | 'general';
}): Promise<string> {
  const record = await prisma.decisionEvaluation.create({
    data: {
      decisionId: evaluation.decisionId,
      domain: evaluation.domain,
      action: evaluation.action,
      target: evaluation.target,
      wasGoodDecision: evaluation.wasGoodDecision,
      qualityScore: evaluation.qualityScore,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
      missedFactors: evaluation.missedFactors,
      betterApproach: evaluation.betterApproach,
      keyInsight: evaluation.keyInsight,
      insightType: evaluation.insightType,
      applicability: evaluation.applicability || 'domain',
    },
  });

  return record.id;
}

/**
 * Update evaluation with actual outcome (when trade closes)
 */
export async function updateEvaluationOutcome(
  decisionId: string,
  outcome: 'profit' | 'loss',
  pnlPercent: number
): Promise<void> {
  const evaluation = await prisma.decisionEvaluation.findFirst({
    where: { decisionId },
  });

  if (!evaluation) {
    return;
  }

  // Determine if judge was right
  // Judge said good decision + profit = right
  // Judge said bad decision + loss = right
  const judgeWasRight =
    (evaluation.wasGoodDecision && outcome === 'profit') ||
    (!evaluation.wasGoodDecision && outcome === 'loss');

  await prisma.decisionEvaluation.update({
    where: { id: evaluation.id },
    data: {
      actualOutcome: outcome,
      actualPnlPercent: pnlPercent,
      judgeWasRight,
    },
  });
}

/**
 * Get recent judge insights for a domain
 */
export async function getRecentJudgeInsights(
  domain: Domain,
  limit = 10
): Promise<JudgeInsight[]> {
  const evaluations = await prisma.decisionEvaluation.findMany({
    where: {
      OR: [
        { domain },
        { applicability: 'cross_domain' },
        { applicability: 'general' },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return evaluations;
}

/**
 * Get insights by type (for targeted learning)
 */
export async function getInsightsByType(
  domain: Domain,
  insightType: string,
  limit = 5
): Promise<JudgeInsight[]> {
  const evaluations = await prisma.decisionEvaluation.findMany({
    where: {
      domain,
      insightType,
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return evaluations;
}

/**
 * Get validated insights (where we know if judge was right)
 */
export async function getValidatedInsights(
  domain: Domain,
  onlyCorrect = true
): Promise<JudgeInsight[]> {
  const evaluations = await prisma.decisionEvaluation.findMany({
    where: {
      domain,
      judgeWasRight: onlyCorrect ? true : undefined,
      actualOutcome: { not: null },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });

  return evaluations;
}

/**
 * Synthesize recent insights into actionable feedback for prompts
 * This is the key function that closes the feedback loop
 */
export async function synthesizeInsights(
  domain: Domain,
  limit = 10
): Promise<SynthesizedFeedback> {
  const insights = await getRecentJudgeInsights(domain, limit);

  if (insights.length === 0) {
    return {
      domain,
      recentInsightsCount: 0,
      keyThemes: [],
      warningsToHeed: [],
      patternsToFollow: [],
      calibrationNotes: 'No recent evaluations. Make decisions based on current analysis.',
      fullText: '*No recent judge feedback available.*',
    };
  }

  // Extract key themes from insights
  const keyThemes: string[] = [];
  const warningsToHeed: string[] = [];
  const patternsToFollow: string[] = [];

  for (const insight of insights) {
    // Add key insight to themes
    if (insight.keyInsight) {
      keyThemes.push(insight.keyInsight);
    }

    // Warnings from bad decisions
    if (!insight.wasGoodDecision && insight.weaknesses) {
      warningsToHeed.push(`${insight.action} ${insight.target || ''}: ${insight.weaknesses}`);
    }

    // Patterns from good decisions
    if (insight.wasGoodDecision && insight.strengths) {
      patternsToFollow.push(`${insight.action} ${insight.target || ''}: ${insight.strengths}`);
    }
  }

  // Calculate judge accuracy for calibration
  const validatedInsights = insights.filter(i => i.judgeWasRight !== null);
  const correctInsights = validatedInsights.filter(i => i.judgeWasRight === true);
  const judgeAccuracy = validatedInsights.length > 0
    ? (correctInsights.length / validatedInsights.length * 100).toFixed(0)
    : 'N/A';

  const avgQuality = insights
    .filter(i => i.qualityScore !== null)
    .reduce((sum, i) => sum + (i.qualityScore || 0), 0) / (insights.filter(i => i.qualityScore !== null).length || 1);

  const calibrationNotes = `
Recent decision quality: ${(avgQuality * 100).toFixed(0)}% average
Judge accuracy: ${judgeAccuracy}% (${correctInsights.length}/${validatedInsights.length} predictions correct)
Insight types: ${[...new Set(insights.map(i => i.insightType))].join(', ')}
  `.trim();

  // Build full text for prompt injection
  const fullText = buildFeedbackText(domain, insights, keyThemes, warningsToHeed, patternsToFollow, calibrationNotes);

  return {
    domain,
    recentInsightsCount: insights.length,
    keyThemes: [...new Set(keyThemes)].slice(0, 5), // Dedupe and limit
    warningsToHeed: warningsToHeed.slice(0, 3),
    patternsToFollow: patternsToFollow.slice(0, 3),
    calibrationNotes,
    fullText,
  };
}

/**
 * Build the feedback text that gets injected into prompts
 */
function buildFeedbackText(
  domain: Domain,
  insights: JudgeInsight[],
  keyThemes: string[],
  warningsToHeed: string[],
  patternsToFollow: string[],
  calibrationNotes: string
): string {
  let text = `## Recent Judge Feedback (${domain.toUpperCase()})\n\n`;

  text += `*Based on ${insights.length} recent decision evaluations*\n\n`;

  // Key themes (most important learnings)
  if (keyThemes.length > 0) {
    text += '### Key Insights from Recent Decisions\n\n';
    for (const theme of keyThemes.slice(0, 5)) {
      text += `- ${theme}\n`;
    }
    text += '\n';
  }

  // Warnings to heed
  if (warningsToHeed.length > 0) {
    text += '### Warnings to Heed\n\n';
    text += '*These patterns led to poor decisions recently:*\n\n';
    for (const warning of warningsToHeed.slice(0, 3)) {
      text += `- ${warning}\n`;
    }
    text += '\n';
  }

  // Patterns to follow
  if (patternsToFollow.length > 0) {
    text += '### Patterns That Worked\n\n';
    text += '*These approaches were validated as good decisions:*\n\n';
    for (const pattern of patternsToFollow.slice(0, 3)) {
      text += `- ${pattern}\n`;
    }
    text += '\n';
  }

  // Most recent specific insights (limited)
  const recentSpecific = insights.slice(0, 3);
  if (recentSpecific.length > 0) {
    text += '### Most Recent Evaluations\n\n';
    for (const insight of recentSpecific) {
      const emoji = insight.wasGoodDecision ? '✓' : '✗';
      const quality = insight.qualityScore !== null
        ? ` (${(insight.qualityScore * 100).toFixed(0)}% quality)`
        : '';
      text += `${emoji} **${insight.action} ${insight.target || ''}**${quality}\n`;
      text += `   Insight: ${insight.keyInsight}\n`;
      if (insight.betterApproach) {
        text += `   Better: ${insight.betterApproach}\n`;
      }
      text += '\n';
    }
  }

  // Calibration notes
  text += `### Decision Calibration\n\n${calibrationNotes}\n`;

  return text;
}

/**
 * Generate a judge evaluation for a decision using Claude
 * This can be called after each decision or in batches
 */
export async function evaluateDecision(
  decisionId: string,
  domain: Domain,
  action: string,
  target: string | undefined,
  reasoning: string,
  confidence: number,
  marketConditions: Record<string, unknown>
): Promise<string | null> {
  const anthropic = new Anthropic();

  const prompt = `
You are the decision judge for Claudefi, an autonomous DeFi trading agent.
Your role is to evaluate trading decisions and provide insights that will improve future decisions.

## Decision to Evaluate

- **Domain**: ${domain}
- **Action**: ${action}
- **Target**: ${target || 'N/A'}
- **Reasoning**: ${reasoning}
- **Confidence**: ${(confidence * 100).toFixed(0)}%

## Market Conditions at Decision Time
${JSON.stringify(marketConditions, null, 2)}

## Your Task

Evaluate this decision and provide structured feedback.

Respond with a JSON object containing:
{
  "wasGoodDecision": boolean,  // Overall assessment
  "qualityScore": number,       // 0.0 to 1.0
  "strengths": "string | null", // What was done well
  "weaknesses": "string | null", // What could be improved
  "missedFactors": "string | null", // Market factors overlooked
  "betterApproach": "string | null", // What would have been better
  "keyInsight": "string",       // REQUIRED: Single most important learning
  "insightType": "timing" | "sizing" | "selection" | "risk" | "market_read" | "execution",
  "applicability": "domain" | "cross_domain" | "general"
}

Focus on actionable insights that will improve future decisions.
Keep keyInsight under 100 characters - it should be memorable and specific.

Respond ONLY with the JSON object, no other text.
`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101', // Always use Opus 4.5 for best quality
      max_tokens: 1000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';

    // Parse JSON response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('Judge response not valid JSON:', content);
      return null;
    }

    const evaluation = JSON.parse(jsonMatch[0]);

    // Validate required fields
    if (!evaluation.keyInsight || typeof evaluation.wasGoodDecision !== 'boolean') {
      console.error('Judge response missing required fields');
      return null;
    }

    // Save to database
    const evalId = await saveJudgeEvaluation({
      decisionId,
      domain,
      action,
      target,
      wasGoodDecision: evaluation.wasGoodDecision,
      qualityScore: evaluation.qualityScore,
      strengths: evaluation.strengths,
      weaknesses: evaluation.weaknesses,
      missedFactors: evaluation.missedFactors,
      betterApproach: evaluation.betterApproach,
      keyInsight: evaluation.keyInsight,
      insightType: evaluation.insightType || 'execution',
      applicability: evaluation.applicability || 'domain',
    });

    console.log(`📋 Judge evaluated decision ${decisionId}: ${evaluation.wasGoodDecision ? '✓ Good' : '✗ Poor'} (${evaluation.keyInsight})`);

    return evalId;
  } catch (error) {
    console.error('Failed to evaluate decision:', error);
    return null;
  }
}

/**
 * Get cross-domain insights that apply broadly
 */
export async function getCrossDomainInsights(limit = 5): Promise<JudgeInsight[]> {
  const evaluations = await prisma.decisionEvaluation.findMany({
    where: {
      applicability: { in: ['cross_domain', 'general'] },
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  return evaluations;
}

/**
 * Get insights that were validated as correct
 * These are the highest-confidence learnings
 */
export async function getProvenInsights(domain?: Domain): Promise<JudgeInsight[]> {
  const evaluations = await prisma.decisionEvaluation.findMany({
    where: {
      domain: domain || undefined,
      judgeWasRight: true,
      actualOutcome: { not: null },
    },
    orderBy: [
      { qualityScore: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 10,
  });

  return evaluations;
}

/**
 * Export all functions for use in other modules
 */
export default {
  saveJudgeEvaluation,
  updateEvaluationOutcome,
  getRecentJudgeInsights,
  getInsightsByType,
  getValidatedInsights,
  synthesizeInsights,
  evaluateDecision,
  getCrossDomainInsights,
  getProvenInsights,
};
