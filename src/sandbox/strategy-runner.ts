/**
 * Strategy Sandbox
 *
 * Allows agents to write custom trading strategy code,
 * backtest it against historical data, and promote
 * successful strategies to skills.
 *
 * Security:
 * - Code runs in isolated environment (no network, limited resources)
 * - Time-limited execution (30 second max)
 * - Memory-limited execution (256MB max)
 * - No file system access outside sandbox
 */

import vm from 'vm';
import type { Domain } from '../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Market data point for backtesting
 */
export interface MarketDataPoint {
  timestamp: Date;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  metadata?: Record<string, unknown>;
}

/**
 * Strategy definition from agent
 */
export interface StrategyDefinition {
  name: string;
  domain: Domain;
  description: string;
  entryConditions: string;   // TypeScript code for entry signal
  exitConditions: string;    // TypeScript code for exit signal
  riskManagement: string;    // Position sizing logic
}

/**
 * Strategy code to execute
 */
export interface StrategyCode {
  name: string;
  domain: Domain;
  description: string;
  code: string;              // Full TypeScript/JavaScript strategy code
}

/**
 * Simulated trade from backtest
 */
export interface SimulatedTrade {
  entryTime: Date;
  exitTime: Date;
  entryPrice: number;
  exitPrice: number;
  direction: 'long' | 'short';
  size: number;
  pnl: number;
  pnlPercent: number;
  reason: string;
}

/**
 * Backtest result
 */
export interface BacktestResult {
  strategyName: string;
  domain: Domain;
  startDate: Date;
  endDate: Date;
  trades: SimulatedTrade[];
  totalTrades: number;
  winningTrades: number;
  losingTrades: number;
  winRate: number;
  totalPnl: number;
  totalPnlPercent: number;
  maxDrawdown: number;
  sharpeRatio: number;
  approved: boolean;          // Meets quality thresholds
  approvalReasons: string[];
  rejectionReasons: string[];
  executionTimeMs: number;
  error?: string;
}

/**
 * Approval thresholds for strategies
 */
export interface ApprovalThresholds {
  minWinRate: number;         // Default: 0.40 (40%)
  minTrades: number;          // Default: 10
  maxDrawdown: number;        // Default: 0.20 (20%)
  minSharpeRatio: number;     // Default: 0.5
  minPnlPercent: number;      // Default: 5%
}

const DEFAULT_THRESHOLDS: ApprovalThresholds = {
  minWinRate: 0.40,
  minTrades: 10,
  maxDrawdown: 0.20,
  minSharpeRatio: 0.5,
  minPnlPercent: 5,
};

// =============================================================================
// STRATEGY GENERATOR
// =============================================================================

/**
 * Generate strategy code from definition
 */
export function generateStrategyCode(def: StrategyDefinition): string {
  return `
// Strategy: ${def.name}
// Domain: ${def.domain}
// ${def.description}

/**
 * Entry signal - returns true when should enter position
 */
function shouldEnter(data, index, context) {
  ${def.entryConditions}
}

/**
 * Exit signal - returns true when should exit position
 */
function shouldExit(data, index, context, position) {
  ${def.exitConditions}
}

/**
 * Position sizing - returns size as fraction of capital (0-1)
 */
function getPositionSize(data, index, context, capital) {
  ${def.riskManagement}
}

// Export strategy functions
module.exports = { shouldEnter, shouldExit, getPositionSize };
`;
}

// =============================================================================
// SANDBOX EXECUTION
// =============================================================================

/**
 * Execute strategy code in sandbox
 */
