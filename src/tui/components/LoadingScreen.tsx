/**
 * LoadingScreen Component
 *
 * Cool initialization screen with ASCII art logo and progress tracking.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
import Spinner from 'ink-spinner';
import qrcode from 'qrcode-terminal';
import { useAppContext, InitStepStatus } from '../context/AppContext.js';

// ASCII art logo
const LOGO = [
  '  ██████╗██╗      █████╗ ██╗   ██╗██████╗ ███████╗███████╗██╗',
  ' ██╔════╝██║     ██╔══██╗██║   ██║██╔══██╗██╔════╝██╔════╝██║',
  ' ██║     ██║     ███████║██║   ██║██║  ██║█████╗  █████╗  ██║',
  ' ██║     ██║     ██╔══██║██║   ██║██║  ██║██╔══╝  ██╔══╝  ██║',
  ' ╚██████╗███████╗██║  ██║╚██████╔╝██████╔╝███████╗██║     ██║',
  '  ╚═════╝╚══════╝╚═╝  ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝     ╚═╝',
];

const DISCORD_URL = 'https://discord.gg/nzW8srS9';

// Generate QR code once at module load
let discordQrLines: string[] = [];
qrcode.generate(DISCORD_URL, { small: true }, (qr: string) => {
  discordQrLines = qr.split('\n').filter(line => line.length > 0);
});

const STEPS = [
  { key: 'config', label: 'Loading configuration' },
  { key: 'database', label: 'Connecting to database' },
  { key: 'portfolio', label: 'Fetching portfolio' },
  { key: 'skills', label: 'Loading skills' },
  { key: 'market', label: 'Fetching market data' },
] as const;

const StatusIcon: React.FC<{ status: InitStepStatus }> = ({ status }) => {
  switch (status) {
    case 'pending':
      return <Text dimColor>○</Text>;
    case 'loading':
      return (
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
      );
    case 'done':
      return <Text color="green">✓</Text>;
    case 'error':
      return <Text color="red">✗</Text>;
  }
};

export const LoadingScreen: React.FC = () => {
  const { state } = useAppContext();
  const { stdout } = useStdout();
  const { initProgress, appPhase } = state;

  // Calculate progress percentage
  const completedSteps = Object.values(initProgress).filter(s => s === 'done').length;
  const totalSteps = Object.keys(initProgress).length;
  const progressPercent = Math.round((completedSteps / totalSteps) * 100);

  // Progress bar
  const barWidth = 40;
  const filledWidth = Math.round((progressPercent / 100) * barWidth);
  const progressBar = '█'.repeat(filledWidth) + '░'.repeat(barWidth - filledWidth);

  // Center the content
  const termWidth = stdout?.columns ?? 80;
  const contentWidth = 65;
  const marginLeft = Math.max(0, Math.floor((termWidth - contentWidth) / 2));

  // Determine status message
  const currentStep = STEPS.find(s => initProgress[s.key] === 'loading');
  const statusMessage = appPhase === 'ready'
    ? 'Ready!'
    : currentStep
      ? currentStep.label + '...'
      : 'Initializing...';

  return (
    <Box
      flexDirection="column"
      marginLeft={marginLeft}
      marginTop={2}
    >
      {/* Logo */}
      <Box flexDirection="column" marginBottom={1}>
        {LOGO.map((line, i) => (
          <Text key={i} color="cyan">{line}</Text>
        ))}
      </Box>

      {/* Tagline */}
      <Box justifyContent="center" marginBottom={2}>
        <Text dimColor>the open source claude agent that learns to trade defi</Text>
      </Box>

      {/* Status message with spinner */}
      <Box justifyContent="center" marginBottom={1}>
        {appPhase === 'ready' ? (
          <Text color="green" bold>✓ {statusMessage}</Text>
        ) : (
          <Box>
            <Text color="cyan">
              <Spinner type="dots" />
            </Text>
            <Text> {statusMessage}</Text>
          </Box>
        )}
      </Box>

      {/* Progress bar */}
      <Box justifyContent="center" marginBottom={2}>
        <Text color="cyan">[</Text>
        <Text color={progressPercent === 100 ? 'green' : 'cyan'}>{progressBar}</Text>
        <Text color="cyan">]</Text>
        <Text> {progressPercent}%</Text>
      </Box>

      {/* Step status list */}
      <Box flexDirection="column" marginLeft={4}>
        {STEPS.map(({ key, label }) => (
          <Box key={key} gap={1}>
            <StatusIcon status={initProgress[key]} />
            <Text
              color={initProgress[key] === 'done' ? 'green' : initProgress[key] === 'loading' ? 'cyan' : 'gray'}
              dimColor={initProgress[key] === 'pending'}
            >
              {label}
            </Text>
          </Box>
        ))}
      </Box>

      {/* Mode indicator */}
      <Box marginTop={2} justifyContent="center">
        <Text dimColor>
          Mode: <Text color={state.mode === 'paper' ? 'yellow' : 'red'}>{state.mode.toUpperCase()}</Text>
        </Text>
      </Box>

      {/* Divider */}
      <Box marginTop={2} justifyContent="center">
        <Text dimColor>────────────────────────────────────</Text>
      </Box>

      {/* Discord QR code */}
      <Box flexDirection="column" marginTop={1} alignItems="center">
        <Text dimColor>scan to join discord</Text>
        {discordQrLines.map((line, i) => (
          <Text key={i} color="white">{line}</Text>
        ))}
        <Text color="cyan">{DISCORD_URL}</Text>
      </Box>

      {/* Community links */}
      <Box marginTop={1} justifyContent="center">
        <Text dimColor>web: </Text>
        <Text color="cyan">claudefi.com</Text>
        <Text dimColor>  ·  </Text>
        <Text dimColor>x: </Text>
        <Text color="cyan">@claudefi11</Text>
      </Box>

      {/* Footer */}
      <Box marginTop={1} justifyContent="center">
        <Text dimColor italic>built for the trenches · powered by claude</Text>
      </Box>
    </Box>
  );
};

export default LoadingScreen;
