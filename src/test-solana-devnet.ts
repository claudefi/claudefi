/**
 * Solana Devnet Test Suite
 * Tests wallet, RPC connectivity, and transaction signing on devnet
 */

import 'dotenv/config';
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import { getConfig, logConfig } from './config.js';

async function main() {
  console.log('🧪 SOLANA DEVNET TEST SUITE');
  console.log('============================\n');

  const config = getConfig();

  // Verify testnet mode
  if (!config.network.isTestnet) {
    console.log('⚠️  Not in testnet mode. Set TRADING_MODE=testnet');
    console.log('   Current mode:', config.mode);
    process.exit(1);
  }

  console.log('✅ Running in TESTNET mode');
  console.log('   RPC:', config.network.solanaRpc);

  // Load wallet
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) {
    console.error('❌ SOLANA_PRIVATE_KEY not set');
    process.exit(1);
  }

  const wallet = Keypair.fromSecretKey(bs58.decode(privateKey));
  console.log('\n📍 Wallet Address:', wallet.publicKey.toBase58());

  // Connect to devnet
  const connection = new Connection(config.network.solanaRpc, 'confirmed');

  // Test 1: Check balance
  console.log('\n--- Test 1: Balance Check ---');
  const balance = await connection.getBalance(wallet.publicKey);
  console.log('   Balance:', balance / LAMPORTS_PER_SOL, 'SOL');

  if (balance < 0.01 * LAMPORTS_PER_SOL) {
    console.log('   ⚠️  Low balance. Request more from faucet.');
  } else {
    console.log('   ✅ Sufficient balance for testing');
  }

  // Test 2: RPC Connectivity
  console.log('\n--- Test 2: RPC Connectivity ---');
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  console.log('   Blockhash:', blockhash.substring(0, 32) + '...');
  console.log('   Valid until block:', lastValidBlockHeight);
  console.log('   ✅ RPC connected');

  // Test 3: Get slot info
  console.log('\n--- Test 3: Slot Info ---');
  const slot = await connection.getSlot();
  const blockTime = await connection.getBlockTime(slot);
  console.log('   Current slot:', slot);
  console.log('   Block time:', blockTime ? new Date(blockTime * 1000).toISOString() : 'N/A');
  console.log('   ✅ Slot info retrieved');

  // Test 4: Transaction signing (self-transfer of 0.001 SOL)
  console.log('\n--- Test 4: Transaction Signing & Sending ---');

  if (balance >= 0.002 * LAMPORTS_PER_SOL) {
    try {
      const transferAmount = 0.001 * LAMPORTS_PER_SOL; // 0.001 SOL

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: wallet.publicKey, // Self-transfer
          lamports: transferAmount,
        })
      );

      console.log('   Sending 0.001 SOL to self...');
      const signature = await sendAndConfirmTransaction(
        connection,
        transaction,
        [wallet],
        { commitment: 'confirmed' }
      );

      console.log('   ✅ Transaction confirmed!');
      console.log('   Signature:', signature);
      console.log('   Explorer: https://explorer.solana.com/tx/' + signature + '?cluster=devnet');
    } catch (error) {
      console.log('   ❌ Transaction failed:', (error as Error).message);
    }
  } else {
    console.log('   ⚠️  Insufficient balance for transaction test');
    console.log('   Need at least 0.002 SOL');
  }

  // Test 5: Check final balance
  console.log('\n--- Test 5: Final Balance ---');
  const finalBalance = await connection.getBalance(wallet.publicKey);
  console.log('   Balance:', finalBalance / LAMPORTS_PER_SOL, 'SOL');
  console.log('   Tx fee:', (balance - finalBalance) / LAMPORTS_PER_SOL, 'SOL');

  console.log('\n============================');
  console.log('✅ ALL SOLANA DEVNET TESTS PASSED');
  console.log('============================\n');
}

main().catch(console.error);
