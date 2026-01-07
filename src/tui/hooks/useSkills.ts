/**
 * useSkills Hook
 *
 * Fetches skills and skill reflections from the database.
 */

import { useEffect, useCallback, useState } from 'react';
import { useAppContext, Domain, Skill, JudgeFeedback } from '../context/AppContext.js';

const POLL_INTERVAL = 30000; // 30 seconds

export function useSkills() {
  const { state, dispatch } = useAppContext();
  const [error, setError] = useState<string | null>(null);

  const fetchSkills = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', key: 'skills', loading: true });

    try {
      // Import skill functions
      const { listSkills, readSkill } = await import('../../skills/skill-creator.js');
      const { getSkillReflections } = await import('../../db/index.js');

      // List skill files and read them
      const skillFiles = await listSkills();
      const skills: Skill[] = [];

      for (const filename of skillFiles.slice(0, 20)) {
        try {
          const content = await readSkill(filename.replace('.md', ''));
          if (content) {
            // Extract metadata from filename
            const parts = filename.replace('.md', '').split('-');
            const domain = parts.find(p => ['dlmm', 'perps', 'polymarket', 'spot'].includes(p)) as Domain || 'dlmm';

            skills.push({
              id: filename,
              name: filename.replace('.md', ''),
              domain,
              effectiveness: 70, // Default
              usageCount: 0,
              content,
            });
          }
        } catch {
          // Skip unreadable skills
        }
      }

      dispatch({ type: 'SET_SKILLS', skills });

      // Fetch skill reflections and convert to feedback format
      const reflections = await getSkillReflections({});
      const feedback: JudgeFeedback[] = reflections.slice(0, 20).map((r, i) => ({
        id: `reflection-${i}`,
        domain: r.domain as Domain,
        decisionId: r.skillName,
        rating: (r.effectivenessScore ?? 0) > 50 ? 'good' as const : 'neutral' as const,
        feedback: `${r.skillName} (${r.sourceType}) - ${r.timesApplied} uses`,
        createdAt: new Date(r.createdAt),
      }));

      dispatch({ type: 'SET_JUDGE_FEEDBACK', feedback });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch skills');
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'skills', loading: false });
    }
  }, [dispatch]);

  // Initial fetch and polling
  useEffect(() => {
    fetchSkills();

    const interval = setInterval(fetchSkills, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchSkills]);

  // Computed values
  const skillsByDomain = state.skills.reduce((acc, s) => {
    if (!acc[s.domain]) acc[s.domain] = [];
    acc[s.domain].push(s);
    return acc;
  }, {} as Record<Domain, Skill[]>);

  const topSkills = [...state.skills]
    .sort((a, b) => b.effectiveness - a.effectiveness)
    .slice(0, 5);

  const recentFeedback = state.judgeFeedback.slice(0, 10);

  const feedbackStats = {
    total: state.judgeFeedback.length,
    good: state.judgeFeedback.filter(f => f.rating === 'good').length,
    bad: state.judgeFeedback.filter(f => f.rating === 'bad').length,
    neutral: state.judgeFeedback.filter(f => f.rating === 'neutral').length,
  };

  return {
    skills: state.skills,
    judgeFeedback: state.judgeFeedback,
    loading: state.loading.skills,
    error,
    skillsByDomain,
    topSkills,
    recentFeedback,
    feedbackStats,
    selectedSkill: state.selectedSkillId
      ? state.skills.find(s => s.id === state.selectedSkillId)
      : null,
    refresh: fetchSkills,
  };
}

export default useSkills;
