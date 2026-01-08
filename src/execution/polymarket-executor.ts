import type { AgentDecision } from '../types/index.js';

interface ExecutionOptions {
  paperTrading: boolean;
}

export async function executePolymarketDecision(
  decision: AgentDecision,
  options: ExecutionOptions
): Promise<{
  success: boolean;
  mode: 'paper' | 'real';
  fills?: Array<{
    target: string;
    sizeUsd: number;
    metadata?: Record<string, unknown>;
  }>;
  error?: string;
}> {
  // Hold action - always succeeds
  if (decision.action === 'hold') {
    return { success: true, mode: options.paperTrading ? 'paper' : 'real' };
  }

  // Validate decision structure
  switch (decision.action) {
    case 'buy': {
      // Validate buy decision
      if (!decision.target) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Missing condition_id (target)',
        };
      }

      if (!decision.amountUsd || decision.amountUsd <= 0) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Missing or invalid amount',
        };
      }

      if (!decision.metadata?.outcome) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Missing outcome (YES or NO)',
        };
      }

      // Paper mode: validate and return success
      if (options.paperTrading) {
        return {
          success: true,
          mode: 'paper',
          fills: [{
            target: decision.target,
            sizeUsd: decision.amountUsd,
            metadata: {
              outcome: decision.metadata.outcome,
              condition_id: decision.target,
            },
          }],
        };
      }

      // Real mode: not implemented yet
      return {
        success: false,
        mode: 'real',
        error: 'Real trading not implemented yet',
      };
    }

    case 'sell': {
      // Validate sell decision
      if (!decision.metadata?.positionId) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Position ID required for sell',
        };
      }

      // Paper mode: validate and return success
      if (options.paperTrading) {
        return {
          success: true,
          mode: 'paper',
          fills: [{
            target: decision.target || 'unknown',
            sizeUsd: decision.amountUsd || 0,
            metadata: {
              position_id: decision.metadata.positionId,
            },
          }],
        };
      }

      // Real mode: not implemented yet
      return {
        success: false,
        mode: 'real',
        error: 'Real trading not implemented yet',
      };
    }

    default:
      return {
        success: false,
        mode: options.paperTrading ? 'paper' : 'real',
        error: `Unsupported action: ${decision.action}`,
      };
  }
}
