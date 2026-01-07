/**
 * Jupiter API Client (Standalone)
 *
 * Fetches quotes and executes swaps on Solana via Jupiter
 * Docs: https://dev.jup.ag/api-reference
 *
 * Endpoints:
 * - Swap API: https://lite-api.jup.ag/swap/v1
 * - Tokens API V2: https://api.jup.ag/tokens/v2 (requires API key)
 * - Price API: https://api.jup.ag/price/v3
 */

import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';

// Well-known token mints
export const TOKENS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  RAY: '4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R',
  PYTH: 'HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3',
} as const;

export interface JupiterQuote {
  inputMint: string;
  inAmount: string;
  outputMint: string;
  outAmount: string;
  otherAmountThreshold: string;
  swapMode: string;
  slippageBps: number;
  priceImpactPct: string;
  routePlan: Array<{
    swapInfo: {
      ammKey: string;
      label: string;
      inputMint: string;
      outputMint: string;
      inAmount: string;
      outAmount: string;
      feeAmount: string;
      feeMint: string;
    };
    percent: number;
  }>;
}

export interface SwapResult {
  txSignature: string;
  inputAmount: number;
  outputAmount: number;
  priceImpact: number;
}

export interface PriceInfo {
  mint: string;
  priceUsd: number;
}

// Tokens API V2 Types
export interface TokenV2Stats {
  priceChange?: number;
  holderChange?: number;
  liquidityChange?: number;
  buyVolume?: number;
  sellVolume?: number;
  numBuys?: number;
  numSells?: number;
  numTraders?: number;
}

export interface TokenV2Audit {
  mintAuthority?: string | null;
  freezeAuthority?: string | null;
  topHoldersPct?: number;
}

export interface TokenV2 {
  id: string; // mint address
  name: string;
  symbol: string;
  decimals: number;
  icon?: string;
  twitter?: string;
  telegram?: string;
  website?: string;
  dev?: string;
  circSupply?: number;
  totalSupply?: number;
  tokenProgram?: string;
  usdPrice?: number;
  fdv?: number;
  mcap?: number;
  liquidity?: number;
  holderCount?: number;
  stats5m?: TokenV2Stats;
  stats1h?: TokenV2Stats;
  stats6h?: TokenV2Stats;
  stats24h?: TokenV2Stats;
  audit?: TokenV2Audit;
  organicScore?: number;
  organicScoreLabel?: string;
  isVerified?: boolean;
  cexes?: string[];
  tags?: string[];
  firstPool?: { id: string; createdAt: string };
  updatedAt?: string;
}

export type TokenCategory = 'toporganicscore' | 'toptraded' | 'toptrending';
export type TokenInterval = '5m' | '1h' | '6h' | '24h';

export class JupiterClient {
  // Jupiter lite-api (replacing deprecated quote-api.jup.ag)
  private quoteApiUrl = 'https://lite-api.jup.ag/swap/v1';
  private priceUrlV3 = 'https://api.jup.ag/price/v3';
  private tokensApiV2 = 'https://api.jup.ag/tokens/v2';
  private connection: Connection;
  private apiKey: string | undefined;

  constructor(rpcUrl: string = 'https://api.mainnet-beta.solana.com') {
    this.connection = new Connection(rpcUrl, 'confirmed');
    this.apiKey = process.env.JUPITER_API_KEY;
  }

