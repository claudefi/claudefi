import type { AgentDecision } from '../types/index.js';

interface ExecutionOptions {
  paperTrading: boolean;
}

export async function executePerpsDecision(
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
    case 'open_long':
    case 'open_short': {
      // Validate open position decision
      if (!decision.target) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Missing symbol (target)',
        };
      }

      if (!decision.amountUsd || decision.amountUsd <= 0) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Missing or invalid amount',
        };
      }

      if (!decision.metadata?.leverage) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Missing leverage',
        };
      }

      // Validate leverage range (typically 1-50x)
      const leverage = Number(decision.metadata.leverage);
      if (isNaN(leverage) || leverage < 1 || leverage > 50) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Invalid leverage. Must be between 1 and 50',
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
              leverage: decision.metadata.leverage,
              side: decision.action === 'open_long' ? 'long' : 'short',
              symbol: decision.target,
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

    case 'close_position':
    case 'reduce_position': {
      // Validate close/reduce position decision
      if (!decision.metadata?.positionId) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Position ID required for close/reduce',
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
              action: decision.action,
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
