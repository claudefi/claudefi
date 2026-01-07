/**
 * Panel Component
 *
 * Base panel with border, title, and focus state.
 * Used as the building block for all dashboard panels.
 */

import React from 'react';
import { Box, Text } from 'ink';

export interface PanelProps {
  title: string;
  hotkey: string;
  focused?: boolean;
  children: React.ReactNode;
  width?: string | number;
  height?: string | number;
  flexGrow?: number;
}

export const Panel: React.FC<PanelProps> = ({
  title,
  hotkey,
  focused = false,
  children,
  width,
  height,
  flexGrow = 1,
}) => {
  return (
    <Box
      flexDirection="column"
      borderStyle={focused ? 'bold' : 'single'}
      borderColor={focused ? 'cyan' : 'gray'}
      paddingX={1}
      width={width}
      height={height}
      flexGrow={flexGrow}
    >
      {/* Header */}
      <Box justifyContent="space-between" marginBottom={1}>
        <Text bold color={focused ? 'cyan' : 'white'}>
          {title}
        </Text>
        <Text dimColor>[{hotkey}]</Text>
      </Box>

      {/* Content */}
      <Box flexDirection="column" flexGrow={1}>
        {children}
      </Box>
    </Box>
  );
};

export default Panel;