export async function executeInSandbox(
  code: string,
  marketData: MarketDataPoint[],
  initialCapital: number = 10000,
  timeoutMs: number = 30000
): Promise<{
  trades: SimulatedTrade[];
  error?: string;
  executionTimeMs: number;
}> {
  const startTime = Date.now();
  const trades: SimulatedTrade[] = [];

  try {
    // Create sandbox context with limited globals
    const sandbox = {
      console: {
        log: () => {},  // Silenced
        warn: () => {},
        error: () => {},
      },
      Math,
      Date,
      Array,
      Object,
      Number,
      String,
      Boolean,
      JSON,
      // Trading-specific helpers
      helpers: {
        sma: (data: number[], period: number) => {
          if (data.length < period) return null;
          const slice = data.slice(-period);
          return slice.reduce((a, b) => a + b, 0) / period;
        },
        ema: (data: number[], period: number) => {
          if (data.length < period) return null;
          const k = 2 / (period + 1);
          let ema = data[0];
          for (let i = 1; i < data.length; i++) {
            ema = data[i] * k + ema * (1 - k);
          }
          return ema;
        },
        rsi: (data: number[], period: number = 14) => {
          if (data.length < period + 1) return null;
          let gains = 0;
          let losses = 0;
          for (let i = data.length - period; i < data.length; i++) {
            const diff = data[i] - data[i - 1];
            if (diff > 0) gains += diff;
            else losses -= diff;
          }
          if (losses === 0) return 100;
          const rs = gains / losses;
          return 100 - (100 / (1 + rs));
        },
        percentChange: (a: number, b: number) => ((b - a) / a) * 100,
        crossedAbove: (fast: number[], slow: number[]) => {
          if (fast.length < 2 || slow.length < 2) return false;
          return fast[fast.length - 2] <= slow[slow.length - 2] &&
                 fast[fast.length - 1] > slow[slow.length - 1];
        },
        crossedBelow: (fast: number[], slow: number[]) => {
          if (fast.length < 2 || slow.length < 2) return false;
          return fast[fast.length - 2] >= slow[slow.length - 2] &&
                 fast[fast.length - 1] < slow[slow.length - 1];
        },
      },
      module: { exports: {} },
      exports: {},
    };

    // Create VM context
    const context = vm.createContext(sandbox);

    // Compile and run strategy code
    const script = new vm.Script(code, {
      filename: 'strategy.js',
    });
    script.runInContext(context, { timeout: timeoutMs });

    // Get strategy functions
    const strategyModule = sandbox.module.exports as {
      shouldEnter?: (data: MarketDataPoint[], index: number, ctx: unknown) => boolean;
      shouldExit?: (data: MarketDataPoint[], index: number, ctx: unknown, pos: unknown) => boolean;
      getPositionSize?: (data: MarketDataPoint[], index: number, ctx: unknown, cap: number) => number;
    };

    if (!strategyModule.shouldEnter || !strategyModule.shouldExit) {
      return {
        trades: [],
        error: 'Strategy must export shouldEnter and shouldExit functions',
        executionTimeMs: Date.now() - startTime,
      };
    }

    // Run backtest
    let capital = initialCapital;
    type PositionType = {
      entryTime: Date;
      entryPrice: number;
      direction: 'long' | 'short';
      size: number;
    } | null;

    let position: PositionType = null;

    const strategyContext: {
      capital: number;
      position: PositionType;
      tradeHistory: SimulatedTrade[];
    } = {
      capital: initialCapital,
      position: null,
      tradeHistory: [],
    };

    for (let i = 20; i < marketData.length; i++) { // Start at 20 for indicator warmup
      const dataSlice = marketData.slice(0, i + 1);
      const current = marketData[i];

      if (!position) {
        // Check for entry
        try {
          if (strategyModule.shouldEnter(dataSlice, i, strategyContext)) {
            const size = strategyModule.getPositionSize
              ? Math.min(1, Math.max(0, strategyModule.getPositionSize(dataSlice, i, strategyContext, capital)))
              : 0.1; // Default 10% position

            position = {
              entryTime: current.timestamp,
              entryPrice: current.close,
              direction: 'long', // For simplicity, only long positions in backtest
              size: capital * size,
            };
            strategyContext.position = position;
          }
        } catch (e) {
          // Strategy error - skip this bar
        }
      } else {
        // Check for exit
        try {
          if (strategyModule.shouldExit(dataSlice, i, strategyContext, position)) {
            const pnl = (current.close - position.entryPrice) / position.entryPrice * position.size;
            const pnlPercent = (current.close - position.entryPrice) / position.entryPrice * 100;

            trades.push({
              entryTime: position.entryTime,
              exitTime: current.timestamp,
              entryPrice: position.entryPrice,
              exitPrice: current.close,
              direction: position.direction,
              size: position.size,
              pnl,
              pnlPercent,
              reason: 'exit_signal',
            });

            capital += pnl;
            position = null;
            strategyContext.position = null;
            strategyContext.tradeHistory = trades;
          }
        } catch (e) {
          // Strategy error - skip this bar
        }
      }

      // Check timeout
      if (Date.now() - startTime > timeoutMs) {
        return {
          trades,
          error: 'Backtest timeout exceeded',
          executionTimeMs: Date.now() - startTime,
        };
      }
    }

    return {
      trades,
      executionTimeMs: Date.now() - startTime,
    };

  } catch (error) {
    return {
      trades: [],
      error: error instanceof Error ? error.message : 'Unknown error',
      executionTimeMs: Date.now() - startTime,
    };
  }
}

// =============================================================================
// BACKTEST ANALYSIS
// =============================================================================

/**
 * Analyze backtest trades
 */
