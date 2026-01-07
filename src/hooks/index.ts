/**
 * Claudefi Hooks System
 *
 * Event-driven hooks for agent control, validation, and logging.
 *
 * Usage:
 *   import { hookRegistry, HookEvent } from './hooks';
 *
 *   // Register a custom hook
 *   hookRegistry.register({
 *     name: 'my-hook',
 *     event: 'PreDecision',
 *     priority: 50,
 *     enabled: true,
 *     hook: async (ctx) => {
 *       // Validation logic
 *       return { proceed: true };
 *     },
 *   });
 *
 *   // Run hooks for an event
 *   const result = await hookRegistry.run('PreDecision', {
 *     domain: 'dlmm',
 *     decision: { ... },
 *     timestamp: new Date(),
 *   });
 */

// Types
export type {
  HookEvent,
  HookContext,
  HookResult,
  Hook,
  HookEntry,
  HookExecutionSummary,
} from './types.js';

// Registry (singleton)
export { hookRegistry } from './registry.js';

// Built-in hooks (auto-registered on import)
export { BUILT_IN_HOOKS } from './built-in.js';

// Initialize built-in hooks by importing the module
import './built-in.js';

// =============================================================================
// Legacy exports for backward compatibility
// =============================================================================

import type { Domain, AgentDecision } from '../types/index.js';
import { getDomainBalance, getOpenPositions, logDecision } from '../db/index.js';

/**
 * Legacy hook result (deprecated, use HookResult instead)
 */
export interface LegacyHookResult {
  allowed: boolean;
  reason?: string;
  modifiedArgs?: Record<string, unknown>;
}

/**
 * Pre-trade validation hook (legacy - use hookRegistry.run('PreDecision', ...) instead)
 */
export async function preTradeValidation(
  domain: Domain,
  decision: AgentDecision
): Promise<LegacyHookResult> {
  const errors: string[] = [];

  const tradingActions = [
    'add_liquidity', 'remove_liquidity',
    'open_long', 'open_short', 'close_position',
    'buy_yes', 'buy_no', 'sell',
    'buy',
  ];

  if (!tradingActions.includes(decision.action)) {
    return { allowed: true };
  }

  const positions = await getOpenPositions(domain);
  const isOpening = ['add_liquidity', 'open_long', 'open_short', 'buy_yes', 'buy_no', 'buy'].includes(decision.action);

  if (isOpening && positions.length >= 3) {
    errors.push(`Maximum 3 positions per domain. Current: ${positions.length}`);
  }

  if (isOpening && decision.amountUsd) {
    const balance = await getDomainBalance(domain);
    if (decision.amountUsd > balance) {
      errors.push(`Insufficient balance. Need $${decision.amountUsd}, have $${balance.toFixed(2)}`);
    }
    if (decision.amountUsd > balance * 0.2) {
      errors.push(`Position too large. Max 20% of balance ($${(balance * 0.2).toFixed(2)})`);
    }
  }

  if (isOpening && !decision.target) {
    errors.push('Target (pool/market/symbol) is required for this action');
  }

  if (decision.confidence < 0.3) {
    errors.push(`Confidence too low (${decision.confidence}). Minimum 0.3 required.`);
  }

  if (errors.length > 0) {
    return { allowed: false, reason: errors.join('; ') };
  }

  return { allowed: true };
}

/**
 * Post-trade logging hook (legacy)
 */
export async function postTradeLogging(
  domain: Domain,
  decision: AgentDecision,
  result: unknown
): Promise<void> {
  await logDecision(domain, {
    action: decision.action,
    target: decision.target,
    amountUsd: decision.amountUsd,
    reasoning: decision.reasoning,
    confidence: decision.confidence,
    metadata: { result, ...decision.metadata },
  });
}

/**
 * Secret injection hook (legacy)
 */
export function injectSecrets(): Record<string, string> {
  return {
    solanaPrivateKey: process.env.CLAUDEFI_PRIVATE_KEY || '',
    solanaRpcUrl: process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    hyperliquidPrivateKey: process.env.HYPERLIQUID_PRIVATE_KEY || '',
    polygonPrivateKey: process.env.POLYGON_PRIVATE_KEY || '',
    supabaseUrl: process.env.SUPABASE_URL || '',
    supabaseKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  };
}

/**
 * Human approval hook (legacy)
 */
export async function humanApprovalRequired(
  domain: Domain,
  decision: AgentDecision
): Promise<boolean> {
  const threshold = parseFloat(process.env.APPROVAL_THRESHOLD_USD || '500');

  if (decision.amountUsd && decision.amountUsd > threshold) {
    if (process.env.PAPER_TRADING === 'true') {
      return true;
    }
    return false;
  }
  return true;
}

/**
 * Execute decision with all hooks (legacy)
 */
export async function executeWithHooks(
  domain: Domain,
  decision: AgentDecision,
  executor: () => Promise<unknown>
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const validation = await preTradeValidation(domain, decision);
  if (!validation.allowed) {
    return { success: false, error: validation.reason };
  }

  const approved = await humanApprovalRequired(domain, decision);
  if (!approved) {
    return { success: false, error: 'Human approval required but not granted' };
  }

  try {
    const result = await executor();
    await postTradeLogging(domain, decision, result);
    return { success: true, result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    return { success: false, error: message };
  }
}
