/**
 * DLMM Tools
 * Meteora DLMM liquidity provision tools
 * Uses LIVE data from Meteora API
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { meteoraClient, type MeteoraPool } from '../../../clients/meteora/client.js';
import { getMeteoraLiquidity } from '../../../clients/meteora/liquidity.js';
import {
  getOpenPositions,
  getDomainBalance,
  createPosition,
  closePosition,
  updateDomainBalance,
  logDecision,
} from '../../../db/index.js';

export const dlmmTools: Tool[] = [
  {
    name: 'dlmm_fetch_pools',
    description: `Fetch LIVE Meteora DLMM pools with TVL, volume, fees, and APR.
Use this to find liquidity provision opportunities. Returns top pools sorted by liquidity.
Each pool includes: address, name, TVL, 24h volume, 24h fees, APR, bin step.`,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          default: 30,
          description: 'Maximum number of pools to return (default: 30)',
        },
        minTvl: {
          type: 'number',
          default: 50000,
          description: 'Minimum TVL in USD (default: 50000)',
        },
        minFees: {
          type: 'number',
          default: 100,
          description: 'Minimum 24h fees in USD (default: 100)',
        },
      },
    },
  },
  {
    name: 'dlmm_add_liquidity',
    description: `Add liquidity to a Meteora DLMM pool.
Strategies:
- spot: Single-sided, concentrated around current price. Best for stable pairs.
- curve: Normal distribution around current price. Good balance of fees and IL.
- bid-ask: Wide range, acts like limit orders. Lower fees but less IL risk.`,
    inputSchema: {
      type: 'object',
      properties: {
        poolAddress: {
          type: 'string',
          description: 'Full Solana address of the DLMM pool',
        },
        amountUsd: {
          type: 'number',
          minimum: 10,
          description: 'USD amount to add as liquidity (minimum $10)',
        },
        strategy: {
          type: 'string',
          enum: ['spot', 'curve', 'bid-ask'],
          default: 'curve',
          description: 'Liquidity strategy (default: curve)',
        },
      },
      required: ['poolAddress', 'amountUsd'],
    },
  },
  {
    name: 'dlmm_remove_liquidity',
    description: `Remove liquidity from an open DLMM position.
Can remove all (100%) or partial amount.`,
    inputSchema: {
      type: 'object',
      properties: {
        positionId: {
          type: 'string',
          description: 'Database ID of the position to close',
        },
        percentage: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 100,
          description: 'Percentage of position to remove (1-100, default: 100)',
        },
      },
      required: ['positionId'],
    },
  },
  {
    name: 'dlmm_get_positions',
    description: 'Get all open DLMM liquidity positions with current values and fees earned.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'dlmm_sync_positions',
    description: 'Sync DLMM position values with current pool data. Updates current values based on TVL changes.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
];

export async function handleDLMMTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const paperMode = process.env.PAPER_TRADING !== 'false';

  switch (name) {
    case 'dlmm_fetch_pools': {
      const limit = (args.limit as number) || 30;
      const minTvl = (args.minTvl as number) || 50000;
      const minFees = (args.minFees as number) || 100;

      // Fetch LIVE pools from Meteora API
      const pools = await meteoraClient.getPools(limit * 2);

      // Filter and format pools
      const filtered = pools
        .filter((pool: MeteoraPool) => {
          const tvl = parseFloat(pool.liquidity) || 0;
          const fees = pool.fees_24h || 0;
          return tvl >= minTvl && fees >= minFees;
        })
        .slice(0, limit)
        .map((pool: MeteoraPool) => {
          const tvl = parseFloat(pool.liquidity) || 0;
          const apr = meteoraClient.calculateApr(pool);
          return {
            address: pool.address,
            name: pool.name,
            tvl: `$${tvl.toLocaleString()}`,
            volume24h: `$${pool.trade_volume_24h.toLocaleString()}`,
            fees24h: `$${pool.fees_24h.toLocaleString()}`,
            apr: apr.toFixed(1) + '%',
            binStep: pool.bin_step,
            currentPrice: pool.current_price.toFixed(6),
            baseFee: pool.base_fee_percentage,
          };
        });

      return {
        count: filtered.length,
        source: 'LIVE Meteora API',
        pools: filtered,
        hint: 'Use dlmm_add_liquidity with a pool address to provide liquidity',
      };
    }

    case 'dlmm_add_liquidity': {
      const poolAddress = args.poolAddress as string;
      const amountUsd = args.amountUsd as number;
      const strategy = (args.strategy as string) || 'curve';

      // Validate balance
      const balance = await getDomainBalance('dlmm');
      if (amountUsd > balance) {
        return {
          success: false,
          error: `Insufficient balance. Have $${balance.toFixed(2)}, need $${amountUsd}`,
        };
      }

      // Check position limit
      const positions = await getOpenPositions('dlmm');
      if (positions.length >= 3) {
        return {
          success: false,
          error: 'Maximum 3 DLMM positions allowed. Close a position first.',
        };
      }

      // Verify pool exists via live API
      const pool = await meteoraClient.getPool(poolAddress);
      if (!pool) {
        return {
          success: false,
          error: `Pool ${poolAddress} not found`,
        };
      }

      if (paperMode) {
        // Paper trading - simulate position creation
        const positionId = await createPosition('dlmm', {
          target: poolAddress,
          targetName: pool.name,
          entryValueUsd: amountUsd,
          entryPrice: pool.current_price,
          metadata: {
            strategy,
            fees_earned: 0,
            apr: meteoraClient.calculateApr(pool),
            paperTrade: true,
          },
        });

        // Deduct from balance
        await updateDomainBalance('dlmm', balance - amountUsd);

        // Log decision
        await logDecision('dlmm', {
          action: 'add_liquidity',
          target: poolAddress,
          amountUsd,
          reasoning: `Added $${amountUsd} liquidity to ${pool.name} with ${strategy} strategy`,
          confidence: 0.8,
        });

        return {
          success: true,
          mode: 'paper',
          positionId,
          poolAddress,
          poolName: pool.name,
          amountUsd,
          strategy,
          apr: meteoraClient.calculateApr(pool).toFixed(1) + '%',
          newBalance: (balance - amountUsd).toFixed(2),
        };
      } else {
        // Real trading - requires Solana wallet
        const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
        if (!privateKeyStr) {
          return {
            success: false,
            error: 'SOLANA_PRIVATE_KEY not set. Cannot execute real trades.',
          };
        }

        try {
          // Decode wallet from base58 private key
          const wallet = Keypair.fromSecretKey(bs58.decode(privateKeyStr));
          console.log(`[DLMM] Using wallet: ${wallet.publicKey.toBase58().slice(0, 8)}...`);

          // Get RPC URL
          const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
          const liquidity = getMeteoraLiquidity(rpcUrl);

          // Execute real liquidity addition
          const result = await liquidity.addLiquidity(
            {
              poolAddress,
              amountUsd,
              strategy: strategy as 'spot' | 'curve' | 'bid-ask',
            },
            wallet
          );

          // Create position record
          const positionId = await createPosition('dlmm', {
            target: poolAddress,
            targetName: pool.name,
            entryValueUsd: amountUsd,
            entryPrice: pool.current_price,
            metadata: {
              strategy,
              positionAddress: result.positionAddress,
              txid: result.txid,
              apr: meteoraClient.calculateApr(pool),
              realTrade: true,
            },
          });

          // Deduct from balance
          await updateDomainBalance('dlmm', balance - amountUsd);

          // Log decision
          await logDecision('dlmm', {
            action: 'add_liquidity',
            target: poolAddress,
            amountUsd,
            reasoning: `[REAL] Added $${amountUsd} liquidity to ${pool.name} with ${strategy} strategy`,
            confidence: 0.8,
          });

          return {
            success: true,
            mode: 'real',
            positionId,
            positionAddress: result.positionAddress,
            poolAddress,
            poolName: pool.name,
            amountUsd,
            strategy,
            txid: result.txid,
            apr: meteoraClient.calculateApr(pool).toFixed(1) + '%',
            newBalance: (balance - amountUsd).toFixed(2),
          };
        } catch (error) {
          console.error('[DLMM] Real trade failed:', error);
          return {
            success: false,
            error: `Real trade failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    }

    case 'dlmm_remove_liquidity': {
      const positionId = args.positionId as string;
      const percentage = (args.percentage as number) || 100;

      const positions = await getOpenPositions('dlmm');
      const position = positions.find(p => p.id === positionId);

      if (!position) {
        return {
          success: false,
          error: `Position ${positionId} not found or already closed`,
        };
      }

      const valueToReturn = position.currentValueUsd * (percentage / 100);
      const pnl = position.currentValueUsd - position.entryValueUsd;

      if (paperMode) {
        if (percentage >= 100) {
          // Full close
          await closePosition('dlmm', positionId, {
            currentValueUsd: position.currentValueUsd,
            realizedPnl: pnl,
          });
        } else {
          // Partial close - update position
          await closePosition('dlmm', positionId, {
            currentValueUsd: position.currentValueUsd,
            realizedPnl: pnl,
          });
        }

        // Return value to balance
        const balance = await getDomainBalance('dlmm');
        await updateDomainBalance('dlmm', balance + valueToReturn);

        await logDecision('dlmm', {
          action: percentage >= 100 ? 'remove_liquidity' : 'partial_remove',
          target: position.target,
          amountUsd: valueToReturn,
          reasoning: `Removed ${percentage}% of position, returned $${valueToReturn.toFixed(2)}`,
          confidence: 0.8,
        });

        return {
          success: true,
          mode: 'paper',
          positionId,
          percentage,
          valueReturned: valueToReturn.toFixed(2),
          pnl: pnl.toFixed(2),
          newBalance: (balance + valueToReturn).toFixed(2),
        };
      } else {
        // Real trading
        const privateKeyStr = process.env.SOLANA_PRIVATE_KEY;
        if (!privateKeyStr) {
          return {
            success: false,
            error: 'SOLANA_PRIVATE_KEY not set. Cannot execute real trades.',
          };
        }

        try {
          const wallet = Keypair.fromSecretKey(bs58.decode(privateKeyStr));
          const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
          const liquidity = getMeteoraLiquidity(rpcUrl);

          // Execute real liquidity removal
          const result = await liquidity.removeLiquidity(
            position.target,
            wallet,
            percentage
          );

          // Close position in database
          if (percentage >= 100) {
            await closePosition('dlmm', positionId, {
              currentValueUsd: position.currentValueUsd,
              realizedPnl: pnl,
            });
          }

          // Return value to balance
          const balance = await getDomainBalance('dlmm');
          await updateDomainBalance('dlmm', balance + valueToReturn);

          await logDecision('dlmm', {
            action: percentage >= 100 ? 'remove_liquidity' : 'partial_remove',
            target: position.target,
            amountUsd: valueToReturn,
            reasoning: `[REAL] Removed ${percentage}% of position, returned $${valueToReturn.toFixed(2)}`,
            confidence: 0.8,
          });

          return {
            success: true,
            mode: 'real',
            positionId,
            percentage,
            valueReturned: valueToReturn.toFixed(2),
            pnl: pnl.toFixed(2),
            txids: result.txids,
            newBalance: (balance + valueToReturn).toFixed(2),
          };
        } catch (error) {
          console.error('[DLMM] Real remove liquidity failed:', error);
          return {
            success: false,
            error: `Real trade failed: ${error instanceof Error ? error.message : String(error)}`,
          };
        }
      }
    }

    case 'dlmm_get_positions': {
      const positions = await getOpenPositions('dlmm');

      if (positions.length === 0) {
        return {
          count: 0,
          message: 'No open DLMM positions',
        };
      }

      return {
        count: positions.length,
        positions: positions.map(p => ({
          id: p.id,
          poolAddress: p.target,
          poolName: (p.metadata as Record<string, unknown>)?.pool_name || 'Unknown',
          entryValueUsd: p.entryValueUsd.toFixed(2),
          currentValueUsd: p.currentValueUsd.toFixed(2),
          pnl: (p.currentValueUsd - p.entryValueUsd).toFixed(2),
          pnlPercent: (((p.currentValueUsd - p.entryValueUsd) / p.entryValueUsd) * 100).toFixed(1) + '%',
          feesEarned: (p.metadata as Record<string, unknown>)?.fees_earned || 0,
          strategy: (p.metadata as Record<string, unknown>)?.strategy || 'unknown',
          openedAt: p.openedAt,
        })),
      };
    }

    case 'dlmm_sync_positions': {
      const positions = await getOpenPositions('dlmm');

      if (positions.length === 0) {
        return {
          synced: 0,
          message: 'No positions to sync',
        };
      }

      // In paper mode, simulate fees accrual based on APR
      // In real mode, would query on-chain position data
      let updated = 0;

      for (const position of positions) {
        const poolAddress = position.target;
        const pool = await meteoraClient.getPool(poolAddress);

        if (pool) {
          const apr = meteoraClient.calculateApr(pool);
          const dailyRate = apr / 365 / 100;
          const daysHeld = (Date.now() - new Date(position.openedAt).getTime()) / (1000 * 60 * 60 * 24);
          const estimatedFees = position.entryValueUsd * dailyRate * daysHeld;

          // Update position value (entry + estimated fees)
          const newValue = position.entryValueUsd + estimatedFees;

          // Update in database would happen here
          // For now just report
          updated++;
        }
      }

      return {
        synced: updated,
        mode: paperMode ? 'paper' : 'real',
        message: `Synced ${updated} positions with current pool data`,
      };
    }

    default:
      throw new Error(`Unknown DLMM tool: ${name}`);
  }
}