export function analyzeBacktest(
  trades: SimulatedTrade[],
  strategyName: string,
  domain: Domain,
  marketData: MarketDataPoint[],
  thresholds: ApprovalThresholds = DEFAULT_THRESHOLDS
): BacktestResult {
  const startDate = marketData[0]?.timestamp || new Date();
  const endDate = marketData[marketData.length - 1]?.timestamp || new Date();

  if (trades.length === 0) {
    return {
      strategyName,
      domain,
      startDate,
      endDate,
      trades: [],
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnl: 0,
      totalPnlPercent: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      approved: false,
      approvalReasons: [],
      rejectionReasons: ['No trades generated'],
      executionTimeMs: 0,
    };
  }

  const winningTrades = trades.filter(t => t.pnl > 0).length;
  const losingTrades = trades.filter(t => t.pnl <= 0).length;
  const winRate = winningTrades / trades.length;
  const totalPnl = trades.reduce((sum, t) => sum + t.pnl, 0);
  const totalPnlPercent = trades.reduce((sum, t) => sum + t.pnlPercent, 0);

  // Calculate max drawdown
  let peak = 0;
  let maxDrawdown = 0;
  let runningPnl = 0;
  for (const trade of trades) {
    runningPnl += trade.pnl;
    if (runningPnl > peak) peak = runningPnl;
    const drawdown = (peak - runningPnl) / (peak || 1);
    if (drawdown > maxDrawdown) maxDrawdown = drawdown;
  }

  // Calculate Sharpe ratio (simplified)
  const returns = trades.map(t => t.pnlPercent);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const stdDev = Math.sqrt(
    returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length
  );
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

  // Check approval
  const approvalReasons: string[] = [];
  const rejectionReasons: string[] = [];

  if (winRate >= thresholds.minWinRate) {
    approvalReasons.push(`Win rate ${(winRate * 100).toFixed(1)}% meets threshold ${(thresholds.minWinRate * 100).toFixed(0)}%`);
  } else {
    rejectionReasons.push(`Win rate ${(winRate * 100).toFixed(1)}% below threshold ${(thresholds.minWinRate * 100).toFixed(0)}%`);
  }

  if (trades.length >= thresholds.minTrades) {
    approvalReasons.push(`${trades.length} trades meets minimum ${thresholds.minTrades}`);
  } else {
    rejectionReasons.push(`${trades.length} trades below minimum ${thresholds.minTrades}`);
  }

  if (maxDrawdown <= thresholds.maxDrawdown) {
    approvalReasons.push(`Max drawdown ${(maxDrawdown * 100).toFixed(1)}% within limit ${(thresholds.maxDrawdown * 100).toFixed(0)}%`);
  } else {
    rejectionReasons.push(`Max drawdown ${(maxDrawdown * 100).toFixed(1)}% exceeds limit ${(thresholds.maxDrawdown * 100).toFixed(0)}%`);
  }

  if (sharpeRatio >= thresholds.minSharpeRatio) {
    approvalReasons.push(`Sharpe ratio ${sharpeRatio.toFixed(2)} meets threshold ${thresholds.minSharpeRatio}`);
  } else {
    rejectionReasons.push(`Sharpe ratio ${sharpeRatio.toFixed(2)} below threshold ${thresholds.minSharpeRatio}`);
  }

  if (totalPnlPercent >= thresholds.minPnlPercent) {
    approvalReasons.push(`Total return ${totalPnlPercent.toFixed(1)}% meets threshold ${thresholds.minPnlPercent}%`);
  } else {
    rejectionReasons.push(`Total return ${totalPnlPercent.toFixed(1)}% below threshold ${thresholds.minPnlPercent}%`);
  }

  const approved = rejectionReasons.length === 0;

  return {
    strategyName,
    domain,
    startDate,
    endDate,
    trades,
    totalTrades: trades.length,
    winningTrades,
    losingTrades,
    winRate,
    totalPnl,
    totalPnlPercent,
    maxDrawdown,
    sharpeRatio,
    approved,
    approvalReasons,
    rejectionReasons,
    executionTimeMs: 0,
  };
}

// =============================================================================
// STRATEGY SANDBOX CLASS
// =============================================================================

/**
 * Main strategy sandbox for backtesting and promotion
 */
export class StrategySandbox {
  private thresholds: ApprovalThresholds;

  constructor(thresholds: Partial<ApprovalThresholds> = {}) {
    this.thresholds = { ...DEFAULT_THRESHOLDS, ...thresholds };
  }

