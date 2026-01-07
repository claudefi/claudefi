/**
 * Request Testnet Funds
 * Gets test tokens from Hyperliquid testnet faucet
 */

import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

async function main() {
  const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY as Hex;
  if (!privateKey) {
    console.error('HYPERLIQUID_PRIVATE_KEY not set');
    process.exit(1);
  }

  const account = privateKeyToAccount(privateKey);
  console.log('Hyperliquid Testnet Wallet:', account.address);

  // Check current balance
  console.log('\n📊 Checking current balance...');
  const balanceResponse = await fetch('https://api.hyperliquid-testnet.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'clearinghouseState',
      user: account.address
    })
  });

  const balanceData = await balanceResponse.json() as any;
  const withdrawable = balanceData?.withdrawable || '0';
  console.log('Current USDC balance:', withdrawable);

  if (parseFloat(withdrawable) > 0) {
    console.log('✅ Already have testnet funds!');
    return;
  }

  // Request from faucet
  console.log('\n🚰 Requesting testnet USDC from faucet...');

  // Hyperliquid testnet faucet endpoint
  const faucetResponse = await fetch('https://api.hyperliquid-testnet.xyz/exchange', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: {
        type: 'usdClassTransfer',
        hyperliquidChain: 'Testnet',
        signatureChainId: '0x66eee',
        destination: account.address,
        amount: '10000',  // Request 10k USDC
        time: Date.now(),
      },
      nonce: Date.now(),
      signature: { r: '0x0', s: '0x0', v: 27 }  // Faucet doesn't need real signature
    })
  });

  const faucetResult = await faucetResponse.text();
  console.log('Faucet response:', faucetResult);

  // Alternative: Try the web faucet API
  console.log('\n🔄 Trying alternative faucet method...');
  const altFaucetResponse = await fetch(`https://faucet.hyperliquid-testnet.xyz/drip/${account.address}`, {
    method: 'POST',
  });

  if (altFaucetResponse.ok) {
    const altResult = await altFaucetResponse.text();
    console.log('Alt faucet response:', altResult);
  } else {
    console.log('Alt faucet status:', altFaucetResponse.status);
  }

  // Check balance again
  console.log('\n📊 Re-checking balance...');
  const newBalanceResponse = await fetch('https://api.hyperliquid-testnet.xyz/info', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'clearinghouseState',
      user: account.address
    })
  });

  const newBalanceData = await newBalanceResponse.json() as any;
  const newWithdrawable = newBalanceData?.withdrawable || '0';
  console.log('New USDC balance:', newWithdrawable);

  if (parseFloat(newWithdrawable) > 0) {
    console.log('✅ Successfully got testnet funds!');
  } else {
    console.log('\n⚠️  Automatic faucet failed. Please use the web interface:');
    console.log('1. Go to: https://app.hyperliquid-testnet.xyz/');
    console.log('2. Connect wallet with address:', account.address);
    console.log('3. Click "Faucet" in the top menu');
    console.log('4. Or import this private key to MetaMask and connect');
  }
}

main().catch(console.error);
