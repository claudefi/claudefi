/**
 * Header Component
 *
 * Beautiful modern header for claudefi TUI with live price ticker.
 */

import React from 'react';
import { Box, Text } from 'ink';
import { usePriceTicker, TickerPrice } from '../../hooks/usePriceTicker.js';

export interface HeaderProps {
  mode: 'paper' | 'live';
  version?: string;
  compact?: boolean;
}

const formatPrice = (price: number): string => {
  if (price >= 1000) return `$${(price / 1000).toFixed(1)}k`;
  if (price >= 1) return `$${price.toFixed(2)}`;
  return `$${price.toFixed(4)}`;
};

const formatChange = (change: number): string => {
  const sign = change >= 0 ? '+' : '';
  return `${sign}${change.toFixed(1)}%`;
};

const PriceTicker: React.FC<{ prices: TickerPrice[] }> = ({ prices }) => {
  if (prices.length === 0) {
    return (
      <Box justifyContent="center">
        <Text dimColor>Loading prices...</Text>
      </Box>
    );
  }

  return (
    <Box justifyContent="center">
      <Text dimColor>│ </Text>
      {prices.map((p, i) => (
        <React.Fragment key={p.symbol}>
          <Text color="white" bold>{p.symbol}</Text>
          <Text> </Text>
          <Text color="white">{formatPrice(p.price)}</Text>
          <Text> </Text>
          <Text color={p.change24h >= 0 ? 'green' : 'red'}>
            {formatChange(p.change24h)}
          </Text>
          {i < prices.length - 1 && <Text dimColor> │ </Text>}
        </React.Fragment>
      ))}
      <Text dimColor> │</Text>
    </Box>
  );
};

export const Header: React.FC<HeaderProps> = ({
  mode,
  version = '1.0.0',
  compact = false,
}) => {
  const { prices } = usePriceTicker();
  const modeColor = mode === 'paper' ? 'yellow' : 'red';
  const modeLabel = mode === 'paper' ? 'PAPER' : 'LIVE';
  const modeIcon = mode === 'paper' ? '◉' : '●';

  if (compact) {
    return (
      <Box flexDirection="column" marginBottom={1}>
        <Box justifyContent="center">
          <Text color="cyan" bold>claudefi</Text>
          <Text dimColor> v{version}</Text>
          <Text dimColor> | </Text>
          <Text color={modeColor} bold>{modeIcon} {modeLabel}</Text>
        </Box>
        <PriceTicker prices={prices} />
      </Box>
    );
  }

  // Pre-built complete lines for reliable rendering
  const w = 64;
  const pad = (text: string, width: number): string => {
    if (text.length >= width) {
      return text.slice(0, width); // Truncate if too long
    }
    const totalPad = width - text.length;
    const left = Math.floor(totalPad / 2);
    const right = totalPad - left;
    return ' '.repeat(left) + text + ' '.repeat(Math.max(0, right));
  };

  const statusText = `v${version}  |  ${modeIcon} ${modeLabel}  |  Powered by Claude Agent SDK`;

  // Build price ticker string
  const tickerText = prices.length > 0
    ? prices.map(p => {
        const changeStr = p.change24h >= 0 ? `+${p.change24h.toFixed(1)}%` : `${p.change24h.toFixed(1)}%`;
        return `${p.symbol} ${formatPrice(p.price)} ${changeStr}`;
      }).join('  │  ')
    : 'Loading prices...';

  // Build complete header string
  const header = [
    '╔' + '═'.repeat(w) + '╗',
    '║' + pad('CLAUDEFI', w) + '║',
    '║' + pad('Autonomous DeFi Trading Agent', w) + '║',
    '║' + '─'.repeat(w) + '║',
    '║' + pad(statusText, w) + '║',
    '╚' + '═'.repeat(w) + '╝',
    pad(tickerText, w + 2),
    '', // Empty line to prevent last line from being dropped
  ].join('\n');

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box justifyContent="center">
        <Text color="cyan">{header}</Text>
      </Box>
    </Box>
  );
};

export default Header;
