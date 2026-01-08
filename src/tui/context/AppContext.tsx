/**
 * AppContext
 *
 * Global state management for the TUI using React Context + useReducer.
 */

import React, { createContext, useContext, useReducer, ReactNode, useMemo } from 'react';
import { loadConfig, saveConfig, TuiConfig } from '../utils/config.js';

// Types
export type Domain = 'dlmm' | 'perps' | 'polymarket' | 'spot';

export interface Position {
  id: string;
  domain: Domain;
  target: string;
  entryValueUsd: number;
  currentValueUsd: number;
  pnl: number;
  pnlPercent: number;
  openedAt: Date;
  metadata: Record<string, unknown>;
}

export interface DomainBalance {
  domain: Domain;
  balance: number;
}

export interface AgentActivity {
  domain: Domain;
  phase: 'idle' | 'thinking' | 'deciding' | 'executing';
  lastAction?: string;
  thinkingBudgetUsed?: number;
  thinkingBudgetTotal?: number;
  toolCalls: number;
  lastDecision?: {
    action: string;
    target: string;
    confidence: number;
    reasoning: string;
  };
}

export interface Skill {
  id: string;
  name: string;
  domain: Domain;
  effectiveness: number;
  usageCount: number;
  lastUsed?: Date;
  content: string;
}

export interface JudgeFeedback {
  id: string;
  domain: Domain;
  decisionId: string;
  rating: 'good' | 'bad' | 'neutral';
  feedback: string;
  createdAt: Date;
}

export interface MarketData {
  dlmm: {
    topPools: Array<{ name: string; apr: number; tvl: number }>;
  };
  perps: {
    prices: Array<{ symbol: string; price: number; change24h: number }>;
  };
  polymarket: {
    trending: Array<{ question: string; yesPrice: number }>;
  };
  spot: {
    trending: Array<{ symbol: string; volume24h: number; change24h: number }>;
  };
}

export type InitStepStatus = 'pending' | 'loading' | 'done' | 'error';

export interface InitProgress {
  config: InitStepStatus;
  database: InitStepStatus;
  portfolio: InitStepStatus;
  skills: InitStepStatus;
  market: InitStepStatus;
}

export interface AppState {
  // App phase
  appPhase: 'loading' | 'ready' | 'running';
  initProgress: InitProgress;

  // UI State
  focusedPanel: number;
  modalOpen: 'config' | 'skills' | 'help' | 'onboarding' | null;
  selectedSkillId: string | null;
  inputCapture: 'chat' | null;

  // Config
  mode: 'paper' | 'live';
  cycleInterval: number;
  activeDomains: Domain[];
  confidenceThreshold: number;

  // Data
  positions: Position[];
  balances: DomainBalance[];
  agents: Record<Domain, AgentActivity>;
  skills: Skill[];
  judgeFeedback: JudgeFeedback[];
  marketData: MarketData | null;

  // Timing
  lastCycleTime?: Date;
  cycleNumber: number;

  // Refresh trigger - increment to force all hooks to refetch
  refreshTrigger: number;

  // Loading states
  loading: {
    positions: boolean;
    skills: boolean;
    market: boolean;
  };
}

// Actions
export type AppAction =
  | { type: 'SET_FOCUSED_PANEL'; panel: number }
  | { type: 'OPEN_MODAL'; modal: AppState['modalOpen'] }
  | { type: 'CLOSE_MODAL' }
  | { type: 'SELECT_SKILL'; skillId: string | null }
  | { type: 'SET_POSITIONS'; positions: Position[] }
  | { type: 'SET_BALANCES'; balances: DomainBalance[] }
  | { type: 'SET_AGENT_ACTIVITY'; domain: Domain; activity: Partial<AgentActivity> }
  | { type: 'SET_SKILLS'; skills: Skill[] }
  | { type: 'SET_JUDGE_FEEDBACK'; feedback: JudgeFeedback[] }
  | { type: 'SET_MARKET_DATA'; data: MarketData }
  | { type: 'CYCLE_START'; timestamp: Date }
  | { type: 'CYCLE_END' }
  | { type: 'SET_CONFIG'; config: Partial<Pick<AppState, 'mode' | 'cycleInterval' | 'activeDomains' | 'confidenceThreshold'>> }
  | { type: 'SAVE_CONFIG' }
  | { type: 'TRIGGER_REFRESH' }
  | { type: 'SET_LOADING'; key: keyof AppState['loading']; loading: boolean }
  | { type: 'SET_APP_PHASE'; phase: AppState['appPhase'] }
  | { type: 'SET_INIT_STEP'; step: keyof InitProgress; status: InitStepStatus }
  | { type: 'SET_INPUT_CAPTURE'; capture: AppState['inputCapture'] };

