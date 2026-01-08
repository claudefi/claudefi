import type { AgentDecision } from '../types/index.js';

interface ExecutionOptions {
  paperTrading: boolean;
}

export async function executeDLMMDecision(
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
    case 'add_liquidity': {
      // Validate add_liquidity decision
      if (!decision.target) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Missing pool_address (target)',
        };
      }

      if (!decision.amountUsd || decision.amountUsd <= 0) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Missing or invalid amount',
        };
      }

      if (!decision.metadata?.strategy) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Missing strategy (spot, curve, bid-ask)',
        };
      }

      // Validate strategy value
      const validStrategies = ['spot', 'curve', 'bid-ask'];
      if (!validStrategies.includes(decision.metadata.strategy as string)) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: `Invalid strategy. Must be one of: ${validStrategies.join(', ')}`,
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
              strategy: decision.metadata.strategy,
              pool_address: decision.target,
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

    case 'remove_liquidity': {
      // Validate remove_liquidity decision
      if (!decision.metadata?.positionId) {
        return {
          success: false,
          mode: options.paperTrading ? 'paper' : 'real',
          error: 'Position ID required for remove_liquidity',
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
