/**
 * StatusBar Component
 *
 * Bottom status bar showing keyboard shortcuts and status info.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface StatusBarProps {
  mode: 'paper' | 'live';
  cycleInterval: number;
  lastCycleTime?: Date;
}

const KeyHint: React.FC<{ shortcut: string; label: string }> = ({ shortcut, label }) => (
  <Box marginRight={2}>
    <Text color="cyan">[{shortcut}]</Text>
    <Text dimColor> {label}</Text>
  </Box>
);

export const StatusBar: React.FC<StatusBarProps> = ({
  mode,
  cycleInterval,
  lastCycleTime,
}) => {
  const modeColor = mode === 'paper' ? 'yellow' : 'red';
  const modeLabel = mode === 'paper' ? 'PAPER' : 'LIVE';
  const intervalMinutes = Math.round(cycleInterval / 60000);

  const timeSinceLastCycle = lastCycleTime
    ? Math.round((Date.now() - lastCycleTime.getTime()) / 1000)
    : null;

  return (
    <Box
      borderStyle="single"
      borderColor="gray"
      paddingX={1}
      justifyContent="space-between"
    >
      {/* Keyboard shortcuts */}
      <Box>
        <KeyHint shortcut="1-4" label="Focus" />
        <KeyHint shortcut="s" label="Skills" />
        <KeyHint shortcut="c" label="Config" />
        <KeyHint shortcut="?" label="Help" />
        <KeyHint shortcut="q" label="Quit" />
      </Box>

      {/* Status info */}
      <Box>
        <Text color={modeColor} bold>
          {modeLabel}
        </Text>
        <Text dimColor> | </Text>
        <Text>
          Cycle: {intervalMinutes}m
        </Text>
        {timeSinceLastCycle !== null && (
          <>
            <Text dimColor> | </Text>
            <Text dimColor>
              Last: {timeSinceLastCycle}s ago
            </Text>
          </>
        )}
      </Box>
    </Box>
  );
};

export default StatusBar;
