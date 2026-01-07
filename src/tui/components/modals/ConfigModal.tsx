/**
 * ConfigModal Component
 *
 * Modal for viewing and editing configuration.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { Modal } from './Modal.js';
import { useAppContext, Domain } from '../../context/AppContext.js';

export interface ConfigModalProps {
  onClose: () => void;
}

const DOMAIN_LABELS: Record<Domain, string> = {
  dlmm: 'DLMM (Meteora LP)',
  perps: 'Perps (Hyperliquid)',
  polymarket: 'Polymarket',
  spot: 'Spot Trading',
};

export const ConfigModal: React.FC<ConfigModalProps> = ({ onClose }) => {
  const { state } = useAppContext();

  const formatInterval = (ms: number): string => {
    const minutes = Math.floor(ms / 60000);
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours > 1 ? 's' : ''}`;
  };

  return (
    <Modal title="Configuration" onClose={onClose} width={55}>
      {/* Trading Mode */}
      <Box marginBottom={1}>
        <Text bold>Trading Mode: </Text>
        <Text color={state.mode === 'paper' ? 'yellow' : 'red'}>
          {state.mode === 'paper' ? 'Paper Trading' : 'Live Trading'}
        </Text>
      </Box>

      {/* Cycle Interval */}
      <Box marginBottom={1}>
        <Text bold>Cycle Interval: </Text>
        <Text>{formatInterval(state.cycleInterval)}</Text>
      </Box>

      {/* Confidence Threshold */}
      <Box marginBottom={1}>
        <Text bold>Confidence Threshold: </Text>
        <Text>{(state.confidenceThreshold * 100).toFixed(0)}%</Text>
      </Box>

      {/* Active Domains */}
      <Box flexDirection="column" marginBottom={1}>
        <Box marginBottom={1}>
          <Text bold>Active Domains:</Text>
        </Box>
        {(['dlmm', 'perps', 'polymarket', 'spot'] as Domain[]).map(domain => {
          const isActive = state.activeDomains.includes(domain);
          return (
            <Box key={domain} marginLeft={2}>
              <Text color={isActive ? 'green' : 'gray'}>
                {isActive ? '✓' : '○'} {DOMAIN_LABELS[domain]}
              </Text>
            </Box>
          );
        })}
      </Box>

      {/* Status */}
      <Box borderStyle="single" borderColor="gray" paddingX={1} marginTop={1}>
        <Text dimColor>
          Cycle #{state.cycleNumber}
          {state.lastCycleTime && ` • Last: ${state.lastCycleTime.toLocaleTimeString()}`}
        </Text>
      </Box>

      {/* Help */}
      <Box marginTop={1}>
        <Text dimColor italic>
          Edit config in ~/.claudefi/config.json
        </Text>
      </Box>
    </Modal>
  );
};

export default ConfigModal;