  /**
   * Check if API key is available for Tokens V2 API
   */
  hasApiKey(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get price for a token in USD
   * Uses Jupiter v3 API if API key is configured, falls back to DexScreener
   */
  async getPrice(mint: string): Promise<number> {
    // If we have a Jupiter API key, use v3 API (most reliable)
    if (this.apiKey) {
      try {
        const url = `${this.priceUrlV3}?ids=${mint}`;
        const response = await fetch(url, {
          headers: { 'x-api-key': this.apiKey },
        });

        if (response.ok) {
          const data = await response.json() as Record<string, { usdPrice: number }>;
          if (data[mint]?.usdPrice) {
            return data[mint].usdPrice;
          }
        }
      } catch {
        // Jupiter v3 failed, try DexScreener
      }
    }

    // DexScreener fallback (free, no auth required)
    try {
      const dexUrl = `https://api.dexscreener.com/latest/dex/tokens/${mint}`;
      const dexResponse = await fetch(dexUrl);

      if (dexResponse.ok) {
        const dexData = await dexResponse.json() as {
          pairs?: Array<{ priceUsd: string }>;
        };

        if (dexData.pairs && dexData.pairs.length > 0) {
          return parseFloat(dexData.pairs[0].priceUsd || '0');
        }
      }
    } catch {
      // DexScreener failed
    }

    return 0;
  }

  /**
   * Get prices for multiple tokens
   * Uses Jupiter v3 API if API key is configured, falls back to individual DexScreener calls
   */
  async getPrices(mints: string[]): Promise<Map<string, number>> {
    const prices = new Map<string, number>();

    // If we have a Jupiter API key, use v3 API for batch lookup
    if (this.apiKey) {
      try {
        const url = `${this.priceUrlV3}?ids=${mints.join(',')}`;
        const response = await fetch(url, {
          headers: { 'x-api-key': this.apiKey },
        });

        if (response.ok) {
          const data = await response.json() as Record<string, { usdPrice: number }>;
          for (const mint of mints) {
            if (data[mint]?.usdPrice) {
              prices.set(mint, data[mint].usdPrice);
            }
          }
          // If we got all prices, return
          if (prices.size === mints.length) {
            return prices;
          }
        }
      } catch {
        // Jupiter v3 failed, fall through to DexScreener
      }
    }

    // Fallback: fetch remaining prices individually via DexScreener
    const missingMints = mints.filter(m => !prices.has(m));
    for (const mint of missingMints) {
      const price = await this.getPrice(mint);
      prices.set(mint, price);
    }

    return prices;
  }

  /**
   * Get swap quote
   */
  async getQuote(params: {
    inputMint: string;
    outputMint: string;
    amount: number; // In lamports/smallest unit
    slippageBps?: number; // Default 50 (0.5%)
  }): Promise<JupiterQuote | null> {
    try {
      const { inputMint, outputMint, amount, slippageBps = 50 } = params;

      const url = `${this.quoteApiUrl}/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}`;

      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Jupiter Quote API error: ${response.status}`);
      }

      return await response.json() as JupiterQuote;
    } catch (error) {
      console.error('Failed to get quote:', error);
      return null;
    }
  }

  /**
   * Get quote in USD terms (easier to use)
   */
  async getQuoteUsd(params: {
    inputMint: string;
    outputMint: string;
    amountUsd: number;
    slippageBps?: number;
  }): Promise<{
    quote: JupiterQuote;
    inputAmountUsd: number;
    outputAmountUsd: number;
    priceImpact: number;
  } | null> {
    try {
      const { inputMint, outputMint, amountUsd, slippageBps = 50 } = params;

      // Get input token price
      const inputPrice = await this.getPrice(inputMint);
      if (inputPrice <= 0) {
        throw new Error(`Could not get price for ${inputMint}`);
      }

      // Calculate amount in token units
      // For SOL: 9 decimals, for most SPL tokens: 6 decimals
      const decimals = inputMint === TOKENS.SOL ? 9 : 6;
      const tokenAmount = amountUsd / inputPrice;
      const lamports = Math.floor(tokenAmount * Math.pow(10, decimals));

      // Get quote
      const quote = await this.getQuote({
        inputMint,
        outputMint,
        amount: lamports,
        slippageBps,
      });

      if (!quote) {
        return null;
      }

      // Get output token price
      const outputPrice = await this.getPrice(outputMint);
      const outputDecimals = outputMint === TOKENS.SOL ? 9 : 6;
      const outputTokens = parseInt(quote.outAmount) / Math.pow(10, outputDecimals);

      return {
        quote,
        inputAmountUsd: amountUsd,
        outputAmountUsd: outputTokens * outputPrice,
        priceImpact: parseFloat(quote.priceImpactPct) || 0,
      };
    } catch (error) {
      console.error('Failed to get USD quote:', error);
      return null;
    }
  }

  /**
   * Execute a swap (REAL TRADING)
   * Requires a funded wallet with private key
   */
  async executeSwap(
    quote: JupiterQuote,
    wallet: Keypair
  ): Promise<SwapResult | null> {
    try {
      // Get swap transaction
      const swapResponse = await fetch(`${this.quoteApiUrl}/swap`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quoteResponse: quote,
          userPublicKey: wallet.publicKey.toString(),
          wrapAndUnwrapSol: true,
          dynamicComputeUnitLimit: true,
          prioritizationFeeLamports: 'auto',
        }),
      });

      if (!swapResponse.ok) {
        const errorText = await swapResponse.text();
        throw new Error(`Jupiter Swap API error: ${swapResponse.status} - ${errorText}`);
      }

      const swapData = await swapResponse.json() as { swapTransaction: string };

      // Deserialize transaction
      const swapTransactionBuf = Buffer.from(swapData.swapTransaction, 'base64');
      const transaction = VersionedTransaction.deserialize(swapTransactionBuf);

      // Sign transaction
      transaction.sign([wallet]);

      // Execute transaction
      const latestBlockHash = await this.connection.getLatestBlockhash();

      const txSignature = await this.connection.sendTransaction(transaction, {
        skipPreflight: true,
        maxRetries: 2,
      });

      // Confirm transaction
      await this.connection.confirmTransaction(
        {
          blockhash: latestBlockHash.blockhash,
          lastValidBlockHeight: latestBlockHash.lastValidBlockHeight,
          signature: txSignature,
        },
        'confirmed'
      );

      // Calculate amounts
      const inputDecimals = quote.inputMint === TOKENS.SOL ? 9 : 6;
      const outputDecimals = quote.outputMint === TOKENS.SOL ? 9 : 6;

      return {
        txSignature,
        inputAmount: parseInt(quote.inAmount) / Math.pow(10, inputDecimals),
        outputAmount: parseInt(quote.outAmount) / Math.pow(10, outputDecimals),
        priceImpact: parseFloat(quote.priceImpactPct) || 0,
      };
    } catch (error) {
      console.error('Failed to execute swap:', error);
      return null;
    }
  }

  /**
   * Simulate a swap (PAPER TRADING)
   * Returns what the trade would look like without executing
   */
  async simulateSwap(params: {
    inputMint: string;
    outputMint: string;
    amountUsd: number;
    slippageBps?: number;
  }): Promise<{
    orderId: string;
    inputMint: string;
    outputMint: string;
    inputAmountUsd: number;
    outputAmountUsd: number;
    priceImpact: number;
    executionPrice: number;
  } | null> {
    const quoteResult = await this.getQuoteUsd(params);

    if (!quoteResult) {
      return null;
    }

    // Simulate 0.1% additional slippage for paper trading realism
    const simulatedSlippage = 0.001;
    const adjustedOutput = quoteResult.outputAmountUsd * (1 - simulatedSlippage);

    return {
      orderId: `paper_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      inputMint: params.inputMint,
      outputMint: params.outputMint,
      inputAmountUsd: quoteResult.inputAmountUsd,
      outputAmountUsd: adjustedOutput,
      priceImpact: quoteResult.priceImpact,
      executionPrice: adjustedOutput / quoteResult.inputAmountUsd,
    };
  }

  /**
   * Buy a token with USDC (paper or real)
   */
  async buyToken(params: {
    tokenMint: string;
    amountUsd: number;
    wallet?: Keypair; // If provided, executes real trade
  }): Promise<{
    success: boolean;
    orderId: string;
    tokenAmount: number;
    pricePerToken: number;
    totalCostUsd: number;
    txSignature?: string;
  } | null> {
    const { tokenMint, amountUsd, wallet } = params;

    if (wallet) {
      // Real trading
      const quote = await this.getQuote({
        inputMint: TOKENS.USDC,
        outputMint: tokenMint,
        amount: Math.floor(amountUsd * 1e6), // USDC has 6 decimals
        slippageBps: 100, // 1% slippage for safety
      });

      if (!quote) {
        return null;
      }

      const result = await this.executeSwap(quote, wallet);

      if (!result) {
        return null;
      }

      return {
        success: true,
        orderId: result.txSignature,
        tokenAmount: result.outputAmount,
        pricePerToken: amountUsd / result.outputAmount,
        totalCostUsd: amountUsd,
        txSignature: result.txSignature,
      };
    } else {
      // Paper trading
      const simulation = await this.simulateSwap({
        inputMint: TOKENS.USDC,
        outputMint: tokenMint,
        amountUsd,
        slippageBps: 100,
      });

      if (!simulation) {
        return null;
      }

      // Get output token amount
      const tokenPrice = await this.getPrice(tokenMint);
      const tokenAmount = simulation.outputAmountUsd / tokenPrice;

      return {
        success: true,
        orderId: simulation.orderId,
        tokenAmount,
        pricePerToken: amountUsd / tokenAmount,
        totalCostUsd: amountUsd,
      };
    }
  }

  /**
   * Sell a token for USDC (paper or real)
   */
  async sellToken(params: {
    tokenMint: string;
    tokenAmount: number;
    wallet?: Keypair; // If provided, executes real trade
  }): Promise<{
    success: boolean;
    orderId: string;
    usdcReceived: number;
    pricePerToken: number;
    txSignature?: string;
  } | null> {
    const { tokenMint, tokenAmount, wallet } = params;

    // Get token decimals (assume 6 for most SPL tokens)
    const decimals = tokenMint === TOKENS.SOL ? 9 : 6;
    const lamports = Math.floor(tokenAmount * Math.pow(10, decimals));

    if (wallet) {
      // Real trading
      const quote = await this.getQuote({
        inputMint: tokenMint,
        outputMint: TOKENS.USDC,
        amount: lamports,
        slippageBps: 100,
      });

      if (!quote) {
        return null;
      }

      const result = await this.executeSwap(quote, wallet);

      if (!result) {
        return null;
      }

      return {
        success: true,
        orderId: result.txSignature,
        usdcReceived: result.outputAmount,
        pricePerToken: result.outputAmount / tokenAmount,
        txSignature: result.txSignature,
      };
    } else {
      // Paper trading
      const tokenPrice = await this.getPrice(tokenMint);
      const amountUsd = tokenAmount * tokenPrice;

      const simulation = await this.simulateSwap({
        inputMint: tokenMint,
        outputMint: TOKENS.USDC,
        amountUsd,
        slippageBps: 100,
      });

      if (!simulation) {
        return null;
      }

      return {
        success: true,
        orderId: simulation.orderId,
        usdcReceived: simulation.outputAmountUsd,
        pricePerToken: simulation.outputAmountUsd / tokenAmount,
      };
    }
  }

  /**
   * Get SOL balance for a wallet
   */
  async getSolBalance(publicKey: string): Promise<number> {
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const balance = await this.connection.getBalance(new PublicKey(publicKey));
      return balance / 1e9; // Convert lamports to SOL
    } catch (error) {
      console.error('Failed to get SOL balance:', error);
      return 0;
    }
  }

