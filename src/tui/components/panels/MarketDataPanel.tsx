/**
 * MarketDataPanel
 *
 * Shows live market data from all domains.
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useMarketData } from '../../hooks/useMarketData.js';

const formatCompactUsd = (value: number): string => {
  if (value >= 1_000_000_000) return `$${(value / 1_000_000_000).toFixed(1)}B`;
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${value.toFixed(0)}`;
};

const formatPrice = (value: number): string => {
  if (value >= 1000) {
    return `$${value.toLocaleString('en-US', { maximumFractionDigits: 0 })}`;
  }
  return `$${value.toFixed(2)}`;
};

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0.0%';
  }
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}%`;
};

const Card: React.FC<{ title: string; color: string; children: React.ReactNode; accent?: string }> = ({
  title,
  color,
  children,
  accent,
}) => (
  <Box
    flexDirection="column"
    borderStyle="round"
    borderColor={accent ?? color}
    paddingX={1}
    paddingY={0}
    flexGrow={1}
    minHeight={5}
  >
    <Text color={color} bold>
      {title}
    </Text>
    {children}
  </Box>
);

const Row: React.FC<{
  primary: string;
  secondary?: string;
  tertiary?: string;
  secondaryColor?: string;
  tertiaryColor?: string;
}> = ({ primary, secondary, tertiary, secondaryColor, tertiaryColor }) => (
  <Box justifyContent="space-between" width="100%">
    <Box flexBasis="50%">
      <Text>{primary}</Text>
    </Box>
    {secondary && (
      <Box flexBasis="25%" justifyContent="flex-end">
        <Text color={secondaryColor}>{secondary}</Text>
      </Box>
    )}
    {tertiary && (
      <Box flexBasis="25%" justifyContent="flex-end">
        <Text color={tertiaryColor}>{tertiary}</Text>
      </Box>
    )}
  </Box>
);

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
      <Box flexDirection="row" marginBottom={1}>
        <Box flexGrow={1} marginRight={1}>
          <Card title="DLMM Yield Heatmap" color="blue">
            {marketData.dlmm.topPools.length === 0 ? (
              <Text dimColor>No Meteora pools online</Text>
            ) : (
              marketData.dlmm.topPools.slice(0, 2).map((pool, index) => {
                const name = pool.name.length > 12 ? pool.name.slice(0, 12) + '...' : pool.name;
                return (
                  <Row
                    key={pool.name}
                    primary={`${index + 1}. ${name}`}
                    secondary={`${pool.apr.toFixed(0)}% APR`}
                    tertiary={formatCompactUsd(pool.tvl)}
                    secondaryColor="green"
                    tertiaryColor="gray"
                  />
                );
              })
            )}
          </Card>
        </Box>
        <Box flexGrow={1}>
          <Card title="Perps Pulse" color="magenta">
            {marketData.perps.prices.length === 0 ? (
              <Text dimColor>No Hyperliquid quotes</Text>
            ) : (
              marketData.perps.prices.slice(0, 3).map((asset) => (
                <Row
                  key={asset.symbol}
                  primary={asset.symbol}
                  secondary={formatPrice(asset.price)}
                  tertiary={formatPercent(asset.change24h)}
                  secondaryColor="white"
                  tertiaryColor={asset.change24h >= 0 ? 'green' : 'red'}
                />
              ))
            )}
          </Card>
        </Box>
      </Box>

      <Box flexDirection="row">
        <Box flexGrow={1} marginRight={1}>
          <Card title="Spot Flows" color="yellow">
            {marketData.spot.trending.length === 0 ? (
              <Text dimColor>No GeckoTerminal movers</Text>
            ) : (
              marketData.spot.trending.slice(0, 3).map((token) => {
                const symbol = token.symbol.length > 10 ? token.symbol.slice(0, 10) + '...' : token.symbol;
                return (
                  <Row
                    key={token.symbol}
                    primary={symbol}
                    secondary={formatPercent(token.change24h)}
                    tertiary={formatCompactUsd(token.volume24h)}
                    secondaryColor={token.change24h >= 0 ? 'green' : 'red'}
                    tertiaryColor="gray"
                  />
                );
              })
            )}
          </Card>
        </Box>
        <Box flexGrow={1}>
          <Card title="Polymarket Consensus" color="green">
            {marketData.polymarket.trending.length === 0 ? (
              <Text dimColor>No markets highlighted</Text>
            ) : (
              marketData.polymarket.trending.slice(0, 2).map((market) => (
                <Row
                  key={market.question}
                  primary={market.question.length > 30 ? market.question.slice(0, 30) + '...' : market.question}
                  secondary={`Yes ${formatPercent(market.yesPrice * 100)}`}
                  secondaryColor="cyan"
                />
              ))
            )}
          </Card>
        </Box>
      </Box>

      <Box marginTop={1}>
        <Text dimColor>Data: Meteora · Hyperliquid · Polymarket · GeckoTerminal (refreshes every 15s)</Text>
      </Box>
    </Box>
  );
};

export default MarketDataPanel;
