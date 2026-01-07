/**
 * Meteora DLMM Liquidity Integration
 * Handles adding and removing liquidity from Meteora dynamic liquidity pools
 *
 * Based on proven patterns from ClaudeFi
 */

import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  ComputeBudgetProgram,
} from '@solana/web3.js';
import BN from 'bn.js';
import { getConfig } from '../../config.js';

// Dynamic import for CommonJS compatibility
let DLMM: any;
let StrategyType: any;
async function loadDLMM() {
  if (!DLMM) {
    const mod = await import('@meteora-ag/dlmm');
    DLMM = mod.default;
    StrategyType = mod.StrategyType;
  }
  return { DLMM, StrategyType };
}

export interface AddLiquidityParams {
  poolAddress: string;
  amountUsd: number;
  strategy?: 'spot' | 'curve' | 'bid-ask';
}

export interface AddLiquidityResult {
  positionAddress: string;
  txid: string;
  amountX: number;
  amountY: number;
}

export interface RemoveLiquidityResult {
  txids: string[];
  amountReturned: number;
}

/**
 * Meteora DLMM Liquidity Helper
 */
export class MeteoraLiquidity {
  private connection: Connection;
  private isTestnet: boolean;

  constructor(rpcUrl?: string) {
    const config = getConfig();
    this.isTestnet = config.network.isTestnet;

    // Use provided URL or get from config
    const url = rpcUrl || config.network.solanaRpc;
    this.connection = new Connection(url, 'confirmed');

    if (config.mode !== 'paper') {
      console.log(`🔗 Meteora connected to ${this.isTestnet ? 'DEVNET' : 'MAINNET'}: ${url.substring(0, 40)}...`);
    }
  }

