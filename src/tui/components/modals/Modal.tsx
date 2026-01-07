/**
 * Modal Component
 *
 * Base modal overlay for TUI.
 */

import React from 'react';
import { Box, Text, useInput } from 'ink';

export interface ModalProps {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  width?: number;
}

export const Modal: React.FC<ModalProps> = ({
  title,
  onClose,
  children,
  width = 50,
}) => {
  // Handle ESC and q to close
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onClose();
    }
  });

  const innerWidth = width - 4; // Account for borders and padding

  return (
    <Box
      flexDirection="column"
      position="absolute"
      marginLeft={10}
      marginTop={3}
    >
      {/* Modal box */}
      <Box
        flexDirection="column"
        borderStyle="double"
        borderColor="cyan"
        width={width}
        paddingX={1}
      >
        {/* Title bar */}
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold color="cyan">{title}</Text>
          <Text dimColor>[ESC] Close</Text>
        </Box>

        {/* Content */}
        <Box flexDirection="column">
          {children}
        </Box>
      </Box>
    </Box>
  );
};

export default Modal;
