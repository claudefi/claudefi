import type { AgentDecision } from '../types/index.js';
import { jupiterClient, TOKENS } from '../clients/jupiter/client.js';
import { getDomainBalance, updateDomainBalance, createPosition, closePosition } from '../data/provider.js';

interface ExecutionOptions {
  paperTrading: boolean;
}

export async function executeSpotDecision(
  decision: AgentDecision,
  options: ExecutionOptions
): Promise<{
  success: boolean;
  mode: 'paper' | 'real';
  fills?: Array<{
    target: string;
    sizeUsd: number;
    sizeTokens?: number;
    price?: number;
    metadata?: Record<string, unknown>;
  }>;
  error?: string;
}> {
  if (decision.action === 'hold') {
    return { success: true, mode: options.paperTrading ? 'paper' : 'real' };
  }

  const wallet = options.paperTrading ? null : null; // placeholder when wallet support added
  const balance = await getDomainBalance('spot');

  switch (decision.action) {
    case 'buy': {
      if (!decision.amountUsd || !decision.target) {
        return { success: false, mode: options.paperTrading ? 'paper' : 'real', error: 'Missing amount or target' };
      }

      if (decision.amountUsd > balance) {
        return { success: false, mode: options.paperTrading ? 'paper' : 'real', error: 'Insufficient balance' };
      }

      const metadataMint = typeof decision.metadata?.mint === 'string'
        ? decision.metadata.mint
        : undefined;
      const mint = metadataMint || decision.target;

      if (!mint) {
        return { success: false, mode: options.paperTrading ? 'paper' : 'real', error: 'Token mint required' };
      }

      if (options.paperTrading || !wallet) {
        const simulation = await jupiterClient.simulateSwap({
          inputMint: TOKENS.USDC,
          outputMint: mint,
          amountUsd: decision.amountUsd,
        });

        if (!simulation) {
          return { success: false, mode: 'paper', error: 'Failed to simulate swap' };
        }

        await updateDomainBalance('spot', balance - simulation.inputAmountUsd);
        await createPosition('spot', {
          target: mint,
          targetName: decision.target,
          entryValueUsd: simulation.inputAmountUsd,
          metadata: {
            tokenAmount: simulation.outputAmountUsd / (simulation.executionPrice || 1),
            entry_price: simulation.executionPrice,
            mint,
            position_size_usd: simulation.inputAmountUsd,
          },
        });

        return {
          success: true,
          mode: 'paper',
          fills: [{
            target: mint,
            sizeUsd: simulation.inputAmountUsd,
            sizeTokens: simulation.outputAmountUsd / (simulation.executionPrice || 1),
            price: simulation.executionPrice,
          }],
        };
      }

      return { success: false, mode: 'real', error: 'Real trading not implemented yet' };
    }

    case 'sell':
    case 'partial_sell': {
      if (!decision.metadata?.positionId) {
        return { success: false, mode: options.paperTrading ? 'paper' : 'real', error: 'Position id required' };
      }

      if (options.paperTrading || !wallet) {
        // Sell logic will be handled by orchestrator's balance adjustments for now
        return {
          success: true,
          mode: 'paper',
          fills: [{
            target: decision.target || 'unknown',
            sizeUsd: decision.amountUsd || 0,
          }],
        };
      }

      return { success: false, mode: 'real', error: 'Real trading not implemented yet' };
    }

    default:
      return { success: false, mode: options.paperTrading ? 'paper' : 'real', error: `Unsupported action ${decision.action}` };
  }
}
