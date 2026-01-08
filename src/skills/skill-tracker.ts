/**
 * Skill Tracker
 *
 * Tracks which skills were actually applied in agent decisions.
 * Uses explicit skill references in reasoning (not keyword matching).
 */

import { prisma } from '../db/prisma.js';
import type { Domain } from '../types/index.js';
import {
  type QualifiedSkill,
  type SkillUsageDetection,
  type SkillTrackingResult,
  type SkillRecommendation,
} from './types.js';

// =============================================================================
// SKILL USAGE DETECTION
// =============================================================================

/**
 * Detect if a skill was applied in the agent's reasoning
 *
 * This uses explicit detection instead of keyword matching:
 * - Explicit: Agent mentions skill by name (e.g., "Applying 'warning-dlmm-low-tvl'...")
 * - Implicit: Agent references key concepts from the skill without naming it
 */
export function detectSkillUsage(
  skill: QualifiedSkill,
  reasoning: string
): SkillUsageDetection {
  const skillNameLower = skill.name.toLowerCase();
  const reasoningLower = reasoning.toLowerCase();

  // Check for explicit mentions (highest confidence)
  // Patterns like: "warning-dlmm-low-tvl", 'warning-dlmm-low-tvl', skill "warning-dlmm-low-tvl"
  const explicitPatterns = [
    new RegExp(`['"]${escapeRegex(skillNameLower)}['"]`, 'i'),
    new RegExp(`skill\\s+['"]?${escapeRegex(skillNameLower)}['"]?`, 'i'),
    new RegExp(`applying\\s+['"]?${escapeRegex(skillNameLower)}['"]?`, 'i'),
    new RegExp(`using\\s+['"]?${escapeRegex(skillNameLower)}['"]?`, 'i'),
    new RegExp(`based\\s+on\\s+['"]?${escapeRegex(skillNameLower)}['"]?`, 'i'),
    new RegExp(`following\\s+['"]?${escapeRegex(skillNameLower)}['"]?`, 'i'),
  ];

  for (const pattern of explicitPatterns) {
    const match = reasoning.match(pattern);
    if (match) {
      // Extract surrounding context as quote
      const start = Math.max(0, match.index! - 50);
      const end = Math.min(reasoning.length, match.index! + match[0].length + 50);
      const quote = reasoning.slice(start, end).trim();

      return {
        skillName: skill.name,
        wasApplied: true,
        confidence: 0.95,
        quote: `...${quote}...`,
        matchType: 'explicit',
      };
    }
  }

  // Check for implicit references (lower confidence)
  // Look for key concepts from the skill content
  const keyPhrases = extractKeyPhrases(skill.content);
  const matchedPhrases: string[] = [];

  for (const phrase of keyPhrases) {
    if (reasoningLower.includes(phrase.toLowerCase())) {
      matchedPhrases.push(phrase);
    }
  }

  // If multiple key phrases match, consider it implicit usage
  if (matchedPhrases.length >= 3) {
    return {
      skillName: skill.name,
      wasApplied: true,
      confidence: 0.6,
      quote: `Matched concepts: ${matchedPhrases.slice(0, 3).join(', ')}`,
      matchType: 'implicit',
    };
  }

  // No usage detected
  return {
    skillName: skill.name,
    wasApplied: false,
    confidence: 0.0,
    matchType: 'none',
  };
}

/**
 * Extract key phrases from skill content for implicit matching
 */
function extractKeyPhrases(content: string): string[] {
  // Look for phrases in bold, bullet points, or headers
  const phrases: string[] = [];

  // Extract bold text
  const boldMatches = content.match(/\*\*([^*]+)\*\*/g);
  if (boldMatches) {
    for (const match of boldMatches) {
      const text = match.replace(/\*\*/g, '').trim();
      if (text.length >= 5 && text.length <= 50) {
        phrases.push(text);
      }
    }
  }

  // Extract bullet point content
  const bulletMatches = content.match(/^[-*]\s+(.+)$/gm);
  if (bulletMatches) {
    for (const match of bulletMatches) {
      const text = match.replace(/^[-*]\s+/, '').trim();
      // Take first 5 words
      const words = text.split(' ').slice(0, 5).join(' ');
      if (words.length >= 10) {
        phrases.push(words);
      }
    }
  }

  return phrases.slice(0, 10); // Limit to 10 key phrases
}

/**
 * Escape special regex characters
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// =============================================================================
// SKILL TRACKING
// =============================================================================

/**
 * Track skill usage for a decision
 *
 * Creates SkillRecommendation records in the database
 */
export async function trackSkillUsage(
  decisionId: string,
  recommendedSkills: QualifiedSkill[],
  agentReasoning: string
): Promise<SkillTrackingResult> {
  const detections: SkillUsageDetection[] = [];
  let recommendationsCreated = 0;

  for (const skill of recommendedSkills) {
    const detection = detectSkillUsage(skill, agentReasoning);
    detections.push(detection);

    // Create SkillRecommendation record
    try {
      await prisma.skillRecommendation.create({
        data: {
          decisionId,
          skillName: skill.name,
          domain: skill.domain,
          relevanceScore: skill.relevanceScore,
          wasPresented: true,
          wasApplied: detection.wasApplied,
          agentQuote: detection.quote,
        },
      });
      recommendationsCreated++;
    } catch (error) {
      console.warn(`Failed to create SkillRecommendation for ${skill.name}:`, error);
    }
  }

  // Log summary
  const appliedCount = detections.filter(d => d.wasApplied).length;
  if (appliedCount > 0) {
    console.log(`  🎯 Detected ${appliedCount}/${recommendedSkills.length} skills applied`);
    for (const d of detections.filter(d => d.wasApplied)) {
      console.log(`     • ${d.skillName} (${d.matchType}, ${(d.confidence * 100).toFixed(0)}% conf)`);
    }
  }

  return {
    decisionId,
    detections,
    recommendationsCreated,
  };
}

/**
 * Get skill recommendations for a decision
 */
export async function getSkillRecommendationsForDecision(
  decisionId: string
): Promise<SkillRecommendation[]> {
  const records = await prisma.skillRecommendation.findMany({
    where: { decisionId },
  });

  return records.map(r => ({
    id: r.id,
    decisionId: r.decisionId,
    skillName: r.skillName,
    domain: r.domain as Domain,
    relevanceScore: r.relevanceScore,
    wasPresented: r.wasPresented,
    wasApplied: r.wasApplied,
    agentQuote: r.agentQuote ?? undefined,
    tradeOutcome: r.tradeOutcome as 'profit' | 'loss' | 'pending' | undefined,
    pnlPercent: r.pnlPercent ?? undefined,
    contributedToSuccess: r.contributedToSuccess ?? undefined,
  }));
}

/**
 * Get applied skills for a decision (simplified helper)
 */
export async function getAppliedSkillsForDecision(
  decisionId: string
): Promise<string[]> {
  const records = await prisma.skillRecommendation.findMany({
    where: {
      decisionId,
      wasApplied: true,
    },
    select: { skillName: true },
  });

  return records.map(r => r.skillName);
}
