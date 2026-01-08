/**
 * useInitialization Hook
 *
 * Runs the initialization sequence on app startup.
 * Updates progress as each step completes.
 */

import { useEffect, useRef } from 'react';
import { useAppContext, InitProgress } from '../context/AppContext.js';

const READY_DELAY = 500; // ms to show "Ready!" before transitioning

export function useInitialization() {
  const { state, dispatch } = useAppContext();
  const hasStarted = useRef(false);

  useEffect(() => {
    // Only run once
    if (hasStarted.current || state.appPhase !== 'loading') {
      return;
    }
    hasStarted.current = true;

    const runInit = async () => {
      // Step 1: Config (already loaded synchronously, just show it)
      dispatch({ type: 'SET_INIT_STEP', step: 'config', status: 'loading' });
      await delay(300);
      dispatch({ type: 'SET_INIT_STEP', step: 'config', status: 'done' });

      // Step 2: Database connection
      dispatch({ type: 'SET_INIT_STEP', step: 'database', status: 'loading' });
      try {
        const { testConnection } = await import('../../db/index.js');
        await testConnection();
        dispatch({ type: 'SET_INIT_STEP', step: 'database', status: 'done' });
      } catch {
        dispatch({ type: 'SET_INIT_STEP', step: 'database', status: 'error' });
        // Continue anyway - show error but don't block
      }

      // Step 3: Portfolio
      dispatch({ type: 'SET_INIT_STEP', step: 'portfolio', status: 'loading' });
      try {
        const { getOpenPositions, getDomainBalance } = await import('../../db/index.js');
        const domains = ['dlmm', 'perps', 'polymarket', 'spot'] as const;

        for (const domain of domains) {
          await getOpenPositions(domain);
          await getDomainBalance(domain);
        }
        dispatch({ type: 'SET_INIT_STEP', step: 'portfolio', status: 'done' });
      } catch {
        dispatch({ type: 'SET_INIT_STEP', step: 'portfolio', status: 'error' });
      }

      // Step 4: Skills
      dispatch({ type: 'SET_INIT_STEP', step: 'skills', status: 'loading' });
      try {
        const { listSkills } = await import('../../skills/reflection-creator.js');
        await listSkills();
        dispatch({ type: 'SET_INIT_STEP', step: 'skills', status: 'done' });
      } catch {
        dispatch({ type: 'SET_INIT_STEP', step: 'skills', status: 'error' });
      }

      // Step 5: Market Data
      dispatch({ type: 'SET_INIT_STEP', step: 'market', status: 'loading' });
      try {
        // Try to fetch from each source (don't fail if one fails)
        const fetches = [];

        try {
          const { meteoraClient } = await import('../../clients/meteora/client.js');
          fetches.push(meteoraClient.getTopPools(3));
        } catch { /* ignore */ }

        try {
          const { hyperliquidClient } = await import('../../clients/hyperliquid/client.js');
          fetches.push(hyperliquidClient.getMarkets());
        } catch { /* ignore */ }

        try {
          const { gammaClient } = await import('../../clients/polymarket/client.js');
          fetches.push(gammaClient.getTrendingMarkets(3));
        } catch { /* ignore */ }

        try {
          const { geckoTerminalClient } = await import('../../clients/geckoterminal/client.js');
          fetches.push(geckoTerminalClient.getTrendingPools(3));
        } catch { /* ignore */ }

        await Promise.allSettled(fetches);
        dispatch({ type: 'SET_INIT_STEP', step: 'market', status: 'done' });
      } catch {
        dispatch({ type: 'SET_INIT_STEP', step: 'market', status: 'error' });
      }

      // All done - show "Ready!" briefly
      dispatch({ type: 'SET_APP_PHASE', phase: 'ready' });

      // Transition to running after brief delay
      await delay(READY_DELAY);
      dispatch({ type: 'SET_APP_PHASE', phase: 'running' });
    };

    runInit();
  }, [state.appPhase, dispatch]);

  return {
    isLoading: state.appPhase === 'loading',
    isReady: state.appPhase === 'ready',
    isRunning: state.appPhase === 'running',
    progress: state.initProgress,
  };
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export default useInitialization;
