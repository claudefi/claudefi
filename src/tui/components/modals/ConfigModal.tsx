/**
 * ConfigModal Component
 *
 * Interactive modal for viewing and editing configuration.
 */

import React, { useState, useCallback } from 'react';
import { Box, Text, useInput } from 'ink';
import { Modal } from './Modal.js';
import { useAppContext, Domain } from '../../context/AppContext.js';
import { formatInterval } from '../../utils/config.js';

export interface ConfigModalProps {
  onClose: () => void;
}

const ALL_DOMAINS: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];

const DOMAIN_LABELS: Record<Domain, string> = {
  dlmm: 'DLMM',
  perps: 'Perps',
  polymarket: 'Polymarket',
  spot: 'Spot',
};

const INTERVAL_OPTIONS = [
  { label: '15m', value: 900000 },
  { label: '30m', value: 1800000 },
  { label: '1h', value: 3600000 },
  { label: '2h', value: 7200000 },
];

type ConfigField = 'mode' | 'interval' | 'domains' | 'confidence' | 'save' | 'cancel';

const FIELDS: ConfigField[] = ['mode', 'interval', 'domains', 'confidence', 'save', 'cancel'];

export const ConfigModal: React.FC<ConfigModalProps> = ({ onClose }) => {
  const { state, dispatch } = useAppContext();

  // Local editable state
  const [mode, setMode] = useState<'paper' | 'live'>(state.mode);
  const [cycleInterval, setCycleInterval] = useState(state.cycleInterval);
  const [activeDomains, setActiveDomains] = useState<Domain[]>([...state.activeDomains]);
  const [confidenceThreshold, setConfidenceThreshold] = useState(state.confidenceThreshold);

  // UI state
  const [focusedField, setFocusedField] = useState<ConfigField>('mode');
  const [domainCursor, setDomainCursor] = useState(0);

  const handleSave = useCallback(() => {
    dispatch({
      type: 'SET_CONFIG',
      config: { mode, cycleInterval, activeDomains, confidenceThreshold },
    });
    dispatch({ type: 'SAVE_CONFIG' });
    onClose();
  }, [dispatch, mode, cycleInterval, activeDomains, confidenceThreshold, onClose]);

  useInput((input, key) => {
    // Navigation
    if (key.upArrow) {
      const idx = FIELDS.indexOf(focusedField);
      if (idx > 0) {
        setFocusedField(FIELDS[idx - 1]);
        setDomainCursor(0);
      }
    } else if (key.downArrow || key.tab) {
      const idx = FIELDS.indexOf(focusedField);
      if (idx < FIELDS.length - 1) {
        setFocusedField(FIELDS[idx + 1]);
        setDomainCursor(0);
      }
    }

    // Field-specific controls
    if (focusedField === 'mode') {
      if (key.leftArrow || key.rightArrow || input === ' ') {
        setMode(mode === 'paper' ? 'live' : 'paper');
      }
    } else if (focusedField === 'interval') {
      const currentIdx = INTERVAL_OPTIONS.findIndex(o => o.value === cycleInterval);
      if (key.leftArrow && currentIdx > 0) {
        setCycleInterval(INTERVAL_OPTIONS[currentIdx - 1].value);
      } else if (key.rightArrow && currentIdx < INTERVAL_OPTIONS.length - 1) {
        setCycleInterval(INTERVAL_OPTIONS[currentIdx + 1].value);
      }
    } else if (focusedField === 'domains') {
      if (key.leftArrow && domainCursor > 0) {
        setDomainCursor(domainCursor - 1);
      } else if (key.rightArrow && domainCursor < ALL_DOMAINS.length - 1) {
        setDomainCursor(domainCursor + 1);
      } else if (input === ' ' || key.return) {
        const domain = ALL_DOMAINS[domainCursor];
        if (activeDomains.includes(domain)) {
          // Don't allow removing the last domain
          if (activeDomains.length > 1) {
            setActiveDomains(activeDomains.filter(d => d !== domain));
          }
        } else {
          setActiveDomains([...activeDomains, domain]);
        }
      }
    } else if (focusedField === 'confidence') {
      if (key.leftArrow) {
        setConfidenceThreshold(Math.max(0.1, confidenceThreshold - 0.1));
      } else if (key.rightArrow) {
        setConfidenceThreshold(Math.min(1, confidenceThreshold + 0.1));
      }
    } else if (focusedField === 'save') {
      if (key.return || input === ' ') {
        handleSave();
      }
    } else if (focusedField === 'cancel') {
      if (key.return || input === ' ') {
        onClose();
      }
    }

    // ESC to close (handled in Modal but backup here)
    if (key.escape) {
      onClose();
    }
  });

  const renderField = (field: ConfigField, isFocused: boolean) => {
    const focusIndicator = isFocused ? '▸ ' : '  ';
    const focusColor = isFocused ? 'cyan' : undefined;

    switch (field) {
      case 'mode':
        return (
          <Box>
            <Text color={focusColor}>{focusIndicator}Trading Mode   </Text>
            <Text
              color={mode === 'paper' ? 'yellow' : 'gray'}
              inverse={isFocused && mode === 'paper'}
            >
              {' PAPER '}
            </Text>
            <Text dimColor> ← → </Text>
            <Text
              color={mode === 'live' ? 'red' : 'gray'}
              inverse={isFocused && mode === 'live'}
            >
              {' LIVE '}
            </Text>
          </Box>
        );

      case 'interval':
        return (
          <Box>
            <Text color={focusColor}>{focusIndicator}Cycle Interval </Text>
            {INTERVAL_OPTIONS.map((opt, i) => (
              <React.Fragment key={opt.label}>
                <Text
                  color={cycleInterval === opt.value ? 'green' : 'gray'}
                  inverse={isFocused && cycleInterval === opt.value}
                >
                  {` ${opt.label} `}
                </Text>
                {i < INTERVAL_OPTIONS.length - 1 && <Text dimColor>│</Text>}
              </React.Fragment>
            ))}
          </Box>
        );

      case 'domains':
        return (
          <Box flexDirection="column">
            <Box>
              <Text color={focusColor}>{focusIndicator}Active Domains </Text>
            </Box>
            <Box marginLeft={3}>
              {ALL_DOMAINS.map((domain, i) => {
                const isActive = activeDomains.includes(domain);
                const isCurrent = isFocused && domainCursor === i;
                return (
                  <Box key={domain} marginRight={1}>
                    <Text
                      color={isActive ? 'green' : 'gray'}
                      inverse={isCurrent}
                    >
                      {isActive ? '[✓]' : '[ ]'} {DOMAIN_LABELS[domain]}
                    </Text>
                  </Box>
                );
              })}
            </Box>
          </Box>
        );

      case 'confidence':
        const barLength = 10;
        const filled = Math.round(confidenceThreshold * barLength);
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);
        return (
          <Box>
            <Text color={focusColor}>{focusIndicator}Confidence     </Text>
            <Text color={isFocused ? 'cyan' : 'gray'}>[{bar}]</Text>
            <Text> {(confidenceThreshold * 100).toFixed(0)}%</Text>
          </Box>
        );

      case 'save':
        return (
          <Box>
            <Text color={focusColor}>{focusIndicator}</Text>
            <Text color={isFocused ? 'green' : 'gray'} inverse={isFocused}>
              {' Save '}
            </Text>
          </Box>
        );

      case 'cancel':
        return (
          <Box>
            <Text color={focusColor}>{focusIndicator}</Text>
            <Text color={isFocused ? 'red' : 'gray'} inverse={isFocused}>
              {' Cancel '}
            </Text>
          </Box>
        );
    }
  };

  return (
    <Modal title="Configuration" onClose={onClose} width={60}>
      <Box flexDirection="column" gap={1}>
        {/* Fields */}
        {renderField('mode', focusedField === 'mode')}
        {renderField('interval', focusedField === 'interval')}
        {renderField('domains', focusedField === 'domains')}
        {renderField('confidence', focusedField === 'confidence')}

        {/* Buttons */}
        <Box marginTop={1} gap={2}>
          {renderField('save', focusedField === 'save')}
          {renderField('cancel', focusedField === 'cancel')}
        </Box>

        {/* Help */}
        <Box marginTop={1} borderStyle="single" borderColor="gray" paddingX={1}>
          <Text dimColor>
            ↑↓ Navigate  ←→ Change  Space/Enter Select  ESC Close
          </Text>
        </Box>
      </Box>
    </Modal>
  );
};

export default ConfigModal;
