/**
 * Modal Component
 *
 * Base modal overlay for TUI with dynamic centering.
 */

import React from 'react';
import { Box, Text, useInput, useStdout } from 'ink';

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
  const { stdout } = useStdout();

  // Handle ESC and q to close
  useInput((input, key) => {
    if (key.escape || input === 'q') {
      onClose();
    }
  });

  // Calculate centering based on terminal size
  const termWidth = stdout?.columns ?? 80;
  const termHeight = stdout?.rows ?? 24;

  // Center horizontally, offset from top
  const marginLeft = Math.max(0, Math.floor((termWidth - width) / 2));
  const marginTop = Math.max(1, Math.floor(termHeight / 6));

  return (
    <Box
      flexDirection="column"
      position="absolute"
      marginLeft={marginLeft}
      marginTop={marginTop}
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
