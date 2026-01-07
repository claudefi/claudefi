/**
 * Skill Installer
 *
 * Handles installing/uninstalling community skills:
 * - Download from GitHub
 * - Copy to local skills directory
 * - Track installed skills in Supabase
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { getSupabase } from '../../clients/supabase/client.js';
import { getCommunitySkill, incrementDownloads, type CommunitySkill } from './registry.js';

const INSTALLED_SKILLS_DIR = path.join(process.cwd(), '.claude', 'skills', 'community');

// Result of an install/uninstall operation
export interface InstallResult {
  success: boolean;
  skillName: string;
  message: string;
  filepath?: string;
}

/**
 * Ensure the community skills directory exists
 */
async function ensureSkillsDir(): Promise<void> {
  await fs.mkdir(INSTALLED_SKILLS_DIR, { recursive: true });
}

/**
 * Download skill content from GitHub
 */
async function downloadSkillFromGitHub(githubUrl: string): Promise<string | null> {
  try {
    // Convert GitHub URL to raw content URL
    // github.com/owner/repo/blob/main/skills/skill-name/SKILL.md
    // -> raw.githubusercontent.com/owner/repo/main/skills/skill-name/SKILL.md
    const rawUrl = githubUrl
      .replace('github.com', 'raw.githubusercontent.com')
      .replace('/blob/', '/');

    const response = await fetch(rawUrl);
    if (!response.ok) {
      console.error(`Failed to download skill: ${response.status}`);
      return null;
    }

    return await response.text();
  } catch (error) {
    console.error('Failed to download skill from GitHub:', error);
    return null;
  }
}

/**
 * Install a community skill
 */
export async function installSkill(skillName: string): Promise<InstallResult> {
  // Get skill info from registry
  const skill = await getCommunitySkill(skillName);
  if (!skill) {
    return {
      success: false,
      skillName,
      message: `Skill "${skillName}" not found in registry`,
    };
  }

  // Check if already installed
  const isInstalled = await isSkillInstalled(skillName);
  if (isInstalled) {
    return {
      success: false,
      skillName,
      message: `Skill "${skillName}" is already installed`,
    };
  }

  // Download skill content
  if (!skill.githubUrl) {
    return {
      success: false,
      skillName,
      message: `Skill "${skillName}" has no GitHub URL`,
    };
  }

  const content = await downloadSkillFromGitHub(skill.githubUrl);
  if (!content) {
    return {
      success: false,
      skillName,
      message: `Failed to download skill "${skillName}" from GitHub`,
    };
  }

  // Ensure directory and save skill
  await ensureSkillsDir();
  const skillDir = path.join(INSTALLED_SKILLS_DIR, skillName);
  await fs.mkdir(skillDir, { recursive: true });

  const filepath = path.join(skillDir, 'SKILL.md');
  await fs.writeFile(filepath, content, 'utf-8');

  // Track installation in Supabase
  await trackInstallation(skillName);

  // Increment download count
  await incrementDownloads(skillName);

  return {
    success: true,
    skillName,
    message: `Successfully installed "${skillName}"`,
    filepath,
  };
}

/**
 * Uninstall a community skill
 */
export async function uninstallSkill(skillName: string): Promise<InstallResult> {
  // Check if installed
  const isInstalled = await isSkillInstalled(skillName);
  if (!isInstalled) {
    return {
      success: false,
      skillName,
      message: `Skill "${skillName}" is not installed`,
    };
  }

  // Remove skill directory
  const skillDir = path.join(INSTALLED_SKILLS_DIR, skillName);
  try {
    await fs.rm(skillDir, { recursive: true, force: true });
  } catch {
    return {
      success: false,
      skillName,
      message: `Failed to remove skill directory`,
    };
  }

  // Remove from tracking
  await untrackInstallation(skillName);

  return {
    success: true,
    skillName,
    message: `Successfully uninstalled "${skillName}"`,
  };
}

/**
 * Check if a skill is installed locally
 */
export async function isSkillInstalled(skillName: string): Promise<boolean> {
  const skillPath = path.join(INSTALLED_SKILLS_DIR, skillName, 'SKILL.md');
  try {
    await fs.access(skillPath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get list of installed skills
 */
export async function getInstalledSkills(): Promise<string[]> {
  try {
    await ensureSkillsDir();
    const entries = await fs.readdir(INSTALLED_SKILLS_DIR, { withFileTypes: true });
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name);
  } catch {
    return [];
  }
}

/**
 * Track skill installation in Supabase
 */
async function trackInstallation(skillName: string): Promise<void> {
  try {
    const supabase = getSupabase();

    await supabase
      .from('user_skills')
      .insert({
        skill_name: skillName,
        // user_id would come from auth context in real implementation
      });
  } catch (error) {
    console.error('Failed to track installation:', error);
  }
}

/**
 * Remove skill installation tracking
 */
async function untrackInstallation(skillName: string): Promise<void> {
  try {
    const supabase = getSupabase();

    await supabase
      .from('user_skills')
      .delete()
      .eq('skill_name', skillName);
  } catch (error) {
    console.error('Failed to untrack installation:', error);
  }
}

/**
 * Update an installed skill to latest version
 */
export async function updateSkill(skillName: string): Promise<InstallResult> {
  // First uninstall
  const uninstallResult = await uninstallSkill(skillName);
  if (!uninstallResult.success) {
    return uninstallResult;
  }

  // Then reinstall
  return installSkill(skillName);
}

/**
 * Get details about an installed skill
 */
export async function getInstalledSkillInfo(skillName: string): Promise<{
  installed: boolean;
  filepath?: string;
  registryInfo?: CommunitySkill;
}> {
  const installed = await isSkillInstalled(skillName);
  const filepath = installed
    ? path.join(INSTALLED_SKILLS_DIR, skillName, 'SKILL.md')
    : undefined;

  const registryInfo = await getCommunitySkill(skillName) || undefined;

  return {
    installed,
    filepath,
    registryInfo,
  };
}
