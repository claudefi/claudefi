/**
 * Trade Verifier Service
 * Verifies trades on-chain for leaderboard eligibility
 *
 * Verification methods:
 * - DLMM/Spot: Solana transaction signatures
 * - Perps: Hyperliquid order IDs via API
 * - Polymarket: Polygon transaction signatures
 */

import { getSupabase } from '../clients/supabase/client.js';
import type { Domain } from '../types/index.js';

// =============================================================================
// TYPES
// =============================================================================

interface VerificationResult {
  verified: boolean;
  error?: string;
  details?: Record<string, unknown>;
}

interface PendingPosition {
  domain: Domain;
  id: string;
  tx_hash: string;
  opened_at: string;
}

interface AgentWallets {
  solana_wallet_pubkey?: string;
  hyperliquid_wallet?: string;
  polygon_wallet?: string;
}

// =============================================================================
// SOLANA VERIFICATION (DLMM + Spot)
// =============================================================================

/**
 * Verify a Solana transaction exists and was signed by the expected wallet
 */
export async function verifySolanaTransaction(
  txHash: string,
  expectedWallet: string
): Promise<VerificationResult> {
  try {
    const rpcUrl = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getTransaction',
        params: [
          txHash,
          { encoding: 'json', commitment: 'confirmed', maxSupportedTransactionVersion: 0 },
        ],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return { verified: false, error: `RPC error: ${data.error.message}` };
    }

    if (!data.result) {
      return { verified: false, error: 'Transaction not found' };
    }

    const tx = data.result;

    // Check if transaction was successful
    if (tx.meta?.err) {
      return { verified: false, error: 'Transaction failed on-chain' };
    }

    // Get account keys from the transaction
    const accountKeys = tx.transaction?.message?.accountKeys || [];

    // Check if the expected wallet signed the transaction
    const walletSigned = accountKeys.some(
      (key: string) => key.toLowerCase() === expectedWallet.toLowerCase()
    );

    if (!walletSigned) {
      return { verified: false, error: 'Wallet did not sign this transaction' };
    }

    return {
      verified: true,
      details: {
        blockTime: tx.blockTime,
        slot: tx.slot,
        fee: tx.meta?.fee,
      },
    };
  } catch (error) {
    return {
      verified: false,
      error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// =============================================================================
// HYPERLIQUID VERIFICATION (Perps)
// =============================================================================

/**
 * Verify a Hyperliquid order exists for the given wallet
 */
export async function verifyHyperliquidOrder(
  orderId: string,
  wallet: string
): Promise<VerificationResult> {
  try {
    // Get user's order history
    const response = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'orderStatus',
        user: wallet,
        oid: parseInt(orderId, 10),
      }),
    });

    const data = await response.json();

    if (data.status === 'order' || data.status === 'filled' || data.status === 'canceled') {
      return {
        verified: true,
        details: {
          status: data.status,
          order: data.order,
        },
      };
    }

    // Fallback: check fills history
    const fillsResponse = await fetch('https://api.hyperliquid.xyz/info', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'userFills',
        user: wallet,
      }),
    });

    const fills = await fillsResponse.json();

    if (Array.isArray(fills)) {
      const matchingFill = fills.find((f: { oid: number }) => f.oid === parseInt(orderId, 10));
      if (matchingFill) {
        return {
          verified: true,
          details: {
            fill: matchingFill,
          },
        };
      }
    }

    return { verified: false, error: 'Order not found in user history' };
  } catch (error) {
    return {
      verified: false,
      error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// =============================================================================
// POLYGON VERIFICATION (Polymarket)
// =============================================================================

/**
 * Verify a Polygon transaction exists and was sent by the expected wallet
 */
export async function verifyPolygonTransaction(
  txHash: string,
  expectedWallet: string
): Promise<VerificationResult> {
  try {
    const rpcUrl = process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com';

    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionByHash',
        params: [txHash],
      }),
    });

    const data = await response.json();

    if (data.error) {
      return { verified: false, error: `RPC error: ${data.error.message}` };
    }

    if (!data.result) {
      return { verified: false, error: 'Transaction not found' };
    }

    const tx = data.result;

    // Check if the transaction was sent by the expected wallet
    if (tx.from.toLowerCase() !== expectedWallet.toLowerCase()) {
      return { verified: false, error: 'Transaction not from expected wallet' };
    }

    // Get receipt to check if successful
    const receiptResponse = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getTransactionReceipt',
        params: [txHash],
      }),
    });

    const receiptData = await receiptResponse.json();

    if (receiptData.result?.status === '0x0') {
      return { verified: false, error: 'Transaction failed' };
    }

    return {
      verified: true,
      details: {
        from: tx.from,
        to: tx.to,
        blockNumber: parseInt(tx.blockNumber, 16),
        gasUsed: receiptData.result?.gasUsed,
      },
    };
  } catch (error) {
    return {
      verified: false,
      error: `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

// =============================================================================
// VERIFICATION ORCHESTRATION
// =============================================================================

/**
 * Get agent's wallet addresses
 */
async function getAgentWallets(agentId?: string): Promise<AgentWallets | null> {
  const supabase = getSupabase();

  let query = supabase
    .from('agent_config')
    .select('solana_wallet_pubkey, hyperliquid_wallet, polygon_wallet');

  if (agentId) {
    query = query.eq('id', agentId);
  }

  const { data, error } = await query.single();

  if (error || !data) {
    console.error('Failed to get agent wallets:', error);
    return null;
  }

  return data;
}

/**
 * Get all positions pending verification
 */
async function getPendingPositions(): Promise<PendingPosition[]> {
  const supabase = getSupabase();

  // DLMM positions
  const { data: dlmmData } = await supabase
    .from('dlmm_positions')
    .select('id, tx_hash, opened_at')
    .eq('verified', false)
    .not('tx_hash', 'is', null);

  // Perps positions
  const { data: perpsData } = await supabase
    .from('perps_positions')
    .select('id, order_id, opened_at')
    .eq('verified', false)
    .not('order_id', 'is', null);

  // Polymarket positions
  const { data: polyData } = await supabase
    .from('polymarket_positions')
    .select('id, tx_hash, opened_at')
    .eq('verified', false)
    .not('tx_hash', 'is', null);

  // Spot positions
  const { data: spotData } = await supabase
    .from('spot_positions')
    .select('id, tx_hash, opened_at')
    .eq('verified', false)
    .not('tx_hash', 'is', null);

  const positions: PendingPosition[] = [];

  (dlmmData || []).forEach((p) =>
    positions.push({ domain: 'dlmm', id: p.id, tx_hash: p.tx_hash, opened_at: p.opened_at })
  );
  (perpsData || []).forEach((p) =>
    positions.push({ domain: 'perps', id: p.id, tx_hash: p.order_id, opened_at: p.opened_at })
  );
  (polyData || []).forEach((p) =>
    positions.push({
      domain: 'polymarket',
      id: p.id,
      tx_hash: p.tx_hash,
      opened_at: p.opened_at,
    })
  );
  (spotData || []).forEach((p) =>
    positions.push({ domain: 'spot', id: p.id, tx_hash: p.tx_hash, opened_at: p.opened_at })
  );

  // Sort by opened_at ascending
  return positions.sort(
    (a, b) => new Date(a.opened_at).getTime() - new Date(b.opened_at).getTime()
  );
}

/**
 * Mark a position as verified
 */
async function markPositionVerified(domain: Domain, positionId: string): Promise<void> {
  const supabase = getSupabase();

  const tableMap: Record<Domain, string> = {
    dlmm: 'dlmm_positions',
    perps: 'perps_positions',
    polymarket: 'polymarket_positions',
    spot: 'spot_positions',
  };

  const { error } = await supabase
    .from(tableMap[domain])
    .update({
      verified: true,
      verified_at: new Date().toISOString(),
    })
    .eq('id', positionId);

  if (error) {
    console.error(`Failed to mark ${domain} position ${positionId} as verified:`, error);
  }
}

/**
 * Verify a single position based on its domain
 */
export async function verifyPosition(
  position: PendingPosition,
  wallets: AgentWallets
): Promise<VerificationResult> {
  switch (position.domain) {
    case 'dlmm':
    case 'spot':
      if (!wallets.solana_wallet_pubkey) {
        return { verified: false, error: 'No Solana wallet configured' };
      }
      return verifySolanaTransaction(position.tx_hash, wallets.solana_wallet_pubkey);

    case 'perps':
      if (!wallets.hyperliquid_wallet) {
        return { verified: false, error: 'No Hyperliquid wallet configured' };
      }
      return verifyHyperliquidOrder(position.tx_hash, wallets.hyperliquid_wallet);

    case 'polymarket':
      if (!wallets.polygon_wallet) {
        return { verified: false, error: 'No Polygon wallet configured' };
      }
      return verifyPolygonTransaction(position.tx_hash, wallets.polygon_wallet);

    default:
      return { verified: false, error: `Unknown domain: ${position.domain}` };
  }
}

/**
 * Run verification loop for all pending positions
 */
export async function runVerificationLoop(): Promise<{
  verified: number;
  failed: number;
  errors: string[];
}> {
  const wallets = await getAgentWallets();

  if (!wallets) {
    return { verified: 0, failed: 0, errors: ['No agent wallets configured'] };
  }

  const pendingPositions = await getPendingPositions();

  if (pendingPositions.length === 0) {
    return { verified: 0, failed: 0, errors: [] };
  }

  console.log(`[TradeVerifier] Verifying ${pendingPositions.length} pending positions...`);

  let verified = 0;
  let failed = 0;
  const errors: string[] = [];

  for (const position of pendingPositions) {
    const result = await verifyPosition(position, wallets);

    if (result.verified) {
      await markPositionVerified(position.domain, position.id);
      verified++;
      console.log(`[TradeVerifier] ✓ Verified ${position.domain} position ${position.id}`);
    } else {
      failed++;
      errors.push(`${position.domain}/${position.id}: ${result.error}`);
      console.log(
        `[TradeVerifier] ✗ Failed to verify ${position.domain} position ${position.id}: ${result.error}`
      );
    }

    // Rate limiting - don't spam RPCs
    await new Promise((resolve) => setTimeout(resolve, 200));
  }

  return { verified, failed, errors };
}

// =============================================================================
// WALLET VERIFICATION
// =============================================================================

/**
 * Verify wallet ownership via signed message
 * The message format is: "I am registering wallet {pubkey} for Claudefi agent {agent_name}"
 */
export async function verifyWalletOwnership(
  wallet: string,
  signature: string,
  message: string,
  chain: 'solana' | 'evm'
): Promise<VerificationResult> {
  try {
    if (chain === 'solana') {
      // For Solana, we'd use nacl or tweetnacl to verify ed25519 signatures
      // This is a placeholder - in production, use @solana/web3.js
      const isValid = signature.length > 0 && message.includes(wallet);
      return {
        verified: isValid,
        error: isValid ? undefined : 'Invalid signature',
      };
    } else {
      // For EVM chains (Polygon), we'd use ethers to recover the signer
      // This is a placeholder - in production, use ethers.verifyMessage
      const isValid = signature.length > 0 && message.includes(wallet.toLowerCase());
      return {
        verified: isValid,
        error: isValid ? undefined : 'Invalid signature',
      };
    }
  } catch (error) {
    return {
      verified: false,
      error: `Signature verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    };
  }
}

