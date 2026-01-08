/**
 * Dashboard Component
 *
 * Main 2x2 grid layout for the TUI dashboard.
 * Manages panel focus and layout.
 */

import React from 'react';
import { Box, useInput, useApp } from 'ink';
import { Panel } from './Panel.js';
import { StatusBar } from './StatusBar.js';
import { useAppContext } from '../../context/AppContext.js';

export interface DashboardProps {
  focusedPanel: number;
  onPanelFocus: (panel: number) => void;
  mode: 'paper' | 'live';
  cycleInterval: number;
  lastCycleTime?: Date;
  children: {
    positions: React.ReactNode;
    agents: React.ReactNode;
    skills: React.ReactNode;
    market: React.ReactNode;
  };
  onOpenConfig?: () => void;
  onOpenSkills?: () => void;
  onOpenHelp?: () => void;
  onRefresh?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  focusedPanel,
  onPanelFocus,
  mode,
  cycleInterval,
  lastCycleTime,
  children,
  onOpenConfig,
  onOpenSkills,
  onOpenHelp,
  onRefresh,
}) => {
  const { exit } = useApp();
  const { state } = useAppContext();
  const inputLocked = state.inputCapture !== null;

  // Keyboard navigation
  useInput((input, key) => {
    if (inputLocked) {
      return;
    }

    // Number keys to focus panels
    if (input >= '1' && input <= '4') {
      onPanelFocus(parseInt(input));
      return;
    }

    // Tab to cycle focus
    if (key.tab) {
      const next = focusedPanel >= 4 ? 1 : focusedPanel + 1;
      onPanelFocus(next);
      return;
    }

    // Shortcuts
    switch (input.toLowerCase()) {
      case 'q':
        exit();
        break;
      case 'c':
        onOpenConfig?.();
        break;
      case 's':
        onOpenSkills?.();
        break;
      case '?':
        onOpenHelp?.();
        break;
      case 'r':
        onRefresh?.();
        break;
    }
  });

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Top row: Positions + Agents */}
      <Box flexDirection="row" flexGrow={1}>
        <Panel
          title="POSITIONS & P&L"
          hotkey="1"
          focused={focusedPanel === 1}
        >
          {children.positions}
        </Panel>
        <Panel
          title="AGENT ACTIVITY"
          hotkey="2"
          focused={focusedPanel === 2}
        >
          {children.agents}
        </Panel>
      </Box>

      {/* Bottom row: Skills + Market */}
      <Box flexDirection="row" flexGrow={1}>
        <Panel
          title="SKILLS & LEARNING"
          hotkey="3"
          focused={focusedPanel === 3}
        >
          {children.skills}
        </Panel>
        <Panel
          title="MARKET DATA"
          hotkey="4"
          focused={focusedPanel === 4}
        >
          {children.market}
        </Panel>
      </Box>

      {/* Status bar */}
      <StatusBar
        mode={mode}
        cycleInterval={cycleInterval}
        lastCycleTime={lastCycleTime}
      />
    </Box>
  );
};

export default Dashboard;
