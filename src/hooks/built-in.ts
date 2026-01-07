/**
 * Built-in Hooks for Claudefi
 *
 * These hooks provide essential guard rails for trading:
 * - Balance validation
 * - Position limits
 * - Confidence thresholds
 * - Human approval for high-value trades
 * - Logging and metrics
 */

import { hookRegistry } from './registry.js';
import { getDomainBalance, getOpenPositions, getPortfolio, getPerformanceSnapshots } from '../db/index.js';
import type { HookContext, HookResult } from './types.js';

// Track portfolio peak for drawdown calculation
let portfolioPeak: number | null = null;
let lastPeakUpdate: Date | null = null;

/**
 * Balance Check Hook
 * Ensures trades don't exceed available balance or position sizing rules
 */
hookRegistry.register({
  name: 'balance-check',
  event: 'PreDecision',
  priority: 10,
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    const decision = ctx.decision;
    if (!decision?.amountUsd) {
      return { proceed: true };
    }

    // Skip for close/remove actions
    const closeActions = ['close_position', 'partial_close', 'remove_liquidity', 'partial_remove', 'sell', 'partial_sell'];
    if (closeActions.includes(decision.action)) {
      return { proceed: true };
    }

    const balance = await getDomainBalance(ctx.domain);

    // Check absolute balance
    if (decision.amountUsd > balance) {
      return {
        proceed: false,
        reason: `Insufficient balance: need $${decision.amountUsd.toFixed(2)}, have $${balance.toFixed(2)}`,
      };
    }

    // Check position sizing (max 20% of balance)
    const maxPositionSize = balance * 0.2;
    if (decision.amountUsd > maxPositionSize) {
      return {
        proceed: false,
        reason: `Position too large: $${decision.amountUsd.toFixed(2)} exceeds max $${maxPositionSize.toFixed(2)} (20% of balance)`,
      };
    }

    return { proceed: true };
  },
});

/**
 * Position Limit Hook
 * Ensures we don't exceed max 3 positions per domain
 */
hookRegistry.register({
  name: 'position-limit',
  event: 'PreDecision',
  priority: 20,
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    const decision = ctx.decision;
    if (!decision || decision.action === 'hold') {
      return { proceed: true };
    }

    // Only check for opening new positions
    const openActions = ['add_liquidity', 'open_long', 'open_short', 'buy_yes', 'buy_no', 'buy'];
    if (!openActions.includes(decision.action)) {
      return { proceed: true };
    }

    const positions = await getOpenPositions(ctx.domain);
    const maxPositions = parseInt(process.env.MAX_POSITIONS_PER_DOMAIN || '3');

    if (positions.length >= maxPositions) {
      return {
        proceed: false,
        reason: `Max ${maxPositions} positions allowed per domain. Currently have ${positions.length}. Close a position first.`,
      };
    }

    return { proceed: true };
  },
});

/**
 * Confidence Threshold Hook
 * Ensures decisions meet minimum confidence level
 */
hookRegistry.register({
  name: 'confidence-threshold',
  event: 'PreDecision',
  priority: 30,
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    const decision = ctx.decision;
    if (!decision || decision.action === 'hold') {
      return { proceed: true };
    }

    const threshold = parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.6');
    const confidence = decision.confidence || 0;

    if (confidence < threshold) {
      return {
        proceed: false,
        reason: `Confidence ${(confidence * 100).toFixed(0)}% below threshold ${(threshold * 100).toFixed(0)}%`,
      };
    }

    return { proceed: true };
  },
});

/**
 * Global Drawdown Limit Hook
 * Pauses new trades if portfolio drops >15% from peak
 */
hookRegistry.register({
  name: 'global-drawdown-limit',
  event: 'PreDecision',
  priority: 5, // Run first, before other checks
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    const decision = ctx.decision;
    if (!decision || decision.action === 'hold') {
      return { proceed: true };
    }

    // Only check for opening new positions
    const openActions = ['add_liquidity', 'open_long', 'open_short', 'buy_yes', 'buy_no', 'buy'];
    if (!openActions.includes(decision.action)) {
      return { proceed: true };
    }

    try {
      const portfolio = await getPortfolio();
      const currentValue = portfolio.totalValueUsd;

      // Update peak (with 1 hour cooldown to avoid rapid updates)
      const now = new Date();
      if (!portfolioPeak || !lastPeakUpdate ||
          (now.getTime() - lastPeakUpdate.getTime() > 3600000) ||
          currentValue > portfolioPeak) {
        if (currentValue > (portfolioPeak || 0)) {
          portfolioPeak = currentValue;
          lastPeakUpdate = now;
        }
      }

      // Calculate drawdown
      if (portfolioPeak && currentValue < portfolioPeak) {
        const drawdown = (portfolioPeak - currentValue) / portfolioPeak;
        const maxDrawdown = parseFloat(process.env.MAX_DRAWDOWN || '0.15'); // 15% default

        if (drawdown > maxDrawdown) {
          console.log(`⚠️ [Drawdown] Portfolio down ${(drawdown * 100).toFixed(1)}% from peak $${portfolioPeak.toFixed(2)}`);
          return {
            proceed: false,
            reason: `Portfolio down ${(drawdown * 100).toFixed(1)}% from peak ($${portfolioPeak.toFixed(2)} → $${currentValue.toFixed(2)}). New positions blocked until recovery.`,
          };
        }
      }

      return { proceed: true };
    } catch (error) {
      // If we can't check drawdown, allow the trade but log warning
      console.warn('[Drawdown] Could not calculate drawdown:', error);
      return { proceed: true };
    }
  },
});

