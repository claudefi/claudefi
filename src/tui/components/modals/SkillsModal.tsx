/**
 * SkillsModal Component
 *
 * Modal for viewing skills in detail.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Modal } from './Modal.js';
import { useAppContext, Domain } from '../../context/AppContext.js';

export interface SkillsModalProps {
  onClose: () => void;
}

const DOMAIN_COLORS: Record<Domain, string> = {
  dlmm: 'blue',
  perps: 'magenta',
  polymarket: 'green',
  spot: 'yellow',
};

export const SkillsModal: React.FC<SkillsModalProps> = ({ onClose }) => {
  const { state } = useAppContext();

  const sortedSkills = [...state.skills].sort((a, b) => b.effectiveness - a.effectiveness);

  return (
    <Modal title="Skills & Patterns" onClose={onClose} width={60}>
      {sortedSkills.length === 0 ? (
        <Box>
          <Text dimColor>No skills learned yet. Run cycles to develop skills.</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {/* Header */}
          <Box marginBottom={1}>
            <Box width={25}>
              <Text bold dimColor>Skill</Text>
            </Box>
            <Box width={10}>
              <Text bold dimColor>Domain</Text>
            </Box>
            <Box width={10}>
              <Text bold dimColor>Effect.</Text>
            </Box>
            <Box width={8}>
              <Text bold dimColor>Uses</Text>
            </Box>
          </Box>

          {/* Skills list */}
          {sortedSkills.slice(0, 10).map(skill => {
            const effectColor = skill.effectiveness >= 0.8 ? 'green'
              : skill.effectiveness >= 0.5 ? 'yellow' : 'red';

            return (
              <Box key={skill.id}>
                <Box width={25}>
                  <Text>{skill.name.slice(0, 22)}{skill.name.length > 22 ? '...' : ''}</Text>
                </Box>
                <Box width={10}>
                  <Text color={DOMAIN_COLORS[skill.domain]}>
                    {skill.domain.toUpperCase()}
                  </Text>
                </Box>
                <Box width={10}>
                  <Text color={effectColor}>
                    {(skill.effectiveness * 100).toFixed(0)}%
                  </Text>
                </Box>
                <Box width={8}>
                  <Text>{skill.usageCount}</Text>
                </Box>
              </Box>
            );
          })}

          {sortedSkills.length > 10 && (
            <Box marginTop={1}>
              <Text dimColor>... and {sortedSkills.length - 10} more skills</Text>
            </Box>
          )}
        </Box>
      )}

      {/* Judge feedback summary */}
      {state.judgeFeedback.length > 0 && (
        <Box marginTop={1} flexDirection="column">
          <Text bold>Recent Judge Feedback:</Text>
          {state.judgeFeedback.slice(0, 3).map(fb => (
            <Box key={fb.id} marginLeft={2}>
              <Text color={fb.rating === 'good' ? 'green' : fb.rating === 'bad' ? 'red' : 'gray'}>
                {fb.rating === 'good' ? '✓' : fb.rating === 'bad' ? '✗' : '○'}
              </Text>
              <Text> {fb.feedback.slice(0, 40)}...</Text>
            </Box>
          ))}
        </Box>
      )}

      {/* Skills Marketplace */}
      <Box marginTop={1} flexDirection="column" borderStyle="round" borderColor="gray" paddingX={1}>
        <Box>
          <Text bold>Skills Marketplace </Text>
          <Text color="yellow" bold>[Coming Soon]</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Community skills: </Text>
          <Text>Free, user-submitted strategies</Text>
        </Box>
        <Box>
          <Text dimColor>Paid skills: </Text>
          <Text>Premium strategies from top traders</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Submit yours: </Text>
          <Text color="cyan">github.com/claudefi/claudefi/skills</Text>
        </Box>
      </Box>
    </Modal>
  );
};

export default SkillsModal;
