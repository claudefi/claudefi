/**
 * SkillsPanel
 *
 * Shows active skills and judge feedback.
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useSkills } from '../../hooks/useSkills.js';

const SkillStatus: React.FC<{ effectiveness: number }> = ({ effectiveness }) => (
  <Text color={effectiveness >= 50 ? 'green' : 'red'}>●</Text>
);

export const SkillsPanel: React.FC = () => {
  const { skills, recentFeedback, feedbackStats, loading, topSkills } = useSkills();

  if (loading && skills.length === 0) {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Loading skills...</Text>
      </Box>
    );
  }

  const starterPackActive = skills.length > 0 && skills.every(skill => skill.id.startsWith('builtin-'));

  return (
    <Box flexDirection="column">
      {starterPackActive && (
        <Box marginBottom={1} flexDirection="column">
          <Text color="yellow" bold>Starter skills active</Text>
          <Text dimColor>Live cycles will replace these defaults with personalized reflections.</Text>
        </Box>
      )}

      {/* Stats row */}
      <Box marginBottom={1}>
        <Text>Active Skills: </Text>
        <Text color="cyan" bold>{skills.length}</Text>
        <Text dimColor> | </Text>
        <Text>Judge: </Text>
        <Text color="green">{feedbackStats.good}</Text>
        <Text dimColor>/</Text>
        <Text color="red">{feedbackStats.bad}</Text>
      </Box>

      {/* Top skills */}
      <Text dimColor bold>Top Skills:</Text>
      {topSkills.slice(0, 3).map((skill) => (
        <Box key={skill.id} marginLeft={1} gap={1}>
          <SkillStatus effectiveness={skill.effectiveness} />
          <Text color="cyan">{skill.name.slice(0, 22)}</Text>
          <Text dimColor>({skill.domain})</Text>
        </Box>
      ))}

      {/* Recent feedback */}
      {recentFeedback.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text dimColor bold>Recent Judge Feedback:</Text>
          {recentFeedback.slice(0, 2).map((fb) => (
            <Box key={fb.id} marginLeft={1}>
              <Text color={fb.rating === 'good' ? 'green' : fb.rating === 'bad' ? 'red' : 'gray'}>
                {fb.rating === 'good' ? '✓' : fb.rating === 'bad' ? '✗' : '○'}
              </Text>
              <Text> </Text>
              <Text dimColor>
                {fb.feedback.slice(0, 40)}
                {fb.feedback.length > 40 ? '...' : ''}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Press s hint */}
      <Box marginTop={1}>
        <Text dimColor>Press </Text>
        <Text color="cyan">[s]</Text>
        <Text dimColor> to view all skills</Text>
      </Box>
    </Box>
  );
};

export default SkillsPanel;