/**
 * Per-Domain Drawdown Limit Hook
 * Reduces allocation if domain down >20%
 */
hookRegistry.register({
  name: 'domain-drawdown-limit',
  event: 'PreDecision',
  priority: 6, // Run early
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    const decision = ctx.decision;
    if (!decision || decision.action === 'hold') {
      return { proceed: true };
    }

    // Only check for opening new positions
    const openActions = ['add_liquidity', 'open_long', 'open_short', 'buy_yes', 'buy_no', 'buy'];
    if (!openActions.includes(decision.action)) {
      return { proceed: true };
    }

    try {
      // Get performance history for this domain
      const history = await getPerformanceSnapshots(ctx.domain, 30);

      if (history.length < 2) {
        return { proceed: true };
      }

      // Find peak in history
      const peakValue = Math.max(...history.map(h => h.totalValueUsd));
      const currentValue = history[history.length - 1].totalValueUsd;

      if (currentValue < peakValue) {
        const drawdown = (peakValue - currentValue) / peakValue;
        const domainMaxDrawdown = parseFloat(process.env.DOMAIN_MAX_DRAWDOWN || '0.20'); // 20% default

        if (drawdown > domainMaxDrawdown) {
          console.log(`⚠️ [Drawdown] ${ctx.domain.toUpperCase()} down ${(drawdown * 100).toFixed(1)}% from peak`);

          // Reduce position size instead of blocking entirely
          if (decision.amountUsd) {
            const reducedAmount = decision.amountUsd * 0.5;
            console.log(`   Reducing position size from $${decision.amountUsd.toFixed(2)} to $${reducedAmount.toFixed(2)}`);
            decision.amountUsd = reducedAmount;
          }
        }
      }

      return { proceed: true };
    } catch (error) {
      // If we can't check drawdown, allow the trade
      return { proceed: true };
    }
  },
});

/**
 * Human Approval Hook
 * Requires manual approval for high-value trades (real trading only)
 */
hookRegistry.register({
  name: 'human-approval',
  event: 'PreDecision',
  priority: 100,
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    const decision = ctx.decision;
    if (!decision?.amountUsd) {
      return { proceed: true };
    }

    // Skip in paper trading mode
    if (process.env.PAPER_TRADING === 'true' || process.env.PAPER_TRADING === undefined) {
      return { proceed: true };
    }

    const threshold = parseFloat(process.env.APPROVAL_THRESHOLD_USD || '500');

    if (decision.amountUsd <= threshold) {
      return { proceed: true };
    }

    // In real trading, high-value trades need approval
    // This would integrate with Telegram bot for approval
    console.log(`[Hooks] High-value trade ($${decision.amountUsd}) requires approval`);
    return {
      proceed: false,
      reason: `Trade of $${decision.amountUsd.toFixed(2)} exceeds approval threshold of $${threshold}. Manual approval required.`,
    };
  },
});

/**
 * Decision Logger Hook
 * Logs all decisions for auditing
 */
hookRegistry.register({
  name: 'decision-logger',
  event: 'PostDecision',
  priority: 10,
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    const decision = ctx.decision;
    if (!decision) {
      return { proceed: true };
    }

    const emoji = {
      hold: '⏸️',
      add_liquidity: '💧',
      remove_liquidity: '🔄',
      open_long: '📈',
      open_short: '📉',
      close_position: '✅',
      buy_yes: '✓',
      buy_no: '✗',
      buy: '🛒',
      sell: '💰',
    }[decision.action] || '📋';

    console.log(`${emoji} [${ctx.domain.toUpperCase()}] ${decision.action}`);
    console.log(`   Target: ${decision.target || 'N/A'}`);
    console.log(`   Amount: $${decision.amountUsd?.toFixed(2) || 'N/A'}`);
    console.log(`   Confidence: ${((decision.confidence || 0) * 100).toFixed(0)}%`);
    console.log(`   Reasoning: ${decision.reasoning}`);

    return { proceed: true };
  },
});

/**
 * Session Start Logger
 */
hookRegistry.register({
  name: 'session-start-logger',
  event: 'SessionStart',
  priority: 10,
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    console.log(`🚀 [${ctx.domain.toUpperCase()}] Agent session started`);
    if (ctx.sessionId) {
      console.log(`   Session ID: ${ctx.sessionId.slice(0, 8)}...`);
    }
    return { proceed: true };
  },
});

/**
 * Session End Logger
 */
hookRegistry.register({
  name: 'session-end-logger',
  event: 'SessionEnd',
  priority: 10,
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    console.log(`✅ [${ctx.domain.toUpperCase()}] Agent session completed`);
    return { proceed: true };
  },
});

/**
 * Error Logger Hook
 */
hookRegistry.register({
  name: 'error-logger',
  event: 'OnError',
  priority: 10,
  enabled: true,
  hook: async (ctx: HookContext): Promise<HookResult> => {
    console.error(`❌ [${ctx.domain.toUpperCase()}] Error:`, ctx.error?.message || 'Unknown error');
    if (ctx.toolName) {
      console.error(`   Tool: ${ctx.toolName}`);
    }
    return { proceed: true };
  },
});

// Export hook names for easy reference
export const BUILT_IN_HOOKS = [
  'global-drawdown-limit',
  'domain-drawdown-limit',
  'balance-check',
  'position-limit',
  'confidence-threshold',
  'human-approval',
  'decision-logger',
  'session-start-logger',
  'session-end-logger',
  'error-logger',
] as const;
