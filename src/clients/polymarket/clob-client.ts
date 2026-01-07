/**
 * Polymarket CLOB Client
 *
 * Real trading via the official Polymarket CLOB API
 * Docs: https://docs.polymarket.com/developers/CLOB/quickstart
 */

import { ClobClient, Side, OrderType } from '@polymarket/clob-client';
import { Wallet } from 'ethers';
import { getConfig } from '../../config.js';

export interface PolymarketOrder {
  orderId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  filledSize?: number;
  status: string;
}

export interface PolymarketTrade {
  orderId: string;
  tokenId: string;
  side: 'BUY' | 'SELL';
  price: number;
  size: number;
  cost: number;
  txHash?: string;
}

export class PolymarketClobClient {
  private client: ClobClient | null = null;
  private wallet: Wallet | null = null;
  private isInitialized = false;

  // Polygon mainnet
  private readonly HOST = 'https://clob.polymarket.com';
  private readonly CHAIN_ID = 137;

  constructor() {
    const config = getConfig();

    // Auto-initialize if private key is available and not in paper mode
    if (config.wallets.polymarket && config.mode !== 'paper') {
      this.initializeWallet(config.wallets.polymarket);
    }
  }

  /**
   * Check if client is ready for trading
   */
  isReady(): boolean {
    return this.isInitialized && this.client !== null;
  }

  /**
   * Initialize wallet and derive API credentials
   * Must be called before placing orders
   */
  async initializeWallet(privateKey: string): Promise<void> {
    try {
      // Create wallet from private key
      this.wallet = new Wallet(privateKey);
      console.log(`[Polymarket] Wallet: ${this.wallet.address.slice(0, 10)}...`);

      // Create temporary client to derive API credentials
      const tempClient = new ClobClient(this.HOST, this.CHAIN_ID, this.wallet);

      // Derive or create API credentials
      const apiCreds = await tempClient.createOrDeriveApiKey();
      console.log('[Polymarket] API credentials derived');

      // Create authenticated client with signature type 0 (EOA wallet)
      this.client = new ClobClient(
        this.HOST,
        this.CHAIN_ID,
        this.wallet,
        apiCreds,
        0 // Signature type for standard EOA wallets
      );

      this.isInitialized = true;
      console.log('[Polymarket] CLOB client initialized successfully');
    } catch (error) {
      console.error('[Polymarket] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Get wallet address
   */
  getWalletAddress(): string | null {
    return this.wallet?.address || null;
  }

  /**
   * Buy outcome shares (YES or NO)
   *
   * @param tokenId - The token ID for the outcome (YES or NO token)
   * @param price - Price per share (0.01 to 0.99)
   * @param size - Number of shares to buy
   */
  async buyShares(
    tokenId: string,
    price: number,
    size: number
  ): Promise<PolymarketTrade> {
    if (!this.client) {
      throw new Error('Client not initialized. Call initializeWallet() first.');
    }

    try {
      const response = await this.client.createAndPostOrder({
        tokenID: tokenId,
        price,
        size,
        side: Side.BUY,
      });

      return {
        orderId: response.orderID || `poly_${Date.now()}`,
        tokenId,
        side: 'BUY',
        price,
        size,
        cost: price * size,
        txHash: response.transactionHashes?.[0],
      };
    } catch (error) {
      console.error('[Polymarket] Buy order failed:', error);
      throw error;
    }
  }

  /**
   * Sell outcome shares
   *
   * @param tokenId - The token ID for the outcome
   * @param price - Price per share
   * @param size - Number of shares to sell
   */
  async sellShares(
    tokenId: string,
    price: number,
    size: number
  ): Promise<PolymarketTrade> {
    if (!this.client) {
      throw new Error('Client not initialized. Call initializeWallet() first.');
    }

    try {
      const response = await this.client.createAndPostOrder({
        tokenID: tokenId,
        price,
        size,
        side: Side.SELL,
      });

      return {
        orderId: response.orderID || `poly_${Date.now()}`,
        tokenId,
        side: 'SELL',
        price,
        size,
        cost: price * size,
        txHash: response.transactionHashes?.[0],
      };
    } catch (error) {
      console.error('[Polymarket] Sell order failed:', error);
      throw error;
    }
  }

  /**
   * Cancel an open order
   */
  async cancelOrder(orderId: string): Promise<boolean> {
    if (!this.client) {
      throw new Error('Client not initialized.');
    }

    try {
      await this.client.cancelOrder({ orderID: orderId } as any);
      return true;
    } catch (error) {
      console.error('[Polymarket] Cancel order failed:', error);
      return false;
    }
  }

  /**
   * Cancel all open orders
   */
  async cancelAllOrders(): Promise<boolean> {
    if (!this.client) {
      throw new Error('Client not initialized.');
    }

    try {
      await this.client.cancelAll();
      return true;
    } catch (error) {
      console.error('[Polymarket] Cancel all orders failed:', error);
      return false;
    }
  }

  /**
   * Get open orders
   */
  async getOpenOrders(): Promise<PolymarketOrder[]> {
    if (!this.client) {
      throw new Error('Client not initialized.');
    }

    try {
      const orders = await this.client.getOpenOrders();
      return orders.map((o: any) => ({
        orderId: o.id,
        tokenId: o.asset_id,
        side: o.side === 'BUY' ? 'BUY' : 'SELL',
        price: parseFloat(o.price),
        size: parseFloat(o.original_size),
        filledSize: parseFloat(o.size_matched || '0'),
        status: o.status,
      }));
    } catch (error) {
      console.error('[Polymarket] Get open orders failed:', error);
      return [];
    }
  }

  /**
   * Simulate order (for paper trading consistency)
   */
  simulateOrder(
    tokenId: string,
    side: 'BUY' | 'SELL',
    price: number,
    size: number
  ): PolymarketTrade {
    return {
      orderId: `paper_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      tokenId,
      side,
      price,
      size,
      cost: price * size,
    };
  }
}

// Singleton instance
export const polymarketClobClient = new PolymarketClobClient();
