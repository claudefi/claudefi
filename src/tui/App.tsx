/**
 * Main TUI App Component
 *
 * The root component that renders the dashboard with all panels.
 */

import React, { useState, useCallback } from 'react';
import { Box } from 'ink';
import { AppProvider, useAppContext } from './context/AppContext.js';
import { Header } from './components/layout/Header.js';
import { Dashboard } from './components/layout/Dashboard.js';
import { PositionsPanel } from './components/panels/PositionsPanel.js';
import { AgentActivityPanel } from './components/panels/AgentActivityPanel.js';
import { SkillsPanel } from './components/panels/SkillsPanel.js';
import { MarketDataPanel } from './components/panels/MarketDataPanel.js';
import { ConfigModal } from './components/modals/ConfigModal.js';
import { SkillsModal } from './components/modals/SkillsModal.js';
import { HelpModal } from './components/modals/HelpModal.js';

// Inner app component that uses context
const AppInner: React.FC = () => {
  const { state, dispatch } = useAppContext();
  const [focusedPanel, setFocusedPanel] = useState(1);

  const handlePanelFocus = useCallback((panel: number) => {
    setFocusedPanel(panel);
    dispatch({ type: 'SET_FOCUSED_PANEL', panel });
  }, [dispatch]);

  const handleOpenConfig = useCallback(() => {
    dispatch({ type: 'OPEN_MODAL', modal: 'config' });
  }, [dispatch]);

  const handleOpenSkills = useCallback(() => {
    dispatch({ type: 'OPEN_MODAL', modal: 'skills' });
  }, [dispatch]);

  const handleOpenHelp = useCallback(() => {
    dispatch({ type: 'OPEN_MODAL', modal: 'help' });
  }, [dispatch]);

  const handleCloseModal = useCallback(() => {
    dispatch({ type: 'CLOSE_MODAL' });
  }, [dispatch]);

  return (
    <Box flexDirection="column" width="100%" height="100%">
      {/* Header with logo */}
      <Header mode={state.mode} version="1.0.0" />

      <Dashboard
        focusedPanel={focusedPanel}
        onPanelFocus={handlePanelFocus}
        mode={state.mode}
        cycleInterval={state.cycleInterval}
        lastCycleTime={state.lastCycleTime}
        onOpenConfig={handleOpenConfig}
        onOpenSkills={handleOpenSkills}
        onOpenHelp={handleOpenHelp}
        children={{
          positions: <PositionsPanel />,
          agents: <AgentActivityPanel />,
          skills: <SkillsPanel />,
          market: <MarketDataPanel />,
        }}
      />

      {/* Modals */}
      {state.modalOpen === 'config' && <ConfigModal onClose={handleCloseModal} />}
      {state.modalOpen === 'skills' && <SkillsModal onClose={handleCloseModal} />}
      {state.modalOpen === 'help' && <HelpModal onClose={handleCloseModal} />}
    </Box>
  );
};

// Main App with provider
export const App: React.FC = () => {
  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
};

export default App;
