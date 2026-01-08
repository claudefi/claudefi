/**
 * Community Skills Registry
 *
 * Manages community skills from external sources:
 * - GitHub plugin marketplaces
 * - Supabase registry
 * - Local cache
 *
 * Following Anthropic's plugin marketplace pattern.
 */

import {
  fetchCommunitySkills as providerFetchCommunitySkills,
  searchCommunitySkillRegistry,
  getCommunitySkillRecord,
  incrementCommunitySkillDownloads as providerIncrementDownloads,
  registerCommunitySkillRecord,
} from '../../data/provider.js';
import type { CommunitySkillRecord } from '../../types/internal.js';

// Community skill metadata
export interface CommunitySkill {
  id: string;
  name: string;
  description: string;
  author?: string;
  githubUrl?: string;
  domain?: string;
  downloads: number;
  rating: number;
  version: string;
  createdAt: Date;
  updatedAt: Date;
}

// User's installed skill
export interface InstalledSkill {
  skillName: string;
  installedAt: Date;
}

/**
 * Fetch community skills from Supabase registry
 */
export async function fetchCommunitySkills(
  options: {
    domain?: string;
    limit?: number;
    sortBy?: 'downloads' | 'rating' | 'updated_at';
  } = {}
): Promise<CommunitySkill[]> {
  const records = await providerFetchCommunitySkills(options);
  return records.map(mapCommunitySkillRecord);
}

/**
 * Search community skills by query
 */
export async function searchCommunitySkills(query: string): Promise<CommunitySkill[]> {
  const records = await searchCommunitySkillRegistry(query);
  return records.map(mapCommunitySkillRecord);
}

/**
 * Get a single community skill by name
 */
export async function getCommunitySkill(name: string): Promise<CommunitySkill | null> {
  const record = await getCommunitySkillRecord(name);
  return record ? mapCommunitySkillRecord(record) : null;
}

/**
 * Increment download count for a skill
 */
export async function incrementDownloads(skillName: string): Promise<void> {
  await providerIncrementDownloads(skillName);
}

/**
 * Register a new community skill (for publishers)
 */
export async function registerCommunitySkill(skill: {
  name: string;
  description: string;
  author: string;
  githubUrl: string;
  domain?: string;
}): Promise<CommunitySkill | null> {
  const record = await registerCommunitySkillRecord(skill);
  return record ? mapCommunitySkillRecord(record) : null;
}

function mapCommunitySkillRecord(record: CommunitySkillRecord): CommunitySkill {
  return {
    id: record.id,
    name: record.name,
    description: record.description,
    author: record.author,
    githubUrl: record.githubUrl,
    domain: record.domain,
    downloads: record.downloads,
    rating: record.rating,
    version: record.version,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

/**
 * Get top skills by domain
 */
export async function getTopSkillsByDomain(): Promise<Record<string, CommunitySkill[]>> {
  const domains = ['dlmm', 'perps', 'polymarket', 'spot', 'general'];
  const result: Record<string, CommunitySkill[]> = {};

  for (const domain of domains) {
    result[domain] = await fetchCommunitySkills({ domain, limit: 5 });
  }

  return result;
}
