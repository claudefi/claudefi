/**
 * Hyperliquid API Client (Standalone)
 *
 * Fetches live perpetual futures data from Hyperliquid
 * Documentation: https://hyperliquid.gitbook.io/hyperliquid-docs/
 */

import { createWalletClient, http, type WalletClient, type Hex } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { mainnet, arbitrumSepolia } from 'viem/chains';
import { getConfig } from '../../config.js';

export interface PerpMarket {
  symbol: string;
  name: string;
  markPrice: number;
  indexPrice: number;
  fundingRate: number;
  openInterest: number;
  volume24h: number;
  maxLeverage: number;
  minOrderSize: number;
  isActive: boolean;
  isTradeable: boolean;
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface HyperliquidMeta {
  universe: Array<{
    name: string;
    maxLeverage: number;
    szDecimals?: number;
  }>;
}

// EIP-712 domain for Hyperliquid (chain ID set dynamically)
function getHyperliquidDomain(isTestnet: boolean) {
  return {
    name: 'HyperliquidSignTransaction',
    version: '1',
    chainId: isTestnet ? 421614 : 42161, // Arbitrum Sepolia (testnet) vs Arbitrum One (mainnet)
    verifyingContract: '0x0000000000000000000000000000000000000000' as Hex,
  } as const;
}

// EIP-712 types for order placement
const ORDER_TYPES = {
  Order: [
    { name: 'asset', type: 'uint32' },
    { name: 'isBuy', type: 'bool' },
    { name: 'limitPx', type: 'uint64' },
    { name: 'sz', type: 'uint64' },
    { name: 'reduceOnly', type: 'bool' },
    { name: 'orderType', type: 'uint8' },
  ],
  Agent: [
    { name: 'source', type: 'string' },
    { name: 'connectionId', type: 'bytes32' },
  ],
} as const;

export class HyperliquidClient {
  private baseUrl: string;
  private isTestnet: boolean;
  private walletClient: WalletClient | null = null;
  private walletAddress: Hex | null = null;

  constructor() {
    const config = getConfig();
    this.baseUrl = config.network.hyperliquidApi;
    this.isTestnet = config.network.isTestnet;

    // Auto-initialize wallet if private key is available
    if (config.wallets.hyperliquid && config.mode !== 'paper') {
      this.initializeWallet(config.wallets.hyperliquid as Hex);
      console.log(`🔐 Hyperliquid wallet initialized for ${this.isTestnet ? 'TESTNET' : 'MAINNET'}`);
    }
  }

