/**
 * PositionsPanel
 *
 * Displays portfolio positions in a kanban-style view grouped by domain.
 */

import React, { useState, useEffect } from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { usePortfolio } from '../../hooks/usePortfolio.js';
import { Domain, Position } from '../../context/AppContext.js';

const DOMAIN_COLORS: Record<Domain, string> = {
  dlmm: 'blue',
  perps: 'magenta',
  polymarket: 'green',
  spot: 'yellow',
};

const DOMAIN_LABELS: Record<Domain, string> = {
  dlmm: 'DLMM',
  perps: 'PERPS',
  polymarket: 'POLY',
  spot: 'SPOT',
};

interface DomainColumnProps {
  domain: Domain;
  positions: Position[];
  balance: number;
}

const DomainColumn: React.FC<DomainColumnProps> = ({ domain, positions, balance }) => {
  const domainPnl = positions.reduce((sum, p) => sum + p.pnl, 0);
  const domainValue = positions.reduce((sum, p) => sum + p.currentValueUsd, 0);
  const pnlColor = domainPnl >= 0 ? 'green' : 'red';

  return (
    <Box flexDirection="column" width={18} marginRight={1}>
      {/* Column header */}
      <Box
        borderStyle="single"
        borderColor={DOMAIN_COLORS[domain]}
        paddingX={1}
        justifyContent="center"
      >
        <Text bold color={DOMAIN_COLORS[domain]}>{DOMAIN_LABELS[domain]}</Text>
      </Box>

      {/* Domain balance/value */}
      <Box justifyContent="center" marginY={1}>
        <Text color="cyan" bold>${(domainValue || balance).toFixed(0)}</Text>
        {domainPnl !== 0 && (
          <Text color={pnlColor}> {domainPnl >= 0 ? '+' : ''}{domainPnl.toFixed(0)}</Text>
        )}
      </Box>

      {/* Position cards */}
      {positions.length === 0 ? (
        <Box justifyContent="center">
          <Text dimColor>No positions</Text>
        </Box>
      ) : (
        <Box flexDirection="column">
          {positions.slice(0, 3).map((p) => {
            const pnlColor = p.pnl >= 0 ? 'green' : 'red';
            const pnlSign = p.pnl >= 0 ? '+' : '';

            return (
              <Box
                key={p.id}
                flexDirection="column"
                borderStyle="round"
                borderColor="gray"
                paddingX={1}
                marginBottom={1}
              >
                <Text bold>
                  {(p.target || 'Unknown').slice(0, 12)}
                </Text>
                <Box justifyContent="space-between">
                  <Text>${p.currentValueUsd.toFixed(0)}</Text>
                  <Text color={pnlColor}>
                    {pnlSign}{p.pnlPercent.toFixed(0)}%
                  </Text>
                </Box>
              </Box>
            );
          })}
          {positions.length > 3 && (
            <Text dimColor>+{positions.length - 3} more</Text>
          )}
        </Box>
      )}
    </Box>
  );
};

export const PositionsPanel: React.FC = () => {
  const { positions, balances, loading, totalValue, totalPnl } = usePortfolio();
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());
  const [secondsAgo, setSecondsAgo] = useState(0);

  // Track when data updates
  useEffect(() => {
    if (!loading) {
      setLastUpdate(new Date());
    }
  }, [loading, positions]);

  // Update "seconds ago" counter every second
  useEffect(() => {
    const interval = setInterval(() => {
      setSecondsAgo(Math.floor((Date.now() - lastUpdate.getTime()) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [lastUpdate]);

  // Format time ago
  const timeAgo = secondsAgo < 5 ? 'just now' : `${secondsAgo}s ago`;

  // Group positions by domain
  const positionsByDomain: Record<Domain, Position[]> = {
    dlmm: positions.filter(p => p.domain === 'dlmm'),
    perps: positions.filter(p => p.domain === 'perps'),
    polymarket: positions.filter(p => p.domain === 'polymarket'),
    spot: positions.filter(p => p.domain === 'spot'),
  };

  // Get balance by domain
  const getBalance = (domain: Domain): number => {
    const b = balances.find(bal => bal.domain === domain);
    return b?.balance || 0;
  };

  if (loading && positions.length === 0) {
    return (
      <Box>
        <Text color="cyan">
          <Spinner type="dots" />
        </Text>
        <Text> Loading positions...</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      {/* Kanban columns */}
      <Box>
        {(['dlmm', 'perps', 'polymarket', 'spot'] as Domain[]).map(domain => (
          <DomainColumn
            key={domain}
            domain={domain}
            positions={positionsByDomain[domain]}
            balance={getBalance(domain)}
          />
        ))}
      </Box>

      {/* Totals bar */}
      <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
        <Text>Total: </Text>
        <Text color="cyan" bold>
          ${totalValue.toFixed(2)}
        </Text>
        <Text> </Text>
        <Text color={totalPnl >= 0 ? 'green' : 'red'}>
          ({totalPnl >= 0 ? '+' : ''}${totalPnl.toFixed(2)})
        </Text>
        <Text>  </Text>
        <Text dimColor>
          {loading ? '●' : '○'} {timeAgo}
        </Text>
      </Box>
    </Box>
  );
};

export default PositionsPanel;
