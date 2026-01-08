/**
 * Domain Execution Adapters
 *
 * Translate AgentDecisions into actual trade executions, handling
 * paper-trading simulations vs. real transactions.
 */

import type { AgentDecision, Domain } from '../types/index.js';
import { executeSpotDecision } from './spot-executor.js';
import { executePolymarketDecision } from './polymarket-executor.js';
import { executeDLMMDecision } from './dlmm-executor.js';
import { executePerpsDecision } from './perps-executor.js';

export interface ExecutionResult {
  success: boolean;
  mode: 'paper' | 'real';
  fills?: Array<{
    target: string;
    sizeUsd: number;
    sizeTokens?: number;
    price?: number;
    feeUsd?: number;
    txHash?: string;
    metadata?: Record<string, unknown>;
  }>;
  error?: string;
}

export async function executeDecisionForDomain(
  domain: Domain,
  decision: AgentDecision,
  options: { paperTrading: boolean }
): Promise<ExecutionResult> {
  switch (domain) {
    case 'spot':
      return executeSpotDecision(decision, options);
    case 'polymarket':
      return executePolymarketDecision(decision, options);
    case 'dlmm':
      return executeDLMMDecision(decision, options);
    case 'perps':
      return executePerpsDecision(decision, options);
    default:
      return {
        success: false,
        mode: options.paperTrading ? 'paper' : 'real',
        error: `Execution adapter not implemented for ${domain}`,
      };
  }
}
