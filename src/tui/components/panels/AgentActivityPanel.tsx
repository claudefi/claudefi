/**
 * AgentActivityPanel
 *
 * Shows real-time agent activity across all domains.
 */

import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { useAppContext, Domain, AgentActivity } from '../../context/AppContext.js';
import { AgentChat } from './AgentChat.js';

const DOMAIN_COLORS: Record<Domain, string> = {
  dlmm: 'blue',
  perps: 'magenta',
  polymarket: 'green',
  spot: 'yellow',
};

const PHASE_ICONS: Record<AgentActivity['phase'], string> = {
  idle: '○',
  thinking: '◐',
  deciding: '◑',
  executing: '●',
};

const AgentRow: React.FC<{ agent: AgentActivity }> = ({ agent }) => {
  const isActive = agent.phase !== 'idle';

  return (
    <Box>
      <Box width={12}>
        <Text color={DOMAIN_COLORS[agent.domain]}>
          [{agent.domain.toUpperCase()}]
        </Text>
      </Box>
      <Box width={3}>
        {isActive ? (
          <Text color="cyan">
            <Spinner type="dots" />
          </Text>
        ) : (
          <Text dimColor>{PHASE_ICONS[agent.phase]}</Text>
        )}
      </Box>
      <Box flexGrow={1}>
        {agent.phase === 'idle' ? (
          <Text dimColor>
            {agent.lastAction || 'Waiting...'}
          </Text>
        ) : (
          <Text>
            {agent.phase === 'thinking' && 'Analyzing market data...'}
            {agent.phase === 'deciding' && 'Making decision...'}
            {agent.phase === 'executing' && 'Executing trade...'}
          </Text>
        )}
      </Box>
    </Box>
  );
};

export const AgentActivityPanel: React.FC = () => {
  const { state } = useAppContext();
  const { agents, cycleNumber, lastCycleTime } = state;

  const totalToolCalls = Object.values(agents).reduce(
    (sum, a) => sum + a.toolCalls,
    0
  );

  const activeAgents = Object.values(agents).filter(
    (a) => a.phase !== 'idle'
  ).length;

  return (
    <Box flexDirection="column" height="100%">
      <Box flexDirection="column" flexShrink={0}>
        {/* Agent rows */}
        {Object.values(agents).map((agent) => (
          <AgentRow key={agent.domain} agent={agent} />
        ))}

        {/* Stats */}
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Text dimColor>Cycle: </Text>
            <Text>{cycleNumber}</Text>
            <Text dimColor> | Active: </Text>
            <Text color={activeAgents > 0 ? 'green' : 'gray'}>
              {activeAgents}/4
            </Text>
          </Box>
          <Box>
            <Text dimColor>Tool Calls: </Text>
            <Text>{totalToolCalls}</Text>
            <Text dimColor> this cycle</Text>
          </Box>
        </Box>

        {/* Last decision summary */}
        {Object.values(agents).some((a) => a.lastDecision) && (
          <Box marginTop={1} flexDirection="column">
            <Text dimColor bold>Last Decisions:</Text>
            {Object.values(agents)
              .filter((a) => a.lastDecision)
              .slice(0, 2)
              .map((a) => (
                <Box key={a.domain}>
                  <Text color={DOMAIN_COLORS[a.domain]}>
                    {a.domain}:
                  </Text>
                  <Text> {a.lastDecision?.action} </Text>
                  <Text dimColor>
                    ({((a.lastDecision?.confidence ?? 0) * 100).toFixed(0)}%)
                  </Text>
                </Box>
              ))}
          </Box>
        )}
      </Box>

      <Box marginTop={1} flexGrow={1}>
        <AgentChat />
      </Box>
    </Box>
  );
};

export default AgentActivityPanel;
