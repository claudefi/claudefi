/**
 * Skill System Types
 *
 * Types for the explicit skill recommendation and tracking system.
 * Replaces unreliable keyword matching with explicit skill tracking.
 */

import type { Domain } from '../types/index.js';

// =============================================================================
// SKILL RECOMMENDATION
// =============================================================================

/**
 * A record of a skill being recommended to the agent
 * Links skill presentation → application → trade outcome
 */
export interface SkillRecommendation {
  id: string;
  decisionId: string;
  skillName: string;
  domain: Domain;
  relevanceScore: number;       // 0-1, how relevant this skill is to current market context
  wasPresented: boolean;        // Was this skill shown in the prompt?
  wasApplied: boolean;          // Did the agent explicitly reference/use it?
  agentQuote?: string;          // Exact quote where agent referenced the skill
  tradeOutcome?: 'profit' | 'loss' | 'pending';
  pnlPercent?: number;
  contributedToSuccess?: boolean; // Did this skill help the trade succeed?
}

/**
 * A skill that has been qualified for use in prompts
 * Only qualified skills are loaded to avoid context bloat
 */
export interface QualifiedSkill {
  name: string;                 // Skill filename without .md
  domain: Domain;
  content: string;              // Full markdown content
  relevanceScore: number;       // 0-1, relevance to current context
  provenEffective: boolean;     // Has >=3 applications with >=50% success
  timesApplied: number;         // Total times this skill was applied
  successRate: number;          // Success rate when applied (0-1)
  sourceType: 'warning' | 'pattern' | 'strategy' | 'evolved';
}

/**
 * Skill effectiveness statistics
 */
export interface SkillEffectiveness {
  skillName: string;
  domain: Domain;
  timesApplied: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  provenEffective: boolean;
  qualifiedAt?: Date;
  consecutiveFailures: number;
}

// =============================================================================
// SKILL RECOMMENDATION CONTEXT
// =============================================================================

/**
 * Market context used for skill relevance scoring
 */
export interface SkillMarketContext {
  domain: Domain;
  // Market conditions
  volatility?: 'low' | 'normal' | 'high';
  trend?: 'bullish' | 'bearish' | 'sideways';
  volume24h?: number;
  // Position context
  hasOpenPositions: boolean;
  positionCount: number;
  // Recent performance
  recentWinRate?: number;
  recentLossCount?: number;
  // Specific market data (varies by domain)
  marketData?: Record<string, unknown>;
}

/**
 * Result of recommending skills for a decision
 */
export interface SkillRecommendationResult {
  recommendedSkills: QualifiedSkill[];
  totalSkillsConsidered: number;
  excludedLowEffectiveness: number;
  excludedLowRelevance: number;
}

// =============================================================================
// SKILL TRACKING
// =============================================================================

/**
 * Skill usage detection result
 */
export interface SkillUsageDetection {
  skillName: string;
  wasApplied: boolean;
  confidence: number;           // 0-1, how confident we are the skill was used
  quote?: string;               // Exact text where skill was referenced
  matchType: 'explicit' | 'implicit' | 'none';
}

/**
 * Result of tracking skill usage in a decision
 */
export interface SkillTrackingResult {
  decisionId: string;
  detections: SkillUsageDetection[];
  recommendationsCreated: number;
}

// =============================================================================
// SKILL OUTCOME
// =============================================================================

/**
 * Outcome recording result
 */
export interface SkillOutcomeResult {
  decisionId: string;
  outcome: 'profit' | 'loss';
  pnlPercent: number;
  skillsUpdated: number;
  effectivenessRecalculated: string[]; // Skill names that had effectiveness updated
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Maximum number of skills to recommend per decision
 * Keeps context manageable and forces prioritization
 */
export const MAX_RECOMMENDED_SKILLS = 5;

/**
 * Minimum applications required to consider a skill "proven"
 * Increased from 3 to 5 for better statistical confidence
 */
export const MIN_APPLICATIONS_FOR_PROVEN = 5;

/**
 * Minimum success rate for a skill to be considered effective
 * Raised from 0.5 to 0.55 to reduce false positives
 */
export const MIN_SUCCESS_RATE_FOR_EFFECTIVE = 0.55;

/**
 * Minimum relevance score to include a skill in recommendations
 */
export const MIN_RELEVANCE_SCORE = 0.3;

/**
 * Maximum consecutive failures before a skill is deprioritized
 */
export const MAX_CONSECUTIVE_FAILURES = 5;

/**
 * Minimum Wilson score lower bound for proven effectiveness
 * Wilson score provides statistical confidence for success rate
 * With z=1.645 (90% confidence), this ensures we're confident the true rate is above 45%
 */
export const MIN_WILSON_LOWER_BOUND = 0.45;

/**
 * Z-score for Wilson score calculation (90% confidence)
 */
export const WILSON_Z_SCORE = 1.645;

/**
 * Half-life in days for time-weighted success rate
 * Recent outcomes are weighted more heavily than old ones
 */
export const RECENCY_DECAY_DAYS = 30;

/**
 * Minimum consecutive failures before demotion check
 */
export const MIN_FAILURES_FOR_DEMOTION = 3;
