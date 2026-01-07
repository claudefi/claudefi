/**
 * SkillsPanel
 *
 * Shows active skills and judge feedback.
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useSkills } from '../../hooks/useSkills.js';

const EffectivenessBar: React.FC<{ value: number }> = ({ value }) => {
  const filled = Math.round(value / 10);
  const empty = 10 - filled;
  const color = value >= 70 ? 'green' : value >= 40 ? 'yellow' : 'red';

  return (
    <Text>
      <Text color={color}>{'█'.repeat(filled)}</Text>
      <Text dimColor>{'░'.repeat(empty)}</Text>
      <Text dimColor> {value}%</Text>
    </Text>
  );
};

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

  return (
    <Box flexDirection="column">
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
        <Box key={skill.id} marginLeft={1}>
          <Text>┌ </Text>
          <Text color="cyan">{skill.name.slice(0, 25)}</Text>
          <Text dimColor> ({skill.domain})</Text>
        </Box>
      ))}
      {topSkills.slice(0, 3).map((skill, i) => (
        <Box key={`bar-${skill.id}`} marginLeft={1}>
          <Text>{i === topSkills.slice(0, 3).length - 1 ? '└ ' : '│ '}</Text>
          <EffectivenessBar value={skill.effectiveness} />
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
