/**
 * Claudefi Configuration
 * Centralized config for trading modes and network selection
 */

export type TradingMode = 'paper' | 'testnet' | 'mainnet';

export interface NetworkConfig {
  solanaRpc: string;
  hyperliquidApi: string;
  hyperliquidWs: string;
  isTestnet: boolean;
}

export interface TradingConfig {
  mode: TradingMode;
  isPaperTrading: boolean;
  isTestnet: boolean;
  isMainnet: boolean;
  network: NetworkConfig;
  wallets: {
    solana: string | null;
    hyperliquid: string | null;
    polymarket: string | null;
  };
}

/**
 * Get trading mode from environment
 * Supports both new TRADING_MODE and legacy PAPER_TRADING
 */
function getTradingMode(): TradingMode {
  const tradingMode = process.env.TRADING_MODE?.toLowerCase();

  if (tradingMode === 'testnet') return 'testnet';
  if (tradingMode === 'mainnet') return 'mainnet';
  if (tradingMode === 'paper') return 'paper';

  // Legacy support: check PAPER_TRADING
  const paperTrading = process.env.PAPER_TRADING?.toLowerCase();
  if (paperTrading === 'false') {
    console.warn('⚠️  PAPER_TRADING=false is deprecated. Use TRADING_MODE=mainnet instead.');
    return 'mainnet';
  }

  // Default to paper trading for safety
  return 'paper';
}

/**
 * Get network configuration based on trading mode
 */
function getNetworkConfig(mode: TradingMode): NetworkConfig {
  if (mode === 'testnet') {
    return {
      solanaRpc: process.env.SOLANA_DEVNET_RPC || 'https://api.devnet.solana.com',
      hyperliquidApi: 'https://api.hyperliquid-testnet.xyz',
      hyperliquidWs: 'wss://api.hyperliquid-testnet.xyz/ws',
      isTestnet: true,
    };
  }

  // Mainnet (and paper mode uses mainnet for price data)
  return {
    solanaRpc: process.env.SOLANA_MAINNET_RPC || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com',
    hyperliquidApi: 'https://api.hyperliquid.xyz',
    hyperliquidWs: 'wss://api.hyperliquid.xyz/ws',
    isTestnet: false,
  };
}

/**
 * Get the current trading configuration
 */
export function getConfig(): TradingConfig {
  const mode = getTradingMode();
  const network = getNetworkConfig(mode);

  return {
    mode,
    isPaperTrading: mode === 'paper',
    isTestnet: mode === 'testnet',
    isMainnet: mode === 'mainnet',
    network,
    wallets: {
      solana: process.env.SOLANA_PRIVATE_KEY || null,
      hyperliquid: process.env.HYPERLIQUID_PRIVATE_KEY || null,
      polymarket: process.env.POLYMARKET_PRIVATE_KEY || null,
    },
  };
}

/**
 * Validate configuration and log warnings
 */
export function validateConfig(): { valid: boolean; warnings: string[]; errors: string[] } {
  const config = getConfig();
  const warnings: string[] = [];
  const errors: string[] = [];

  // Check wallet requirements for non-paper modes
  if (config.mode !== 'paper') {
    if (!config.wallets.solana) {
      errors.push('SOLANA_PRIVATE_KEY required for testnet/mainnet trading');
    }
    if (!config.wallets.hyperliquid) {
      warnings.push('HYPERLIQUID_PRIVATE_KEY not set - perps trading disabled');
    }
  }

  // Mainnet warnings
  if (config.mode === 'mainnet') {
    warnings.push('🚨 MAINNET MODE - Real money at risk!');
  }

  // Testnet info
  if (config.mode === 'testnet') {
    warnings.push('📋 Testnet mode - Get tokens from faucets (see .env for links)');
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}

/**
 * Log current configuration on startup
 */
export function logConfig(): void {
  const config = getConfig();
  const validation = validateConfig();

  console.log('\n╔══════════════════════════════════════════════════════════╗');
  console.log('║                   CLAUDEFI CONFIGURATION                  ║');
  console.log('╠══════════════════════════════════════════════════════════╣');

  const modeEmoji = config.mode === 'paper' ? '📝' : config.mode === 'testnet' ? '🧪' : '💰';
  console.log(`║  Trading Mode: ${modeEmoji} ${config.mode.toUpperCase().padEnd(40)}║`);
  console.log(`║  Network:      ${config.network.isTestnet ? 'TESTNET' : 'MAINNET'.padEnd(43)}║`);

  // Show wallet status
  const solanaStatus = config.wallets.solana ? '✅ Configured' : '❌ Not set';
  const hlStatus = config.wallets.hyperliquid ? '✅ Configured' : '❌ Not set';
  const polyStatus = config.wallets.polymarket ? '✅ Configured' : '❌ Not set';
  console.log(`║  Solana Wallet:     ${solanaStatus.padEnd(36)}║`);
  console.log(`║  Hyperliquid Wallet: ${hlStatus.padEnd(35)}║`);
  console.log(`║  Polymarket Wallet:  ${polyStatus.padEnd(35)}║`);

  console.log('╠══════════════════════════════════════════════════════════╣');

  // Show warnings
  for (const warning of validation.warnings) {
    console.log(`║  ⚠️  ${warning.substring(0, 52).padEnd(52)}║`);
  }

  // Show errors
  for (const error of validation.errors) {
    console.log(`║  ❌ ${error.substring(0, 52).padEnd(52)}║`);
  }

  console.log('╚══════════════════════════════════════════════════════════╝\n');

  // If testnet, show faucet reminder
  if (config.mode === 'testnet') {
    console.log('📋 TESTNET FAUCETS:');
    console.log('   Solana: https://faucet.solana.com/');
    console.log('   Hyperliquid: https://app.hyperliquid-testnet.xyz/ (click Faucet)');
    console.log('   Solana USDC: https://spl-token-faucet.com/\n');
  }
}

// Export singleton config
export const config = getConfig();