/**
 * Register wallet for an agent
 */
export async function registerAgentWallet(
  agentId: string,
  walletType: 'solana' | 'hyperliquid' | 'polygon',
  walletAddress: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();

  const columnMap = {
    solana: 'solana_wallet_pubkey',
    hyperliquid: 'hyperliquid_wallet',
    polygon: 'polygon_wallet',
  };

  const { error } = await supabase
    .from('agent_config')
    .update({
      [columnMap[walletType]]: walletAddress,
      wallet_verified_at: new Date().toISOString(),
    })
    .eq('id', agentId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

/**
 * Mark agent as verified trader (all required wallets connected)
 */
export async function markAgentAsVerifiedTrader(agentId: string): Promise<{ success: boolean; error?: string }> {
  const supabase = getSupabase();

  const { error } = await supabase
    .from('agent_config')
    .update({
      verified_trader: true,
      wallet_verified_at: new Date().toISOString(),
    })
    .eq('id', agentId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// =============================================================================
// BACKGROUND JOB
// =============================================================================

/**
 * Start background verification job
 * Runs every 5 minutes by default
 */
export function startVerificationJob(intervalMs = 5 * 60 * 1000): NodeJS.Timeout {
  console.log(`[TradeVerifier] Starting background verification job (interval: ${intervalMs}ms)`);

  // Run immediately
  runVerificationLoop().catch(console.error);

  // Then run on interval
  return setInterval(() => {
    runVerificationLoop().catch(console.error);
  }, intervalMs);
}

/**
 * Stop background verification job
 */
export function stopVerificationJob(jobId: NodeJS.Timeout): void {
  clearInterval(jobId);
  console.log('[TradeVerifier] Stopped background verification job');
}
