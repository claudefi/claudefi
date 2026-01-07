/**
 * MarketDataPanel
 *
 * Shows live market data from all domains.
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useMarketData } from '../../hooks/useMarketData.js';

const formatNumber = (n: number): string => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
};

export const MarketDataPanel: React.FC = () => {
  const { marketData, loading } = useMarketData();

  if (loading && !marketData) {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Loading market data...</Text>
      </Box>
    );
  }

  if (!marketData) {
    return <Text dimColor>No market data available</Text>;
  }

  return (
    <Box flexDirection="column">
      {/* DLMM Pools */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="blue" bold>DLMM Top Pools:</Text>
        {marketData.dlmm.topPools.slice(0, 2).map((pool, i) => (
          <Box key={i} marginLeft={1}>
            <Box width={12}>
              <Text>{pool.name}</Text>
            </Box>
            <Text color="green">APR: {pool.apr.toFixed(0)}%</Text>
            <Text dimColor> TVL: ${formatNumber(pool.tvl)}</Text>
          </Box>
        ))}
        {marketData.dlmm.topPools.length === 0 && (
          <Box marginLeft={1}><Text dimColor>No data</Text></Box>
        )}
      </Box>

      {/* Perps Prices */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="magenta" bold>Perps:</Text>
        <Box marginLeft={1}>
          {marketData.perps.prices.slice(0, 3).map((p, i) => (
            <Box key={i} marginRight={2}>
              <Text>{p.symbol} </Text>
              <Text color={p.change24h >= 0 ? 'green' : 'red'}>
                {p.change24h >= 0 ? '+' : ''}{p.change24h.toFixed(1)}%
              </Text>
            </Box>
          ))}
          {marketData.perps.prices.length === 0 && (
            <Box><Text dimColor>No data</Text></Box>
          )}
        </Box>
      </Box>

      {/* Polymarket */}
      <Box flexDirection="column" marginBottom={1}>
        <Text color="green" bold>Polymarket:</Text>
        {marketData.polymarket.trending.slice(0, 1).map((m, i) => (
          <Box key={i} marginLeft={1}>
            <Text dimColor>{m.question}</Text>
            <Text> </Text>
            <Text color="cyan">{(m.yesPrice * 100).toFixed(0)}%</Text>
          </Box>
        ))}
        {marketData.polymarket.trending.length === 0 && (
          <Box marginLeft={1}><Text dimColor>No data</Text></Box>
        )}
      </Box>

      {/* Spot Trending */}
      <Box flexDirection="column">
        <Text color="yellow" bold>Spot Trending:</Text>
        <Box marginLeft={1}>
          {marketData.spot.trending.slice(0, 3).map((t, i) => (
            <Box key={i} marginRight={2}>
              <Text>{t.symbol} </Text>
              <Text color={t.change24h >= 0 ? 'green' : 'red'}>
                {t.change24h >= 0 ? '+' : ''}{t.change24h.toFixed(0)}%
              </Text>
            </Box>
          ))}
          {marketData.spot.trending.length === 0 && (
            <Box><Text dimColor>No data</Text></Box>
          )}
        </Box>
      </Box>
    </Box>
  );
};

export default MarketDataPanel;