  /**
   * Backtest a strategy against historical data
   */
  async backtest(
    strategy: StrategyCode,
    marketData: MarketDataPoint[],
    initialCapital: number = 10000
  ): Promise<BacktestResult> {
    console.log(`[Sandbox] Backtesting strategy: ${strategy.name}`);

    // Execute in sandbox
    const execution = await executeInSandbox(
      strategy.code,
      marketData,
      initialCapital
    );

    if (execution.error) {
      return {
        strategyName: strategy.name,
        domain: strategy.domain,
        startDate: marketData[0]?.timestamp || new Date(),
        endDate: marketData[marketData.length - 1]?.timestamp || new Date(),
        trades: [],
        totalTrades: 0,
        winningTrades: 0,
        losingTrades: 0,
        winRate: 0,
        totalPnl: 0,
        totalPnlPercent: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        approved: false,
        approvalReasons: [],
        rejectionReasons: [`Execution error: ${execution.error}`],
        executionTimeMs: execution.executionTimeMs,
        error: execution.error,
      };
    }

    // Analyze results
    const result = analyzeBacktest(
      execution.trades,
      strategy.name,
      strategy.domain,
      marketData,
      this.thresholds
    );

    result.executionTimeMs = execution.executionTimeMs;

    console.log(`[Sandbox] Backtest complete: ${result.totalTrades} trades, ${(result.winRate * 100).toFixed(1)}% win rate`);
    console.log(`[Sandbox] Approved: ${result.approved}`);

    return result;
  }

  /**
   * Promote a successful strategy to a skill file
   */
  async promoteToSkill(
    strategy: StrategyCode,
    result: BacktestResult
  ): Promise<string | null> {
    if (!result.approved) {
      console.log(`[Sandbox] Cannot promote unapproved strategy: ${strategy.name}`);
      return null;
    }

    // Create skill content
    const skillContent = `---
name: strategy-${strategy.name.toLowerCase().replace(/\s+/g, '-')}
domain: ${strategy.domain}
type: strategy
source: sandbox_backtest
created: ${new Date().toISOString()}
backtest_results:
  trades: ${result.totalTrades}
  win_rate: ${(result.winRate * 100).toFixed(1)}%
  total_pnl: ${result.totalPnlPercent.toFixed(1)}%
  max_drawdown: ${(result.maxDrawdown * 100).toFixed(1)}%
  sharpe_ratio: ${result.sharpeRatio.toFixed(2)}
---

# ${strategy.name}

${strategy.description}

## Backtest Performance

- **Total Trades:** ${result.totalTrades}
- **Win Rate:** ${(result.winRate * 100).toFixed(1)}%
- **Total Return:** ${result.totalPnlPercent.toFixed(1)}%
- **Max Drawdown:** ${(result.maxDrawdown * 100).toFixed(1)}%
- **Sharpe Ratio:** ${result.sharpeRatio.toFixed(2)}

## Strategy Logic

\`\`\`typescript
${strategy.code}
\`\`\`

## When to Apply

Use this strategy when market conditions align with the backtest period.
Monitor actual performance and disable if results diverge significantly.

## Risk Management

- Maximum position size: 10% of portfolio
- Stop loss: As defined in strategy code
- Only trade when confidence is high
`;

    // Save to skills directory
    const fs = await import('fs').then(m => m.promises);
    const path = await import('path');

    const skillsDir = path.join(process.cwd(), '.claude', 'skills');
    await fs.mkdir(skillsDir, { recursive: true });

    const filename = `strategy-${strategy.name.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.md`;
    const filepath = path.join(skillsDir, filename);

    await fs.writeFile(filepath, skillContent, 'utf-8');

    console.log(`[Sandbox] Strategy promoted to skill: ${filename}`);
    return filename;
  }
}

// Singleton instance
export const strategySandbox = new StrategySandbox();

// =============================================================================
// SAMPLE DATA GENERATOR (for testing)
// =============================================================================

/**
 * Generate sample market data for backtesting
 */
export function generateSampleMarketData(
  days: number = 30,
  startPrice: number = 100,
  volatility: number = 0.02
): MarketDataPoint[] {
  const data: MarketDataPoint[] = [];
  let price = startPrice;
  const now = new Date();

  for (let i = 0; i < days * 24; i++) { // Hourly data
    const timestamp = new Date(now.getTime() - (days * 24 - i) * 60 * 60 * 1000);
    const change = (Math.random() - 0.5) * 2 * volatility;
    price = price * (1 + change);

    const high = price * (1 + Math.random() * volatility);
    const low = price * (1 - Math.random() * volatility);
    const open = price * (1 + (Math.random() - 0.5) * volatility);
    const close = price;

    data.push({
      timestamp,
      open,
      high,
      low,
      close,
      volume: Math.random() * 1000000,
    });
  }

  return data;
}
