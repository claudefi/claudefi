/**
 * Spot Tools
 * Memecoin/token trading tools via Jupiter
 * Uses Jupiter Tokens V2 API (preferred) with GeckoTerminal fallback
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import { Keypair } from '@solana/web3.js';
import bs58 from 'bs58';
import { geckoTerminalClient, type TokenInfo } from '../../../clients/geckoterminal/client.js';
import { jupiterClient, TOKENS, type TokenV2, type TokenInterval } from '../../../clients/jupiter/client.js';
import {
  getOpenPositions,
  getDomainBalance,
  createPosition,
  closePosition,
  updateDomainBalance,
  logDecision,
} from '../../../db/index.js';

// Get wallet from environment
function getWallet(): Keypair | null {
  const privateKey = process.env.SOLANA_PRIVATE_KEY;
  if (!privateKey) return null;

  try {
    const decoded = bs58.decode(privateKey);
    return Keypair.fromSecretKey(decoded);
  } catch (error) {
    console.error('Failed to load Solana wallet:', error);
    return null;
  }
}

export const spotTools: Tool[] = [
  {
    name: 'spot_trending_tokens',
    description: `Fetch trending tokens from Jupiter Tokens V2 API.
Returns tokens with: symbol, price, 24h stats, organic score, market cap, liquidity.
Categories: toptrending (most momentum), toptraded (highest volume), toporganicscore (real activity).`,
    inputSchema: {
      type: 'object',
      properties: {
        category: {
          type: 'string',
          enum: ['toptrending', 'toptraded', 'toporganicscore'],
          default: 'toptrending',
          description: 'Token category to fetch',
        },
        interval: {
          type: 'string',
          enum: ['5m', '1h', '6h', '24h'],
          default: '24h',
          description: 'Time interval for stats',
        },
        limit: {
          type: 'number',
          default: 20,
          maximum: 100,
          description: 'Maximum tokens to return (max 100)',
        },
      },
    },
  },
  {
    name: 'spot_recent_tokens',
    description: `Fetch recently created tokens (first pool) from Jupiter.
Shows brand new tokens with their first pool creation time.`,
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'spot_fetch_tokens',
    description: `Fetch trending tokens - uses Jupiter V2 if API key set, otherwise GeckoTerminal.
Returns tokens with: symbol, price, 24h change, volume, liquidity, score.`,
    inputSchema: {
      type: 'object',
      properties: {
        limit: {
          type: 'number',
          default: 20,
          description: 'Maximum number of tokens to return (default: 20)',
        },
        minLiquidity: {
          type: 'number',
          default: 50000,
          description: 'Minimum liquidity in USD (default: $50k)',
        },
        highMomentum: {
          type: 'boolean',
          default: false,
          description: 'Filter for tokens with >20% price change',
        },
      },
    },
  },
  {
    name: 'spot_search_token',
    description: 'Search for a specific token by name, symbol, or mint address. Uses Jupiter V2 if available.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Token name, symbol, or mint address (e.g., "BONK", "dogwifhat")',
        },
      },
      required: ['query'],
    },
  },
  {
    name: 'spot_buy_token',
    description: `Buy a memecoin/token via Jupiter swap.
Uses USDC to swap for the specified token.`,
    inputSchema: {
      type: 'object',
      properties: {
        mint: {
          type: 'string',
          description: 'Token mint address (Solana address)',
        },
        amountUsd: {
          type: 'number',
          minimum: 10,
          description: 'USD amount to spend (minimum $10)',
        },
      },
      required: ['mint', 'amountUsd'],
    },
  },
  {
    name: 'spot_sell_token',
    description: 'Sell a token position back to USDC.',
    inputSchema: {
      type: 'object',
      properties: {
        positionId: {
          type: 'string',
          description: 'Database ID of the position to sell',
        },
        percentage: {
          type: 'number',
          minimum: 1,
          maximum: 100,
          default: 100,
          description: 'Percentage of position to sell (1-100, default: 100)',
        },
      },
      required: ['positionId'],
    },
  },
  {
    name: 'spot_get_positions',
    description: 'Get all open spot token positions with current values.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'spot_get_price',
    description: 'Get current price for a token.',
    inputSchema: {
      type: 'object',
      properties: {
        mint: {
          type: 'string',
          description: 'Token mint address',
        },
      },
      required: ['mint'],
    },
  },
];

// Helper to format TokenV2 for output
function formatTokenV2(token: TokenV2) {
  const priceChange = token.stats24h?.priceChange;
  return {
    symbol: token.symbol,
    name: token.name,
    mint: token.id,
    price: token.usdPrice?.toFixed(8) || 'N/A',
    change24h: priceChange ? `${priceChange > 0 ? '+' : ''}${priceChange.toFixed(1)}%` : 'N/A',
    volume24h: token.stats24h?.buyVolume && token.stats24h?.sellVolume
      ? `$${((token.stats24h.buyVolume + token.stats24h.sellVolume) / 1e6).toFixed(2)}M`
      : 'N/A',
    liquidity: token.liquidity ? `$${token.liquidity.toLocaleString()}` : 'N/A',
    mcap: token.mcap ? `$${(token.mcap / 1e6).toFixed(2)}M` : 'N/A',
    organicScore: token.organicScoreLabel || 'N/A',
    holders: token.holderCount?.toLocaleString() || 'N/A',
    verified: token.isVerified ? '✓' : '✗',
  };
}

export async function handleSpotTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  const paperMode = process.env.PAPER_TRADING !== 'false';
  const hasJupiterKey = jupiterClient.hasApiKey();

  switch (name) {
    // ==========================================
    // JUPITER TOKENS V2 API TOOLS
    // ==========================================
    case 'spot_trending_tokens': {
      if (!hasJupiterKey) {
        return {
          success: false,
          error: 'Jupiter API key required. Get one at https://portal.jup.ag and set JUPITER_API_KEY',
        };
      }

      const category = (args.category as 'toptrending' | 'toptraded' | 'toporganicscore') || 'toptrending';
      const interval = (args.interval as TokenInterval) || '24h';
      const limit = Math.min((args.limit as number) || 20, 100);

      const tokens = await jupiterClient.getTokensByCategory(category, interval, limit);

      if (tokens.length === 0) {
        return {
          success: false,
          error: 'No tokens returned. API key may be invalid.',
        };
      }

      return {
        count: tokens.length,
        category,
        interval,
        source: 'Jupiter Tokens V2 API',
        tokens: tokens.map(formatTokenV2),
        hint: 'Use spot_buy_token with a mint address to purchase a token',
      };
    }

    case 'spot_recent_tokens': {
      if (!hasJupiterKey) {
        return {
          success: false,
          error: 'Jupiter API key required. Get one at https://portal.jup.ag and set JUPITER_API_KEY',
        };
      }

      const tokens = await jupiterClient.getRecentTokens();

      if (tokens.length === 0) {
        return {
          success: false,
          error: 'No recent tokens returned.',
        };
      }

      const formatted = tokens.map(token => ({
        symbol: token.symbol,
        name: token.name,
        mint: token.id,
        price: token.usdPrice?.toFixed(8) || 'N/A',
        liquidity: token.liquidity ? `$${token.liquidity.toLocaleString()}` : 'N/A',
        firstPool: token.firstPool?.createdAt || 'N/A',
        organicScore: token.organicScoreLabel || 'N/A',
        verified: token.isVerified ? '✓' : '✗',
      }));

      return {
        count: formatted.length,
        source: 'Jupiter Tokens V2 API',
        tokens: formatted,
        hint: 'These are brand new tokens - DYOR before trading!',
      };
    }

    // ==========================================
    // LEGACY/FALLBACK TOOLS
    // ==========================================
    case 'spot_fetch_tokens': {
      const limit = (args.limit as number) || 20;
      const minLiquidity = (args.minLiquidity as number) || 50000;
      const highMomentum = args.highMomentum === true;

      // Prefer Jupiter V2 if API key is available
      if (hasJupiterKey) {
        const category = highMomentum ? 'toptrending' : 'toptraded';
        const jupTokens = await jupiterClient.getTokensByCategory(category, '24h', limit * 2);

        const filtered = jupTokens
          .filter(t => (t.liquidity || 0) >= minLiquidity)
          .slice(0, limit)
          .map(formatTokenV2);

        return {
          count: filtered.length,
          source: 'Jupiter Tokens V2 API',
          tokens: filtered,
          hint: 'Use spot_buy_token with a mint address to purchase a token',
        };
      }

      // Fallback to GeckoTerminal if no Jupiter API key
      let tokens: TokenInfo[];

      if (highMomentum) {
        tokens = await geckoTerminalClient.getHighMomentumTokens(20, limit);
      } else {
        tokens = await geckoTerminalClient.getTrendingPools(limit * 2);
      }

      // Filter by minimum liquidity
      const filtered = tokens
        .filter(t => t.liquidity >= minLiquidity)
        .slice(0, limit)
        .map(t => {
          const score = geckoTerminalClient.calculateTokenScore(t);
          return {
            symbol: t.symbol,
            name: t.name,
            mint: t.address,
            price: t.priceUsd.toFixed(8),
            change24h: t.priceChange24h.toFixed(2) + '%',
            volume24h: `$${t.volume24h.toLocaleString()}`,
            liquidity: `$${t.liquidity.toLocaleString()}`,
            buySellRatio: t.buys24h && t.sells24h
              ? (t.buys24h / (t.buys24h + t.sells24h) * 100).toFixed(0) + '%'
              : 'N/A',
            score: score + '/100',
            fdv: `$${(t.fdv / 1e6).toFixed(2)}M`,
          };
        });

      return {
        count: filtered.length,
        source: 'GeckoTerminal API (set JUPITER_API_KEY for better data)',
        tokens: filtered,
        hint: 'Use spot_buy_token with a mint address to purchase a token',
      };
    }

    case 'spot_search_token': {
      const query = args.query as string;

      // Prefer Jupiter V2 if API key is available
      if (hasJupiterKey) {
        const jupTokens = await jupiterClient.searchTokensV2(query);

        if (jupTokens.length > 0) {
          const formatted = jupTokens.slice(0, 10).map(t => ({
            symbol: t.symbol,
            name: t.name,
            mint: t.id,
            price: t.usdPrice?.toFixed(8) || 'N/A',
            mcap: t.mcap ? `$${(t.mcap / 1e6).toFixed(2)}M` : 'N/A',
            liquidity: t.liquidity ? `$${t.liquidity.toLocaleString()}` : 'N/A',
            organicScore: t.organicScoreLabel || 'N/A',
            verified: t.isVerified ? '✓' : '✗',
          }));

          return {
            query,
            count: formatted.length,
            source: 'Jupiter Tokens V2 API',
            tokens: formatted,
          };
        }
      }

      // Fallback to GeckoTerminal
      const tokens = await geckoTerminalClient.searchTokens(query);

      if (tokens.length === 0) {
        return {
          query,
          count: 0,
          message: `No tokens found matching "${query}"`,
        };
      }

      const formatted = tokens.slice(0, 10).map(t => ({
        symbol: t.symbol,
        name: t.name,
        mint: t.address,
        price: t.priceUsd.toFixed(8),
        liquidity: `$${t.liquidity.toLocaleString()}`,
        volume24h: `$${t.volume24h.toLocaleString()}`,
      }));

      return {
        query,
        count: formatted.length,
        source: 'LIVE GeckoTerminal API',
        tokens: formatted,
      };
    }

    case 'spot_buy_token': {
      const mint = args.mint as string;
      const amountUsd = args.amountUsd as number;

      // Validate balance
      const balance = await getDomainBalance('spot');
      if (amountUsd > balance) {
        return {
          success: false,
          error: `Insufficient balance. Have $${balance.toFixed(2)}, need $${amountUsd}`,
        };
      }

      // Check position sizing (max 20% of balance)
      if (amountUsd > balance * 0.2) {
        return {
          success: false,
          error: `Position too large. Max $${(balance * 0.2).toFixed(2)} (20% of balance)`,
        };
      }

      // Check position limit
      const positions = await getOpenPositions('spot');
      if (positions.length >= 3) {
        return {
          success: false,
          error: 'Maximum 3 spot positions allowed. Sell a position first.',
        };
      }

      // Get token info from GeckoTerminal
      const tokenInfo = await geckoTerminalClient.getToken(mint);

      if (paperMode) {
        // Simulate swap via Jupiter
        const simulation = await jupiterClient.simulateSwap({
          inputMint: TOKENS.USDC,
          outputMint: mint,
          amountUsd,
          slippageBps: 100, // 1%
        });

        if (!simulation) {
          return {
            success: false,
            error: 'Failed to get swap quote. Token may have insufficient liquidity.',
          };
        }

        // Get current price from Jupiter
        const price = await jupiterClient.getPrice(mint);
        const tokenAmount = simulation.outputAmountUsd / price;

        const positionId = await createPosition('spot', {
          target: mint,
          targetName: tokenInfo?.symbol || 'UNKNOWN',
          entryValueUsd: amountUsd,
          size: tokenAmount,
          entryPrice: price,
          metadata: {
            token_mint: mint,
            token_symbol: tokenInfo?.symbol || 'UNKNOWN',
            token_name: tokenInfo?.name || mint.slice(0, 8),
            amount: tokenAmount,
            order_id: simulation.orderId,
            price_impact: simulation.priceImpact,
            paperTrade: true,
          },
        });

        // Deduct from balance
        await updateDomainBalance('spot', balance - amountUsd);

        await logDecision('spot', {
          action: 'buy',
          target: tokenInfo?.symbol || mint,
          amountUsd,
          reasoning: `Bought ${tokenAmount.toFixed(4)} ${tokenInfo?.symbol || 'tokens'} at $${price.toFixed(8)}`,
          confidence: 0.7,
        });

        return {
          success: true,
          mode: 'paper',
          positionId,
          mint,
          symbol: tokenInfo?.symbol || 'UNKNOWN',
          tokenAmount: tokenAmount.toFixed(4),
          price: price.toFixed(8),
          amountUsd,
          priceImpact: (simulation.priceImpact * 100).toFixed(2) + '%',
          newBalance: (balance - amountUsd).toFixed(2),
        };
      } else {
        // Real trading - requires Solana wallet
        const wallet = getWallet();
        if (!wallet) {
          return {
            success: false,
            error: 'Real trading requires Solana wallet private key. Set SOLANA_PRIVATE_KEY.',
          };
        }

        // Get token info
        const tokenInfo = await geckoTerminalClient.getToken(mint);

        // Execute real swap via Jupiter
        const result = await jupiterClient.buyToken({
          tokenMint: mint,
          amountUsd,
          wallet,
        });

        if (!result) {
          return {
            success: false,
            error: 'Swap failed. Check wallet balance and token liquidity.',
          };
        }

        // Record position in database
        const positionId = await createPosition('spot', {
          target: mint,
          targetName: tokenInfo?.symbol || 'UNKNOWN',
          entryValueUsd: amountUsd,
          size: result.tokenAmount,
          entryPrice: result.pricePerToken,
          metadata: {
            token_mint: mint,
            token_symbol: tokenInfo?.symbol || 'UNKNOWN',
            token_name: tokenInfo?.name || mint.slice(0, 8),
            amount: result.tokenAmount,
            tx_signature: result.txSignature,
            paperTrade: false,
          },
        });

        // Deduct from balance (for tracking)
        await updateDomainBalance('spot', balance - amountUsd);

        await logDecision('spot', {
          action: 'buy',
          target: tokenInfo?.symbol || mint,
          amountUsd,
          reasoning: `REAL: Bought ${result.tokenAmount.toFixed(4)} ${tokenInfo?.symbol || 'tokens'} at $${result.pricePerToken.toFixed(8)}`,
          confidence: 0.7,
        });

        return {
          success: true,
          mode: 'REAL',
          positionId,
          mint,
          symbol: tokenInfo?.symbol || 'UNKNOWN',
          tokenAmount: result.tokenAmount.toFixed(4),
          price: result.pricePerToken.toFixed(8),
          amountUsd,
          txSignature: result.txSignature,
          solscanUrl: `https://solscan.io/tx/${result.txSignature}`,
          newBalance: (balance - amountUsd).toFixed(2),
        };
      }
    }

    case 'spot_sell_token': {
      const positionId = args.positionId as string;
      const percentage = (args.percentage as number) || 100;

      const positions = await getOpenPositions('spot');
      const position = positions.find(p => p.id === positionId);

      if (!position) {
        return {
          success: false,
          error: `Position ${positionId} not found or already closed`,
        };
      }

      const metadata = position.metadata as Record<string, unknown>;
      const mint = metadata.token_mint as string;
      const symbol = metadata.token_symbol as string;
      const tokenAmount = metadata.amount as number;
      const entryPrice = metadata.entry_price as number;

      // Get current LIVE price
      const currentPrice = await jupiterClient.getPrice(mint);

      if (currentPrice <= 0) {
        return {
          success: false,
          error: 'Could not get current price for token',
        };
      }

      const currentValue = tokenAmount * currentPrice;
      const valueToReturn = currentValue * (percentage / 100);
      const pnl = currentValue - position.entryValueUsd;

      if (paperMode) {
        await closePosition('spot', positionId, {
          currentValueUsd: currentValue,
          realizedPnl: pnl,
          metadata: { exit_price: currentPrice },
        });

        // Return value to balance
        const balance = await getDomainBalance('spot');
        await updateDomainBalance('spot', balance + valueToReturn);

        await logDecision('spot', {
          action: percentage >= 100 ? 'sell' : 'partial_sell',
          target: symbol,
          amountUsd: valueToReturn,
          reasoning: `Sold ${percentage}% of ${symbol}, returned $${valueToReturn.toFixed(2)}, PnL: $${pnl.toFixed(2)}`,
          confidence: 0.8,
        });

        return {
          success: true,
          mode: 'paper',
          positionId,
          symbol,
          percentage,
          exitPrice: currentPrice.toFixed(8),
          valueReturned: valueToReturn.toFixed(2),
          pnl: pnl.toFixed(2),
          pnlPercent: ((pnl / position.entryValueUsd) * 100).toFixed(1) + '%',
          newBalance: (balance + valueToReturn).toFixed(2),
        };
      } else {
        // Real trading - requires Solana wallet
        const wallet = getWallet();
        if (!wallet) {
          return {
            success: false,
            error: 'Real trading requires Solana wallet private key. Set SOLANA_PRIVATE_KEY.',
          };
        }

        // Execute real swap via Jupiter
        const sellAmount = tokenAmount * (percentage / 100);
        const result = await jupiterClient.sellToken({
          tokenMint: mint,
          tokenAmount: sellAmount,
          wallet,
        });

        if (!result) {
          return {
            success: false,
            error: 'Sell failed. Check token balance and liquidity.',
          };
        }

        // Close position in database
        await closePosition('spot', positionId, {
          currentValueUsd: result.usdcReceived,
          realizedPnl: result.usdcReceived - position.entryValueUsd,
          metadata: {
            exit_price: result.pricePerToken,
            tx_signature: result.txSignature,
          },
        });

        // Return value to balance
        const balance = await getDomainBalance('spot');
        await updateDomainBalance('spot', balance + result.usdcReceived);

        const pnl = result.usdcReceived - position.entryValueUsd;

        await logDecision('spot', {
          action: percentage >= 100 ? 'sell' : 'partial_sell',
          target: symbol,
          amountUsd: result.usdcReceived,
          reasoning: `REAL: Sold ${percentage}% of ${symbol}, received $${result.usdcReceived.toFixed(2)}, PnL: $${pnl.toFixed(2)}`,
          confidence: 0.8,
        });

        return {
          success: true,
          mode: 'REAL',
          positionId,
          symbol,
          percentage,
          exitPrice: result.pricePerToken.toFixed(8),
          valueReturned: result.usdcReceived.toFixed(2),
          pnl: pnl.toFixed(2),
          pnlPercent: ((pnl / position.entryValueUsd) * 100).toFixed(1) + '%',
          txSignature: result.txSignature,
          solscanUrl: `https://solscan.io/tx/${result.txSignature}`,
          newBalance: (balance + result.usdcReceived).toFixed(2),
        };
      }
    }

    case 'spot_get_positions': {
      const positions = await getOpenPositions('spot');

      if (positions.length === 0) {
        return {
          count: 0,
          message: 'No open spot positions',
        };
      }

      // Update with live prices
      const positionsWithPrices = await Promise.all(
        positions.map(async p => {
          const meta = p.metadata as Record<string, unknown>;
          const mint = meta.token_mint as string;
          const symbol = meta.token_symbol as string;
          const tokenAmount = meta.amount as number;
          const entryPrice = meta.entry_price as number;

          // Get live price from Jupiter
          const currentPrice = await jupiterClient.getPrice(mint);
          const currentValue = tokenAmount * (currentPrice || entryPrice);
          const pnl = currentValue - p.entryValueUsd;

          return {
            id: p.id,
            symbol,
            mint,
            tokenAmount: tokenAmount?.toFixed(4),
            entryPrice: entryPrice?.toFixed(8),
            currentPrice: currentPrice?.toFixed(8) || 'N/A',
            entryValueUsd: p.entryValueUsd.toFixed(2),
            currentValueUsd: currentValue.toFixed(2),
            pnl: pnl.toFixed(2),
            pnlPercent: ((pnl / p.entryValueUsd) * 100).toFixed(1) + '%',
            openedAt: p.openedAt,
          };
        })
      );

      return {
        count: positions.length,
        source: 'LIVE prices from Jupiter',
        positions: positionsWithPrices,
      };
    }

    case 'spot_get_price': {
      const mint = args.mint as string;

      const price = await jupiterClient.getPrice(mint);

      if (price <= 0) {
        return {
          mint,
          error: 'Could not fetch price. Token may not be tradeable on Jupiter.',
        };
      }

      // Also get token info
      const tokenInfo = await geckoTerminalClient.getToken(mint);

      return {
        mint,
        symbol: tokenInfo?.symbol || 'UNKNOWN',
        name: tokenInfo?.name || 'Unknown',
        price: price.toFixed(8),
        priceUsd: `$${price.toFixed(8)}`,
        source: 'LIVE Jupiter API',
        liquidity: tokenInfo ? `$${tokenInfo.liquidity.toLocaleString()}` : 'N/A',
        volume24h: tokenInfo ? `$${tokenInfo.volume24h.toLocaleString()}` : 'N/A',
      };
    }

    default:
      throw new Error(`Unknown spot tool: ${name}`);
  }
}
