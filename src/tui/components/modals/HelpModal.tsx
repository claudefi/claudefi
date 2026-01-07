/**
 * HelpModal Component
 *
 * Modal showing keyboard shortcuts and help.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Modal } from './Modal.js';

export interface HelpModalProps {
  onClose: () => void;
}

const shortcuts = [
  { key: '1-4', action: 'Focus panel 1-4' },
  { key: 'Tab', action: 'Cycle focus forward' },
  { key: 's', action: 'View skills detail' },
  { key: 'c', action: 'Open configuration' },
  { key: 'r', action: 'Force refresh data' },
  { key: 'j/k', action: 'Navigate items in panel' },
  { key: '?', action: 'Show this help' },
  { key: 'q', action: 'Quit / Close modal' },
];

export const HelpModal: React.FC<HelpModalProps> = ({ onClose }) => {
  return (
    <Modal title="Keyboard Shortcuts" onClose={onClose} width={45}>
      <Box flexDirection="column">
        {shortcuts.map(({ key, action }) => (
          <Box key={key}>
            <Box width={12}>
              <Text color="cyan" bold>{key}</Text>
            </Box>
            <Text>{action}</Text>
          </Box>
        ))}
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text bold>Panels:</Text>
        <Box marginLeft={2} flexDirection="column">
          <Text>[1] Positions & P&L</Text>
          <Text>[2] Agent Activity</Text>
          <Text>[3] Skills & Learning</Text>
          <Text>[4] Market Data</Text>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Powered by Claude Agent SDK</Text>
      </Box>
    </Modal>
  );
};

export default HelpModal;
