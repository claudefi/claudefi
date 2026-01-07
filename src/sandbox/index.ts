/**
 * Sandbox Module
 *
 * Provides sandboxed execution environment for agent-generated strategies.
 */

export {
  strategySandbox,
  StrategySandbox,
  generateStrategyCode,
  executeInSandbox,
  analyzeBacktest,
  generateSampleMarketData,
  type StrategyDefinition,
  type StrategyCode,
  type BacktestResult,
  type SimulatedTrade,
  type MarketDataPoint,
  type ApprovalThresholds,
} from './strategy-runner.js';
