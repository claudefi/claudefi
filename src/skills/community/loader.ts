/**
 * Skill Loader
 *
 * Loads skills from multiple sources:
 * 1. Built-in skills (bundled with claudefi)
 * 2. User-generated skills (created by skill-creator from trades)
 * 3. Community skills (installed via plugin system)
 *
 * Skills are loaded into the agent's prompt based on:
 * - Domain relevance (dlmm skills for dlmm trades)
 * - Description matching (semantic relevance)
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import type { Domain } from '../../types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Skill metadata from YAML frontmatter
export interface SkillMetadata {
  name: string;
  description: string;
  allowedTools?: string[];
  domain?: Domain | 'general';
  source: 'built-in' | 'user-generated' | 'community';
  filepath: string;
}

// Loaded skill with content
export interface LoadedSkill extends SkillMetadata {
  content: string;
}

// Directories to search for skills and reflections
const BUILT_IN_DIR = path.join(__dirname, '..', 'built-in');
const USER_GENERATED_DIR = path.join(__dirname, '..', 'user-generated');
const CLAUDE_SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills');
const REFLECTIONS_DIR = path.join(process.cwd(), '.claude', 'reflections');

/**
 * Parse YAML frontmatter from a SKILL.md file
 */
function parseSkillFrontmatter(content: string): { metadata: Partial<SkillMetadata>; body: string } {
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    return { metadata: {}, body: content };
  }

  const [, frontmatter, body] = match;
  const metadata: Partial<SkillMetadata> = {};

  // Parse YAML manually (simple key: value pairs)
  for (const line of frontmatter.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex > 0) {
      const key = line.slice(0, colonIndex).trim();
      const value = line.slice(colonIndex + 1).trim();

      switch (key) {
        case 'name':
          metadata.name = value;
          break;
        case 'description':
          metadata.description = value;
          break;
        case 'allowed-tools':
          metadata.allowedTools = value.split(',').map(t => t.trim());
          break;
        case 'domain':
          metadata.domain = value as Domain | 'general';
          break;
      }
    }
  }

  return { metadata, body };
}

/**
 * Infer domain from skill name or filepath
 */
function inferDomain(name: string, filepath: string): Domain | 'general' {
  const combined = `${name} ${filepath}`.toLowerCase();

  if (combined.includes('dlmm') || combined.includes('liquidity') || combined.includes('meteora')) {
    return 'dlmm';
  }
  if (combined.includes('perps') || combined.includes('perpetual') || combined.includes('hyperliquid')) {
    return 'perps';
  }
  if (combined.includes('polymarket') || combined.includes('prediction')) {
    return 'polymarket';
  }
  if (combined.includes('spot') || combined.includes('memecoin') || combined.includes('jupiter')) {
    return 'spot';
  }

  return 'general';
}

/**
 * Load a single skill file
 */
async function loadSkillFile(
  filepath: string,
  source: SkillMetadata['source']
): Promise<LoadedSkill | null> {
  try {
    const content = await fs.readFile(filepath, 'utf-8');
    const { metadata, body } = parseSkillFrontmatter(content);

    const name = metadata.name || path.basename(path.dirname(filepath));
    const domain = metadata.domain || inferDomain(name, filepath);

    return {
      name,
      description: metadata.description || 'No description',
      allowedTools: metadata.allowedTools,
      domain,
      source,
      filepath,
      content: body,
    };
  } catch {
    return null;
  }
}

/**
 * Load all skills from a directory
 */
async function loadSkillsFromDirectory(
  dir: string,
  source: SkillMetadata['source']
): Promise<LoadedSkill[]> {
  const skills: LoadedSkill[] = [];

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isDirectory()) {
        // Look for SKILL.md in subdirectory
        const skillPath = path.join(dir, entry.name, 'SKILL.md');
        const skill = await loadSkillFile(skillPath, source);
        if (skill) {
          skills.push(skill);
        }
      } else if (entry.name.endsWith('.md')) {
        // Direct .md file (user-generated skills)
        const skillPath = path.join(dir, entry.name);
        const skill = await loadSkillFile(skillPath, source);
        if (skill) {
          skills.push(skill);
        }
      }
    }
  } catch {
    // Directory doesn't exist, return empty
  }

  return skills;
}

/**
 * Load all available skills and reflections
 *
 * Sources:
 * - built-in: Bundled skills in src/skills/built-in/
 * - user-generated: User-created skills
 * - .claude/skills/: Community skills (marketplace)
 * - .claude/reflections/: Auto-generated trading lessons
 */
export async function loadAllSkills(): Promise<LoadedSkill[]> {
  const [builtIn, userGenerated, claudeSkills, reflections] = await Promise.all([
    loadSkillsFromDirectory(BUILT_IN_DIR, 'built-in'),
    loadSkillsFromDirectory(USER_GENERATED_DIR, 'user-generated'),
    loadSkillsFromDirectory(CLAUDE_SKILLS_DIR, 'user-generated'),
    loadSkillsFromDirectory(REFLECTIONS_DIR, 'user-generated'),
  ]);

  return [...builtIn, ...userGenerated, ...claudeSkills, ...reflections];
}

/**
 * Get skills relevant to a specific domain
 */
export async function getSkillsForDomain(domain: Domain): Promise<LoadedSkill[]> {
  const allSkills = await loadAllSkills();

  return allSkills.filter(skill =>
    skill.domain === domain ||
    skill.domain === 'general' ||
    skill.name.includes('portfolio') ||
    skill.name.includes('risk')
  );
}

/**
 * Build skills context for injection into prompts
 */
export async function buildSkillsContext(domain: Domain): Promise<string> {
  const skills = await getSkillsForDomain(domain);

  if (skills.length === 0) {
    return `
## Available Skills

*No skills loaded for ${domain} domain.*
`;
  }

  const skillSections = skills.map(skill => {
    const header = `### ${skill.name}
*Source: ${skill.source}*
${skill.description}

`;
    return header + skill.content;
  });

  return `
## Loaded Skills (${skills.length})

The following skills are available to guide your decisions:

${skillSections.join('\n\n---\n\n')}
`;
}

/**
 * Get skill names and descriptions (lightweight, for discovery)
 */
export async function getSkillIndex(): Promise<Array<{ name: string; description: string; domain: string }>> {
  const allSkills = await loadAllSkills();

  return allSkills.map(skill => ({
    name: skill.name,
    description: skill.description,
    domain: skill.domain || 'general',
  }));
}
