/**
 * usePortfolio Hook
 *
 * Polls portfolio data (positions and balances) from the database.
 */

import { useEffect, useCallback, useState } from 'react';
import { useAppContext, Domain, Position, DomainBalance } from '../context/AppContext.js';

const POLL_INTERVAL = 5000; // 5 seconds

export function usePortfolio() {
  const { state, dispatch } = useAppContext();
  const [error, setError] = useState<string | null>(null);

  const fetchPortfolio = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', key: 'positions', loading: true });

    try {
      // Dynamic import to avoid issues at startup
      const { getOpenPositions, getDomainBalance } = await import('../../db/index.js');

      // Fetch positions for all domains
      const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
      const allPositions: Position[] = [];
      const balances: DomainBalance[] = [];

      for (const domain of domains) {
        // Get positions
        const positions = await getOpenPositions(domain);
        for (const p of positions) {
          // Use actual values from database
          const currentValueUsd = p.currentValueUsd;
          const pnl = currentValueUsd - p.entryValueUsd;
          const pnlPercent = p.entryValueUsd > 0 ? (pnl / p.entryValueUsd) * 100 : 0;

          allPositions.push({
            id: p.id,
            domain: p.domain as Domain,
            target: p.target,
            entryValueUsd: p.entryValueUsd,
            currentValueUsd,
            pnl,
            pnlPercent,
            openedAt: new Date(p.openedAt),
            metadata: p.metadata as Record<string, unknown>,
          });
        }

        // Get balance
        const balance = await getDomainBalance(domain);
        balances.push({ domain, balance });
      }

      dispatch({ type: 'SET_POSITIONS', positions: allPositions });
      dispatch({ type: 'SET_BALANCES', balances });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch portfolio');
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'positions', loading: false });
    }
  }, [dispatch]);

  // Initial fetch and polling
  useEffect(() => {
    fetchPortfolio();

    const interval = setInterval(fetchPortfolio, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPortfolio]);

  // Refresh on trigger
  useEffect(() => {
    if (state.refreshTrigger > 0) {
      fetchPortfolio();
    }
  }, [state.refreshTrigger, fetchPortfolio]);

  // Computed values
  const totalValue = state.balances.reduce((sum, b) => sum + b.balance, 0) +
    state.positions.reduce((sum, p) => sum + p.currentValueUsd, 0);

  const totalPnl = state.positions.reduce((sum, p) => sum + p.pnl, 0);

  const positionsByDomain = state.positions.reduce((acc, p) => {
    if (!acc[p.domain]) acc[p.domain] = [];
    acc[p.domain].push(p);
    return acc;
  }, {} as Record<Domain, Position[]>);

  return {
    positions: state.positions,
    balances: state.balances,
    loading: state.loading.positions,
    error,
    totalValue,
    totalPnl,
    positionsByDomain,
    refresh: fetchPortfolio,
  };
}

export default usePortfolio;
