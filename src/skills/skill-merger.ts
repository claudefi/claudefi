/**
 * Skill Merger - Deduplication and Synthesis
 *
 * Prevents skill explosion by:
 * 1. Detecting similar skills before creating new ones
 * 2. Merging redundant skills into evolved versions
 * 3. Archiving superseded skills
 *
 * This solves the "10 similar 'avoid low TVL' warnings" problem.
 */

import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { Domain } from '../types/index.js';
import { listSkills, readSkill, SKILLS_DIR } from './reflection-creator.js';

const ARCHIVE_DIR = path.join(SKILLS_DIR, 'archive');

/**
 * Similarity threshold for considering skills as duplicates
 * Range: 0-1, where 1 = identical
 */
const SIMILARITY_THRESHOLD = 0.7;

/**
 * Minimum number of similar skills required to trigger a merge
 */
const MIN_SKILLS_TO_MERGE = 2;

export interface SimilarSkill {
  filename: string;
  content: string;
  similarityScore: number;
  keyTakeaway: string;
}

export interface MergeResult {
  merged: boolean;
  newSkillFilename?: string;
  archivedSkills: string[];
  reason: string;
}

/**
 * Calculate semantic similarity between two skill contents using Claude
 * Returns a score from 0-1
 */
async function calculateSimilarity(
  skill1Content: string,
  skill2Content: string
): Promise<number> {
  const anthropic = new Anthropic();

  const prompt = `Compare these two trading skill documents and rate their similarity from 0.0 to 1.0.

Focus on:
- Do they address the same problem/pattern?
- Do they give similar advice?
- Could they be merged into one skill?

SKILL 1:
${skill1Content.slice(0, 1500)}

SKILL 2:
${skill2Content.slice(0, 1500)}

Respond with ONLY a decimal number between 0.0 and 1.0.
0.0 = completely different topics
0.5 = related but distinct
0.7+ = should probably be merged
1.0 = essentially identical

Your answer (just the number):`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101', // Always use Opus 4.5 for best quality
      max_tokens: 10,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '0';
    const score = parseFloat(text.trim());
    return isNaN(score) ? 0 : Math.max(0, Math.min(1, score));
  } catch (error) {
    console.warn('Failed to calculate similarity:', error);
    return 0;
  }
}

/**
 * Extract the key takeaway from a skill for comparison
 */
function extractKeyTakeaway(content: string): string {
  // Try to find the main insight/warning
  const lines = content.split('\n');
  for (const line of lines) {
    if (line.toLowerCase().includes('key insight') ||
        line.toLowerCase().includes('pattern to recognize') ||
        line.toLowerCase().includes('what went wrong')) {
      // Get the next non-empty line
      const idx = lines.indexOf(line);
      for (let i = idx + 1; i < lines.length && i < idx + 5; i++) {
        const nextLine = lines[i].trim();
        if (nextLine && !nextLine.startsWith('#') && !nextLine.startsWith('-')) {
          return nextLine.slice(0, 200);
        }
      }
    }
  }
  // Fallback: first paragraph after title
  const firstParagraph = content.split('\n\n')[1] || '';
  return firstParagraph.slice(0, 200);
}

/**
 * Find skills similar to a new skill content
 */
export async function findSimilarSkills(
  newSkillContent: string,
  domain: Domain,
  type?: 'warning' | 'pattern' | 'strategy'
): Promise<SimilarSkill[]> {
  const skills = await listSkills();

  // Filter to relevant skills (same domain or general)
  const relevantSkills = skills.filter(filename => {
    const isDomainMatch = filename.includes(domain) ||
                          filename.includes('portfolio') ||
                          filename.includes('general');
    const isTypeMatch = !type || filename.includes(type);
    return isDomainMatch && isTypeMatch;
  });

  const similarSkills: SimilarSkill[] = [];

  // Compare against existing skills
  for (const filename of relevantSkills.slice(0, 20)) { // Limit to prevent API cost explosion
    const content = await readSkill(filename);
    if (!content) continue;

    const similarity = await calculateSimilarity(newSkillContent, content);

    if (similarity >= SIMILARITY_THRESHOLD) {
      similarSkills.push({
        filename,
        content,
        similarityScore: similarity,
        keyTakeaway: extractKeyTakeaway(content),
      });
    }
  }

  // Sort by similarity (highest first)
  return similarSkills.sort((a, b) => b.similarityScore - a.similarityScore);
}

/**
 * Merge multiple similar skills into one evolved skill
 */
export async function mergeSkills(
  skills: SimilarSkill[],
  domain: Domain,
  newSkillContent?: string
): Promise<string> {
  const anthropic = new Anthropic();

  const allContent = [
    ...(newSkillContent ? [`NEW SKILL (not yet saved):\n${newSkillContent}`] : []),
    ...skills.map((s, i) => `EXISTING SKILL ${i + 1} (${s.filename}):\n${s.content}`),
  ].join('\n\n---\n\n');

  const prompt = `You are the skill-merger for Claudefi, an autonomous trading agent.

Multiple similar skills have been detected that should be merged into one comprehensive skill.
Your job is to synthesize these into a single, evolved skill that captures all unique insights.

## Skills to Merge

${allContent}

## Your Task

Create a single merged skill that:
1. Captures ALL unique insights from the input skills
2. Removes redundancy and repetition
3. Organizes information clearly
4. Is more actionable than any individual skill
5. Notes that it evolved from ${skills.length + (newSkillContent ? 1 : 0)} previous learnings

The merged skill should be comprehensive but not bloated.
Focus on actionable guidance.

Write the merged skill in markdown format.`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0].type === 'text' ? response.content[0].text : '';

    // Add merge metadata
    const mergedContent = `# Evolved Skill: ${domain.toUpperCase()}

*Synthesized from ${skills.length + (newSkillContent ? 1 : 0)} related skills on ${new Date().toISOString()}*
*Previous skills: ${skills.map(s => s.filename).join(', ')}*

---

${content}
`;

    return mergedContent;
  } catch (error) {
    console.error('Failed to merge skills:', error);
    // Return the new skill content if merge fails
    return newSkillContent || skills[0]?.content || '';
  }
}