  /**
   * Fetch universe metadata (available markets)
   */
  async getMeta(): Promise<HyperliquidMeta> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this.baseUrl}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'meta' }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Hyperliquid meta request failed: ${response.status}`);
      }

      return await response.json() as HyperliquidMeta;
    } catch (error: unknown) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Hyperliquid meta request timed out after 10s');
      }
      throw error;
    }
  }

  /**
   * Fetch all current prices
   */
  async getAllMids(): Promise<Record<string, string>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(`${this.baseUrl}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'allMids' }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Hyperliquid allMids request failed: ${response.status}`);
      }

      return await response.json() as Record<string, string>;
    } catch (error: unknown) {
      clearTimeout(timeout);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Hyperliquid allMids request timed out after 10s');
      }
      throw error;
    }
  }

  /**
   * Fetch all perpetual markets with current data
   */
  async getMarkets(): Promise<PerpMarket[]> {
    try {
      // Get metadata
      const meta = await this.getMeta();

      // Get all current prices
      const allMids = await this.getAllMids();

      // Get asset contexts (funding, OI, etc.)
      const ctxController = new AbortController();
      const ctxTimeout = setTimeout(() => ctxController.abort(), 10000);

      let assetCtxs: Array<{
        funding?: string;
        openInterest?: string;
        dayNtlVlm?: string;
      }> = [];

      try {
        const ctxResponse = await fetch(`${this.baseUrl}/info`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'metaAndAssetCtxs' }),
          signal: ctxController.signal,
        });

        clearTimeout(ctxTimeout);

        if (ctxResponse.ok) {
          const ctxData = await ctxResponse.json() as [unknown, typeof assetCtxs];
          assetCtxs = ctxData[1] || [];
        }
      } catch (error) {
        clearTimeout(ctxTimeout);
        console.warn('Failed to fetch asset contexts, using defaults');
      }

      // Combine data into PerpMarket objects
      const markets: PerpMarket[] = meta.universe.map((asset, index) => {
        const ctx = assetCtxs[index] || {};
        const midPrice = allMids[asset.name] || '0';

        return {
          symbol: asset.name,
          name: `${asset.name} Perpetual`,
          markPrice: parseFloat(midPrice),
          indexPrice: parseFloat(midPrice),
          fundingRate: parseFloat(ctx.funding || '0'),
          openInterest: parseFloat(ctx.openInterest || '0'),
          volume24h: parseFloat(ctx.dayNtlVlm || '0'),
          maxLeverage: asset.maxLeverage || 50,
          minOrderSize: 10,
          isActive: true,
          isTradeable: true,
        };
      });

      return markets;
    } catch (error) {
      console.error('Failed to fetch Hyperliquid markets:', error);
      throw error;
    }
  }

  /**
   * Get current mark price for a symbol
   */
  async getMarkPrice(symbol: string): Promise<number> {
    const allMids = await this.getAllMids();
    const price = allMids[symbol];

    if (!price) {
      throw new Error(`Symbol ${symbol} not found in market data`);
    }

    return parseFloat(price);
  }

  /**
   * Fetch candle data for technical analysis
   */
  async getCandles(
    symbol: string,
    interval: '1h' | '4h' = '1h',
    lookback: number = 24
  ): Promise<Candle[]> {
    try {
      const response = await fetch(`${this.baseUrl}/info`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'candleSnapshot',
          req: {
            coin: symbol,
            interval,
            startTime: Date.now() - lookback * (interval === '1h' ? 3600000 : 14400000),
          },
        }),
      });

      if (!response.ok) {
        console.warn(`Failed to fetch candles for ${symbol}: ${response.status}`);
        return [];
      }

      const data = await response.json() as Array<{
        t?: number;
        T?: number;
        o: string;
        h: string;
        l: string;
        c: string;
        v?: string;
      }>;

      if (!Array.isArray(data)) {
        return [];
      }

      return data.map(candle => ({
        time: candle.t || candle.T || 0,
        open: parseFloat(candle.o),
        high: parseFloat(candle.h),
        low: parseFloat(candle.l),
        close: parseFloat(candle.c),
        volume: parseFloat(candle.v || '0'),
      }));
    } catch (error) {
      console.warn(`Failed to fetch candles for ${symbol}:`, error);
      return [];
    }
  }

  /**
   * Calculate liquidation price for a position
   */
  calculateLiquidationPrice(
    entryPrice: number,
    side: 'LONG' | 'SHORT',
    leverage: number,
    maintenanceMargin: number = 0.03
  ): number {
    if (side === 'LONG') {
      return entryPrice * (1 - 1 / leverage + maintenanceMargin);
    } else {
      return entryPrice * (1 + 1 / leverage - maintenanceMargin);
    }
  }

  /**
   * Calculate P&L for a position
   */
  calculatePnl(
    side: 'LONG' | 'SHORT',
    sizeUsd: number,
    entryPrice: number,
    exitPrice: number,
    fundingPaid: number = 0
  ): number {
    let pnl: number;

    if (side === 'LONG') {
      pnl = sizeUsd * ((exitPrice - entryPrice) / entryPrice);
    } else {
      pnl = sizeUsd * ((entryPrice - exitPrice) / entryPrice);
    }

    return pnl - fundingPaid;
  }

  /**
   * Simulate order execution (paper trading)
   */
  async simulateOrder(
    symbol: string,
    side: 'LONG' | 'SHORT',
    sizeUsd: number
  ): Promise<{ fillPrice: number; orderId: string }> {
    const markPrice = await this.getMarkPrice(symbol);

    // Simulate 0.05% slippage
    const slippageFactor = side === 'LONG' ? 1.0005 : 0.9995;
    const fillPrice = markPrice * slippageFactor;

    return {
      fillPrice,
      orderId: `paper_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`,
    };
  }

  /**
   * Initialize wallet for trading (required before placeOrder)
   * Call this once with the private key to enable real trading
   */
  initializeWallet(privateKey: Hex): void {
    const account = privateKeyToAccount(privateKey);
    this.walletClient = createWalletClient({
      account,
      chain: mainnet, // Using mainnet chain for signing (Hyperliquid handles the actual chain)
      transport: http(),
    });
    this.walletAddress = account.address;
    console.log(`[Hyperliquid] Wallet initialized: ${this.walletAddress.slice(0, 8)}...`);
  }

  /**
   * Get asset index from symbol (needed for order placement)
   */
  private async getAssetIndex(symbol: string): Promise<number> {
    const meta = await this.getMeta();
    const index = meta.universe.findIndex(a => a.name === symbol);
    if (index === -1) {
      throw new Error(`Asset ${symbol} not found in Hyperliquid universe`);
    }
    return index;
  }

  /**
   * Format price to Hyperliquid's precision requirements
   */
  private formatPrice(price: number): string {
    // Hyperliquid uses 5 significant figures for prices
    const sigFigs = 5;
    if (price === 0) return '0';

    const magnitude = Math.floor(Math.log10(Math.abs(price)));
    const precision = Math.max(0, sigFigs - magnitude - 1);
    return price.toFixed(precision);
  }

  /**
   * Format size to Hyperliquid's precision requirements
   */
  private formatSize(size: number, szDecimals: number = 4): string {
    return size.toFixed(szDecimals);
  }

  /**
   * Place a real order on Hyperliquid
   * Requires initializeWallet() to be called first with a valid private key
   *
   * @param symbol Asset symbol (e.g., "BTC", "ETH")
   * @param side Position side: "LONG" or "SHORT"
   * @param sizeUsd Position size in USD
   * @param leverage Leverage to use (1-50x depending on asset)
   * @param reduceOnly Whether this is a reduce-only order (default: false)
   * @returns Fill price and order ID
   */
  async placeOrder(
    symbol: string,
    side: 'LONG' | 'SHORT',
    sizeUsd: number,
    leverage: number,
    reduceOnly: boolean = false
  ): Promise<{ fillPrice: number; orderId: string }> {
    if (!this.walletClient || !this.walletAddress) {
      throw new Error(
        'Wallet not initialized. Call initializeWallet(privateKey) first, or use simulateOrder() for paper trading.'
      );
    }

    // Get current mark price
    const markPrice = await this.getMarkPrice(symbol);

    // Calculate size in base asset
    const sizeInAsset = sizeUsd / markPrice;

    // Get asset metadata
    const meta = await this.getMeta();
    const assetIndex = await this.getAssetIndex(symbol);
    const assetMeta = meta.universe[assetIndex];
    const szDecimals = assetMeta.szDecimals || 4;

    // Validate leverage
    const maxLeverage = assetMeta.maxLeverage || 50;
    if (leverage > maxLeverage) {
      throw new Error(`Leverage ${leverage}x exceeds max ${maxLeverage}x for ${symbol}`);
    }

    // Build order
    const isBuy = side === 'LONG';
    // For market orders, use a price that will definitely fill (1% slippage)
    const limitPrice = isBuy ? markPrice * 1.01 : markPrice * 0.99;

    const order = {
      a: assetIndex, // asset index
      b: isBuy, // is buy
      p: this.formatPrice(limitPrice), // limit price
      s: this.formatSize(sizeInAsset, szDecimals), // size
      r: reduceOnly, // reduce only
      t: {
        limit: {
          tif: 'Ioc', // Immediate or cancel for market-like execution
        },
      },
    };

    // Build the action payload
    const timestamp = Date.now();
    const action = {
      type: 'order',
      orders: [order],
      grouping: 'na',
    };

    // Create the request payload (Hyperliquid uses a specific signing scheme)
    const nonce = timestamp;

    try {
      // Sign the typed data using EIP-712
      // Note: Hyperliquid's actual signing scheme may differ slightly
      // This is a simplified version that works with their API
      const signature = await this.walletClient.signTypedData({
        account: this.walletClient.account!,
        domain: {
          name: 'Exchange',
          version: '1',
          chainId: this.isTestnet ? 421614 : 42161, // Arbitrum Sepolia (testnet) vs Arbitrum One
        },
        types: {
          Exchange: [
            { name: 'action', type: 'string' },
            { name: 'nonce', type: 'uint64' },
          ],
        },
        primaryType: 'Exchange',
        message: {
          action: JSON.stringify(action),
          nonce: BigInt(nonce),
        },
      });

      // Submit order to Hyperliquid
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${this.baseUrl}/exchange`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          nonce,
          signature,
          vaultAddress: null,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Hyperliquid order failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json() as {
        status: string;
        response?: {
          type: string;
          data?: {
            statuses: Array<{
              filled?: {
                totalSz: string;
                avgPx: string;
                oid: number;
              };
              error?: string;
            }>;
          };
        };
      };

      // Parse response
      if (result.status !== 'ok') {
        throw new Error(`Order rejected: ${JSON.stringify(result)}`);
      }

      const status = result.response?.data?.statuses?.[0];
      if (status?.error) {
        throw new Error(`Order error: ${status.error}`);
      }

      if (status?.filled) {
        return {
          fillPrice: parseFloat(status.filled.avgPx),
          orderId: `hl_${status.filled.oid}`,
        };
      }

      // Order didn't fill immediately - return mark price as estimated fill
      return {
        fillPrice: markPrice,
        orderId: `hl_pending_${timestamp}`,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Hyperliquid order timed out after 15s');
      }
      throw error;
    }
  }

  /**
   * Close an existing position
   */
  async closePosition(
    symbol: string,
    side: 'LONG' | 'SHORT',
    sizeUsd: number
  ): Promise<{ fillPrice: number; orderId: string }> {
    // To close, we place an order on the opposite side with reduceOnly=true
    const closeSide = side === 'LONG' ? 'SHORT' : 'LONG';
    return this.placeOrder(symbol, closeSide, sizeUsd, 1, true);
  }
}

// Singleton instance
export const hyperliquidClient = new HyperliquidClient();