// Initial state
const initialAgentActivity: AgentActivity = {
  domain: 'dlmm',
  phase: 'idle',
  toolCalls: 0,
};

// Load config from file on startup
const loadedConfig = loadConfig();

export const initialState: AppState = {
  // Start in loading phase
  appPhase: 'loading',
  initProgress: {
    config: 'pending',
    database: 'pending',
    portfolio: 'pending',
    skills: 'pending',
    market: 'pending',
  },

  focusedPanel: 1,
  modalOpen: null,
  selectedSkillId: null,
  inputCapture: null,

  // Use loaded config values
  mode: loadedConfig.mode,
  cycleInterval: loadedConfig.cycleInterval,
  activeDomains: loadedConfig.activeDomains,
  confidenceThreshold: loadedConfig.confidenceThreshold,

  positions: [],
  balances: [],
  agents: {
    dlmm: { ...initialAgentActivity, domain: 'dlmm' },
    perps: { ...initialAgentActivity, domain: 'perps' },
    polymarket: { ...initialAgentActivity, domain: 'polymarket' },
    spot: { ...initialAgentActivity, domain: 'spot' },
  },
  skills: [],
  judgeFeedback: [],
  marketData: null,

  cycleNumber: 0,

  refreshTrigger: 0,

  loading: {
    positions: false,
    skills: false,
    market: false,
  },
};

// Reducer
export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case 'SET_FOCUSED_PANEL':
      return { ...state, focusedPanel: action.panel };

    case 'OPEN_MODAL':
      return { ...state, modalOpen: action.modal };

    case 'CLOSE_MODAL':
      return { ...state, modalOpen: null };

    case 'SELECT_SKILL':
      return { ...state, selectedSkillId: action.skillId };

    case 'SET_POSITIONS':
      return { ...state, positions: action.positions };

    case 'SET_BALANCES':
      return { ...state, balances: action.balances };

    case 'SET_AGENT_ACTIVITY':
      return {
        ...state,
        agents: {
          ...state.agents,
          [action.domain]: {
            ...state.agents[action.domain],
            ...action.activity,
          },
        },
      };

    case 'SET_SKILLS':
      return { ...state, skills: action.skills };

    case 'SET_JUDGE_FEEDBACK':
      return { ...state, judgeFeedback: action.feedback };

    case 'SET_MARKET_DATA':
      return { ...state, marketData: action.data };

    case 'CYCLE_START':
      return {
        ...state,
        lastCycleTime: action.timestamp,
        cycleNumber: state.cycleNumber + 1,
      };

    case 'CYCLE_END':
      // Reset agent phases to idle
      return {
        ...state,
        agents: Object.fromEntries(
          Object.entries(state.agents).map(([domain, agent]) => [
            domain,
            { ...agent, phase: 'idle' as const },
          ])
        ) as Record<Domain, AgentActivity>,
      };

    case 'SET_CONFIG':
      return { ...state, ...action.config };

    case 'SAVE_CONFIG':
      // Save current config state to file
      saveConfig({
        mode: state.mode,
        cycleInterval: state.cycleInterval,
        activeDomains: state.activeDomains,
        confidenceThreshold: state.confidenceThreshold,
      });
      return state;

    case 'TRIGGER_REFRESH':
      return { ...state, refreshTrigger: state.refreshTrigger + 1 };

    case 'SET_LOADING':
      return {
        ...state,
        loading: { ...state.loading, [action.key]: action.loading },
      };

    case 'SET_APP_PHASE':
      return { ...state, appPhase: action.phase };

    case 'SET_INIT_STEP':
      return {
        ...state,
        initProgress: { ...state.initProgress, [action.step]: action.status },
      };

    case 'SET_INPUT_CAPTURE':
      return { ...state, inputCapture: action.capture };

    default:
      return state;
  }
}

// Context
const AppContext = createContext<{
  state: AppState;
  dispatch: React.Dispatch<AppAction>;
} | null>(null);

// Provider
export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [state, dispatch] = useReducer(appReducer, initialState);

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  );
};

// Hook
export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within an AppProvider');
  }
  return context;
}

export default AppContext;