/**
 * Archive old skills that have been superseded
 */
export async function archiveSkills(filenames: string[]): Promise<void> {
  // Ensure archive directory exists
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });

  for (const filename of filenames) {
    const sourcePath = path.join(SKILLS_DIR, filename);
    const archivePath = path.join(ARCHIVE_DIR, `${Date.now()}-${filename}`);

    try {
      await fs.rename(sourcePath, archivePath);
      console.log(`  📦 Archived: ${filename}`);
    } catch (error) {
      console.warn(`  ⚠️  Could not archive ${filename}:`, error);
    }
  }
}

/**
 * Main entry point: Check if skill should be merged before saving
 *
 * Call this BEFORE saving a new skill:
 * 1. If similar skills found, merge them
 * 2. Archive the old skills
 * 3. Return the merged content (or original if no merge needed)
 */
export async function checkAndMerge(
  newSkillContent: string,
  domain: Domain,
  type: 'warning' | 'pattern' | 'strategy'
): Promise<MergeResult> {
  console.log(`🔍 Checking for similar ${type} skills in ${domain}...`);

  const similarSkills = await findSimilarSkills(newSkillContent, domain, type);

  if (similarSkills.length < MIN_SKILLS_TO_MERGE) {
    console.log(`  ✓ No duplicates found (${similarSkills.length} similar skills, need ${MIN_SKILLS_TO_MERGE})`);
    return {
      merged: false,
      archivedSkills: [],
      reason: 'No similar skills found',
    };
  }

  console.log(`  ⚠️  Found ${similarSkills.length} similar skills:`);
  for (const skill of similarSkills) {
    console.log(`    - ${skill.filename} (${(skill.similarityScore * 100).toFixed(0)}% similar)`);
  }

  // Merge the skills
  console.log(`  🔄 Merging into single evolved skill...`);
  const mergedContent = await mergeSkills(similarSkills, domain, newSkillContent);

  // Generate new filename
  const newFilename = `evolved-${type}-${domain}-${Date.now()}.md`;

  // Save merged skill
  const newPath = path.join(SKILLS_DIR, newFilename);
  await fs.writeFile(newPath, mergedContent, 'utf-8');
  console.log(`  ✅ Created: ${newFilename}`);

  // Archive old skills
  const toArchive = similarSkills.map(s => s.filename);
  await archiveSkills(toArchive);

  return {
    merged: true,
    newSkillFilename: newFilename,
    archivedSkills: toArchive,
    reason: `Merged ${similarSkills.length + 1} similar skills`,
  };
}

/**
 * Periodic cleanup: Find and merge all similar skills
 * Run this during low-activity periods
 */
export async function consolidateAllSkills(domain?: Domain): Promise<{
  mergesPerformed: number;
  skillsArchived: number;
}> {
  console.log('\n🧹 Starting skill consolidation...');

  const skills = await listSkills();
  const domains: Domain[] = domain ? [domain] : ['dlmm', 'perps', 'polymarket', 'spot'];

  let mergesPerformed = 0;
  let skillsArchived = 0;
  const processedSkills = new Set<string>();

  for (const d of domains) {
    const domainSkills = skills.filter(s =>
      s.includes(d) && !processedSkills.has(s) && !s.startsWith('evolved-')
    );

    for (const skill of domainSkills) {
      if (processedSkills.has(skill)) continue;

      const content = await readSkill(skill);
      if (!content) continue;

      const similar = await findSimilarSkills(content, d);
      // Filter out already processed skills
      const unprocessed = similar.filter(s => !processedSkills.has(s.filename));

      if (unprocessed.length >= MIN_SKILLS_TO_MERGE) {
        const result = await checkAndMerge(content, d, getSkillType(skill));
        if (result.merged) {
          mergesPerformed++;
          skillsArchived += result.archivedSkills.length;
          // Mark all merged skills as processed
          for (const archived of result.archivedSkills) {
            processedSkills.add(archived);
          }
        }
      }
      processedSkills.add(skill);
    }
  }

  console.log(`\n📊 Consolidation complete:`);
  console.log(`   Merges performed: ${mergesPerformed}`);
  console.log(`   Skills archived: ${skillsArchived}`);

  return { mergesPerformed, skillsArchived };
}

/**
 * Infer skill type from filename
 */
function getSkillType(filename: string): 'warning' | 'pattern' | 'strategy' {
  if (filename.includes('warning')) return 'warning';
  if (filename.includes('pattern')) return 'pattern';
  if (filename.includes('strategy')) return 'strategy';
  return 'warning'; // Default
}

/**
 * Export the SKILLS_DIR for reference
 */
export { SKILLS_DIR, ARCHIVE_DIR };