  /**
   * Send and confirm transaction with retries
   */
  private async sendAndConfirmWithRetry(
    transaction: Transaction,
    signers: Keypair[],
    maxRetries: number = 3
  ): Promise<string> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`  [Attempt ${attempt}/${maxRetries}] Sending transaction...`);

        // Get fresh blockhash
        const { blockhash, lastValidBlockHeight } =
          await this.connection.getLatestBlockhash('finalized');

        // Clone and prepare transaction
        const freshTx = Transaction.from(
          transaction.serialize({ requireAllSignatures: false, verifySignatures: false })
        );
        freshTx.recentBlockhash = blockhash;
        freshTx.lastValidBlockHeight = lastValidBlockHeight;
        freshTx.feePayer = signers[0].publicKey;

        // Add priority fees
        const priorityFeeIx = ComputeBudgetProgram.setComputeUnitPrice({
          microLamports: 100_000,
        });
        const computeLimitIx = ComputeBudgetProgram.setComputeUnitLimit({
          units: 500_000,
        });

        // Filter existing compute instructions and prepend new ones
        const filteredInstructions = freshTx.instructions.filter(
          (ix) => !ix.programId.equals(ComputeBudgetProgram.programId)
        );
        freshTx.instructions = [computeLimitIx, priorityFeeIx, ...filteredInstructions];

        // Sign
        freshTx.sign(...signers);

        // Send
        const rawTransaction = freshTx.serialize();
        const txid = await this.connection.sendRawTransaction(rawTransaction, {
          skipPreflight: false,
          maxRetries: 0,
        });

        console.log(`  Transaction sent: ${txid}`);

        // Poll for confirmation
        const startTime = Date.now();
        const maxWaitTime = 60000;

        while (Date.now() - startTime < maxWaitTime) {
          const statusResponse = await this.connection.getSignatureStatus(txid);

          if (statusResponse.value) {
            if (statusResponse.value.err) {
              throw new Error(`Transaction failed: ${JSON.stringify(statusResponse.value.err)}`);
            }
            if (
              statusResponse.value.confirmationStatus === 'confirmed' ||
              statusResponse.value.confirmationStatus === 'finalized'
            ) {
              console.log(`  ✅ Transaction confirmed`);
              return txid;
            }
          }

          await new Promise((resolve) => setTimeout(resolve, 2000));
        }

        throw new Error('Transaction confirmation timeout');
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.warn(`  ⚠️ Attempt ${attempt} failed: ${lastError.message}`);

        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 2000));
        }
      }
    }

    throw new Error(`Transaction failed after ${maxRetries} attempts: ${lastError?.message}`);
  }

  /**
   * Add liquidity to a Meteora DLMM pool
   */
  async addLiquidity(
    params: AddLiquidityParams,
    wallet: Keypair
  ): Promise<AddLiquidityResult> {
    const { poolAddress, amountUsd, strategy = 'curve' } = params;

    console.log(`\n🌊 Adding $${amountUsd} liquidity to ${poolAddress}...`);
    console.log(`  Strategy: ${strategy}`);

    const { DLMM, StrategyType } = await loadDLMM();

    // Load pool
    const pool = new PublicKey(poolAddress);
    const dlmmPool = await DLMM.create(this.connection, pool);
    await dlmmPool.refetchStates();

    // Get current pool price
    const activeBin = await dlmmPool.getActiveBin();
    const currentPrice = activeBin.pricePerToken;
    console.log(`  Current price: ${currentPrice}`);

    // Calculate amounts (simplified: split 50/50)
    const halfUsd = amountUsd / 2;
    const amountX = new BN(Math.floor(halfUsd * 1e9)); // Assuming 9 decimals
    const amountY = new BN(Math.floor(halfUsd * 1e6)); // Assuming 6 decimals (USDC)

    // Map strategy to Meteora strategy type
    const strategyMap: Record<string, any> = {
      spot: StrategyType.SpotOneSide,
      curve: StrategyType.Curve,
      'bid-ask': StrategyType.BidAsk,
    };
    const meteoraStrategy = strategyMap[strategy] || StrategyType.Curve;

    // Create position
    const activeBinPricePerToken = dlmmPool.fromPricePerLamport(
      Number(activeBin.price)
    );
    const minBinId = activeBin.binId - 34;
    const maxBinId = activeBin.binId + 34;

    const createPositionTx = await dlmmPool.initializePositionAndAddLiquidityByStrategy({
      positionPubKey: Keypair.generate().publicKey,
      user: wallet.publicKey,
      totalXAmount: amountX,
      totalYAmount: amountY,
      strategy: {
        maxBinId,
        minBinId,
        strategyType: meteoraStrategy,
      },
    });

    const txid = await this.sendAndConfirmWithRetry(createPositionTx, [wallet]);

    console.log(`  ✅ Liquidity added: ${txid}`);

    return {
      positionAddress: pool.toBase58(), // Simplified
      txid,
      amountX: amountX.toNumber(),
      amountY: amountY.toNumber(),
    };
  }

  /**
   * Remove liquidity from a position
   */
  async removeLiquidity(
    poolAddress: string,
    wallet: Keypair,
    percentage: number = 100
  ): Promise<RemoveLiquidityResult> {
    console.log(`\n💧 Removing ${percentage}% liquidity from ${poolAddress}...`);

    const { DLMM } = await loadDLMM();

    const pool = new PublicKey(poolAddress);
    const dlmmPool = await DLMM.create(this.connection, pool);
    await dlmmPool.refetchStates();

    // Get user positions
    const { userPositions } = await dlmmPool.getPositionsByUserAndLbPair(
      wallet.publicKey
    );

    if (!userPositions || userPositions.length === 0) {
      throw new Error('No positions found for this pool');
    }

    const txids: string[] = [];
    let totalReturned = 0;

    for (const position of userPositions) {
      // Get position details
      const positionData = position.positionData;
      const binIds = positionData.positionBinData.map((bin: any) => bin.binId);

      if (binIds.length === 0) continue;

      const fromBinId = Math.min(...binIds);
      const toBinId = Math.max(...binIds);

      // Create liquidity removal array (percentage for each bin)
      const liquiditiesBpsToRemove = binIds.map(() => new BN(percentage * 100)); // BPS

      // Build remove liquidity transaction
      const removeTx = await dlmmPool.removeLiquidity({
        position: position.publicKey,
        user: wallet.publicKey,
        fromBinId,
        toBinId,
        bps: new BN(percentage * 100),
        shouldClaimAndClose: percentage >= 100,
      });

      // Handle transaction (might be array)
      const transactions = Array.isArray(removeTx) ? removeTx : [removeTx];

      for (const tx of transactions) {
        const txid = await this.sendAndConfirmWithRetry(tx, [wallet]);
        txids.push(txid);
      }

      // Estimate returned amount
      totalReturned += position.positionData.totalXAmount + position.positionData.totalYAmount;
    }

    console.log(`  ✅ Liquidity removed: ${txids.length} transaction(s)`);

    return {
      txids,
      amountReturned: totalReturned,
    };
  }
}

// Singleton instance
let meteoraLiquidity: MeteoraLiquidity | null = null;

export function getMeteoraLiquidity(rpcUrl?: string): MeteoraLiquidity {
  if (!meteoraLiquidity || rpcUrl) {
    meteoraLiquidity = new MeteoraLiquidity(rpcUrl);
  }
  return meteoraLiquidity;
}