  /**
   * Get token balance for a wallet
   */
  async getTokenBalance(publicKey: string, tokenMint: string): Promise<number> {
    try {
      const { PublicKey } = await import('@solana/web3.js');
      const { getAssociatedTokenAddress, getAccount } = await import('@solana/spl-token');

      const walletPubkey = new PublicKey(publicKey);
      const mintPubkey = new PublicKey(tokenMint);

      const tokenAccount = await getAssociatedTokenAddress(mintPubkey, walletPubkey);

      try {
        const account = await getAccount(this.connection, tokenAccount);
        const decimals = tokenMint === TOKENS.SOL ? 9 : 6;
        return Number(account.amount) / Math.pow(10, decimals);
      } catch {
        // Token account doesn't exist
        return 0;
      }
    } catch (error) {
      console.error(`Failed to get token balance for ${tokenMint}:`, error);
      return 0;
    }
  }

  // ============================================================
  // TOKENS API V2 (requires API key from portal.jup.ag)
  // ============================================================

  /**
   * Search tokens by symbol, name, or mint address
   * Requires JUPITER_API_KEY
   * @param query - Search query (symbol, name, or comma-separated mint addresses, max 100)
   * @returns Up to 20 results for symbol/name searches
   */
  async searchTokensV2(query: string): Promise<TokenV2[]> {
    if (!this.apiKey) {
      console.warn('Jupiter Tokens V2 API requires API key. Get one at https://portal.jup.ag');
      return [];
    }

    try {
      const url = `${this.tokensApiV2}/search?query=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { 'x-api-key': this.apiKey },
      });

      if (!response.ok) {
        throw new Error(`Jupiter Tokens V2 search failed: ${response.status}`);
      }

      return await response.json() as TokenV2[];
    } catch (error) {
      console.error('Failed to search tokens:', error);
      return [];
    }
  }

  /**
   * Get tokens by category (top trending, top traded, etc.)
   * Requires JUPITER_API_KEY
   * @param category - 'toporganicscore' | 'toptraded' | 'toptrending'
   * @param interval - '5m' | '1h' | '6h' | '24h'
   * @param limit - Max results (default 50, max 100)
   */
  async getTokensByCategory(
    category: TokenCategory,
    interval: TokenInterval = '24h',
    limit: number = 50
  ): Promise<TokenV2[]> {
    if (!this.apiKey) {
      console.warn('Jupiter Tokens V2 API requires API key. Get one at https://portal.jup.ag');
      return [];
    }

    try {
      const url = `${this.tokensApiV2}/${category}/${interval}?limit=${Math.min(limit, 100)}`;
      const response = await fetch(url, {
        headers: { 'x-api-key': this.apiKey },
      });

      if (!response.ok) {
        throw new Error(`Jupiter Tokens V2 category failed: ${response.status}`);
      }

      return await response.json() as TokenV2[];
    } catch (error) {
      console.error('Failed to get tokens by category:', error);
      return [];
    }
  }

  /**
   * Get recently created tokens (first pool)
   * Requires JUPITER_API_KEY
   * @returns Array of tokens that recently had their first pool created
   */
  async getRecentTokens(): Promise<TokenV2[]> {
    if (!this.apiKey) {
      console.warn('Jupiter Tokens V2 API requires API key. Get one at https://portal.jup.ag');
      return [];
    }

    try {
      const url = `${this.tokensApiV2}/recent`;
      const response = await fetch(url, {
        headers: { 'x-api-key': this.apiKey },
      });

      if (!response.ok) {
        throw new Error(`Jupiter Tokens V2 recent failed: ${response.status}`);
      }

      return await response.json() as TokenV2[];
    } catch (error) {
      console.error('Failed to get recent tokens:', error);
      return [];
    }
  }

  /**
   * Get top trending tokens (convenience method)
   */
  async getTrendingTokens(interval: TokenInterval = '24h', limit: number = 20): Promise<TokenV2[]> {
    return this.getTokensByCategory('toptrending', interval, limit);
  }

  /**
   * Get top traded tokens (convenience method)
   */
  async getTopTradedTokens(interval: TokenInterval = '24h', limit: number = 20): Promise<TokenV2[]> {
    return this.getTokensByCategory('toptraded', interval, limit);
  }
}

// Singleton instance
export const jupiterClient = new JupiterClient();
