/**
 * usePriceTicker Hook
 *
 * Fetches live crypto prices from CoinGecko API for ticker display.
 * Fast polling (10 seconds) for real-time feel.
 */

import { useEffect, useCallback, useState } from 'react';

const POLL_INTERVAL = 10000; // 10 seconds for real-time feel

export interface TickerPrice {
  symbol: string;
  price: number;
  change24h: number;
}

// CoinGecko IDs for major cryptos
const COINS = [
  { id: 'bitcoin', symbol: 'BTC' },
  { id: 'solana', symbol: 'SOL' },
  { id: 'ethereum', symbol: 'ETH' },
  { id: 'ripple', symbol: 'XRP' },
];

export function usePriceTicker() {
  const [prices, setPrices] = useState<TickerPrice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchPrices = useCallback(async () => {
    try {
      const ids = COINS.map(c => c.id).join(',');
      const url = `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`;

      const response = await fetch(url, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      const newPrices: TickerPrice[] = COINS.map(coin => ({
        symbol: coin.symbol,
        price: data[coin.id]?.usd || 0,
        change24h: data[coin.id]?.usd_24h_change || 0,
      }));

      setPrices(newPrices);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      // Don't clear prices on error, keep stale data
      setError(err instanceof Error ? err.message : 'Failed to fetch prices');
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch and polling
  useEffect(() => {
    fetchPrices();

    const interval = setInterval(fetchPrices, POLL_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchPrices]);

  return {
    prices,
    loading,
    error,
    lastUpdate,
    refresh: fetchPrices,
  };
}

export default usePriceTicker;
