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

import { getSupabase } from '../../clients/supabase/client.js';

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
  const supabase = getSupabase();
  const { domain, limit = 50, sortBy = 'downloads' } = options;

  let query = supabase
    .from('community_skills')
    .select('*')
    .order(sortBy, { ascending: false })
    .limit(limit);

  if (domain) {
    query = query.eq('domain', domain);
  }

  const { data, error } = await query;

  if (error) {
    console.error('Failed to fetch community skills:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    author: row.author,
    githubUrl: row.github_url,
    domain: row.domain,
    downloads: row.downloads || 0,
    rating: row.rating || 0,
    version: row.version || '1.0.0',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

/**
 * Search community skills by query
 */
export async function searchCommunitySkills(query: string): Promise<CommunitySkill[]> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('community_skills')
    .select('*')
    .or(`name.ilike.%${query}%,description.ilike.%${query}%`)
    .order('downloads', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Failed to search community skills:', error);
    return [];
  }

  return (data || []).map(row => ({
    id: row.id,
    name: row.name,
    description: row.description,
    author: row.author,
    githubUrl: row.github_url,
    domain: row.domain,
    downloads: row.downloads || 0,
    rating: row.rating || 0,
    version: row.version || '1.0.0',
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  }));
}

/**
 * Get a single community skill by name
 */
export async function getCommunitySkill(name: string): Promise<CommunitySkill | null> {
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('community_skills')
    .select('*')
    .eq('name', name)
    .single();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    author: data.author,
    githubUrl: data.github_url,
    domain: data.domain,
    downloads: data.downloads || 0,
    rating: data.rating || 0,
    version: data.version || '1.0.0',
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
  };
}

/**
 * Increment download count for a skill
 */
export async function incrementDownloads(skillName: string): Promise<void> {
  const supabase = getSupabase();

  const { error } = await supabase.rpc('increment_skill_downloads', {
    skill_name: skillName,
  });

  if (error) {
    console.error('Failed to increment downloads:', error);
  }
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
  const supabase = getSupabase();

  const { data, error } = await supabase
    .from('community_skills')
    .insert({
      name: skill.name,
      description: skill.description,
      author: skill.author,
      github_url: skill.githubUrl,
      domain: skill.domain,
    })
    .select()
    .single();

  if (error) {
    console.error('Failed to register community skill:', error);
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    description: data.description,
    author: data.author,
    githubUrl: data.github_url,
    domain: data.domain,
    downloads: 0,
    rating: 0,
    version: '1.0.0',
    createdAt: new Date(data.created_at),
    updatedAt: new Date(data.updated_at),
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
