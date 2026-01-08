/**
 * useMarketData Hook
 *
 * Fetches market data from various sources.
 */

import { useEffect, useCallback, useState } from 'react';
import { useAppContext, MarketData } from '../context/AppContext.js';

const POLL_INTERVAL = 15000; // 15 seconds for more real-time feel

export function useMarketData() {
  const { state, dispatch } = useAppContext();
  const [error, setError] = useState<string | null>(null);

  const fetchMarketData = useCallback(async () => {
    dispatch({ type: 'SET_LOADING', key: 'market', loading: true });

    try {
      // Fetch data from each domain's client
      const marketData: MarketData = {
        dlmm: { topPools: [] },
        perps: { prices: [] },
        polymarket: { trending: [] },
        spot: { trending: [] },
      };

      // DLMM pools
      try {
        const { meteoraClient } = await import('../../clients/meteora/client.js');
        const pools = await meteoraClient.getTopPools(5);
        marketData.dlmm.topPools = pools.map(p => ({
          name: p.name,
          apr: p.apr || 0,
          tvl: parseFloat(p.liquidity) || 0,
        }));
      } catch {
        // Ignore errors, use empty data
      }

      // Perps prices
      try {
        const { hyperliquidClient } = await import('../../clients/hyperliquid/client.js');
        const markets = await hyperliquidClient.getMarkets();
        marketData.perps.prices = markets.slice(0, 5).map(m => ({
          symbol: m.name,
          price: m.markPrice,
          change24h: 0, // Not available in API
        }));
      } catch {
        // Ignore errors, use empty data
      }

      // Polymarket trending
      try {
        const { gammaClient } = await import('../../clients/polymarket/client.js');
        const markets = await gammaClient.getTrendingMarkets(5);
        marketData.polymarket.trending = markets.map(m => {
          const prices = gammaClient.getMarketPrices(m);
          return {
            question: m.question.slice(0, 50) + (m.question.length > 50 ? '...' : ''),
            yesPrice: prices.yesPrice,
          };
        });
      } catch {
        // Ignore errors, use empty data
      }

      // Spot trending
      try {
        const { geckoTerminalClient } = await import('../../clients/geckoterminal/client.js');
        const tokens = await geckoTerminalClient.getTrendingPools(5);
        marketData.spot.trending = tokens.map(t => ({
          symbol: t.symbol,
          volume24h: t.volume24h,
          change24h: t.priceChange24h,
        }));
      } catch {
        // Ignore errors, use empty data
      }

      dispatch({ type: 'SET_MARKET_DATA', data: marketData });
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch market data');
    } finally {
      dispatch({ type: 'SET_LOADING', key: 'market', loading: false });
    }
  }, [dispatch]);

  // Initial fetch and polling
  useEffect(() => {
    fetchMarketData();

    const interval = setInterval(fetchMarketData, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchMarketData]);

  // Refresh on trigger
  useEffect(() => {
    if (state.refreshTrigger > 0) {
      fetchMarketData();
    }
  }, [state.refreshTrigger, fetchMarketData]);

  return {
    marketData: state.marketData,
    loading: state.loading.market,
    error,
    refresh: fetchMarketData,
  };
}

export default useMarketData;
