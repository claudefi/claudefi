/**
 * GeckoTerminal API Client (Standalone)
 *
 * Fetches live token data from GeckoTerminal
 * Docs: https://www.geckoterminal.com/dex-api
 */

export interface GeckoPool {
  id: string;
  type: string;
  attributes: {
    name: string;
    address: string;
    base_token_price_usd: string;
    quote_token_price_usd: string;
    base_token_price_native_currency: string;
    quote_token_price_native_currency: string;
    pool_created_at: string;
    fdv_usd: string;
    market_cap_usd: string | null;
    price_change_percentage: {
      h1: string;
      h24: string;
    };
    transactions: {
      h1: { buys: number; sells: number };
      h24: { buys: number; sells: number };
    };
    volume_usd: {
      h1: string;
      h24: string;
    };
    reserve_in_usd: string;
  };
  relationships: {
    base_token: { data: { id: string } };
    quote_token: { data: { id: string } };
    dex: { data: { id: string } };
  };
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  priceUsd: number;
  volume24h: number;
  liquidity: number;
  priceChange24h: number;
  fdv: number;
  marketCap: number | null;
  gtScore: number | null;
  buys24h: number;
  sells24h: number;
  poolAddress: string;
}

export interface GeckoTokenResponse {
  data: {
    id: string;
    type: string;
    attributes: {
      address: string;
      name: string;
      symbol: string;
      coingecko_coin_id: string | null;
      decimals: number;
      total_supply: string;
      price_usd: string;
      fdv_usd: string;
      total_reserve_in_usd: string;
      volume_usd: { h24: string };
      market_cap_usd: string | null;
      gt_score: number | null;
    };
  };
}

export class GeckoTerminalClient {
  private baseUrl = 'https://api.geckoterminal.com/api/v2';
  private network = 'solana';

  /**
   * Get trending pools on Solana
   */
  async getTrendingPools(limit: number = 20): Promise<TokenInfo[]> {
    try {
      const url = `${this.baseUrl}/networks/${this.network}/trending_pools?page=1`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; Claudefi/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`GeckoTerminal API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json() as { data: GeckoPool[] };
      const pools = data.data || [];

      return pools.slice(0, limit).map((pool) => this.parsePoolToToken(pool));
    } catch (error) {
      console.error('Failed to fetch trending pools:', error);
      return [];
    }
  }

  /**
   * Get new pools on Solana (recently created)
   */
  async getNewPools(limit: number = 20): Promise<TokenInfo[]> {
    try {
      const url = `${this.baseUrl}/networks/${this.network}/new_pools?page=1`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'Mozilla/5.0 (compatible; Claudefi/1.0)',
        },
      });

      if (!response.ok) {
        throw new Error(`GeckoTerminal API error: ${response.status}`);
      }

      const data = await response.json() as { data: GeckoPool[] };
      const pools = data.data || [];

      return pools.slice(0, limit).map((pool) => this.parsePoolToToken(pool));
    } catch (error) {
      console.error('Failed to fetch new pools:', error);
      return [];
    }
  }

  /**
   * Get token info by address
   */
  async getToken(address: string): Promise<TokenInfo | null> {
    try {
      const url = `${this.baseUrl}/networks/${this.network}/tokens/${address}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`GeckoTerminal API error: ${response.status}`);
      }

      const data = await response.json() as GeckoTokenResponse;
      const token = data.data;

      return {
        address: token.attributes.address,
        symbol: token.attributes.symbol,
        name: token.attributes.name,
        priceUsd: parseFloat(token.attributes.price_usd) || 0,
        volume24h: parseFloat(token.attributes.volume_usd?.h24) || 0,
        liquidity: parseFloat(token.attributes.total_reserve_in_usd) || 0,
        priceChange24h: 0, // Not available in token endpoint
        fdv: parseFloat(token.attributes.fdv_usd) || 0,
        marketCap: token.attributes.market_cap_usd ? parseFloat(token.attributes.market_cap_usd) : null,
        gtScore: token.attributes.gt_score,
        buys24h: 0,
        sells24h: 0,
        poolAddress: '',
      };
    } catch (error) {
      console.error(`Failed to fetch token ${address}:`, error);
      return null;
    }
  }

  /**
   * Get pools for a specific token
   */
  async getTokenPools(address: string, limit: number = 10): Promise<TokenInfo[]> {
    try {
      const url = `${this.baseUrl}/networks/${this.network}/tokens/${address}/pools?page=1`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`GeckoTerminal API error: ${response.status}`);
      }

      const data = await response.json() as { data: GeckoPool[] };
      const pools = data.data || [];

      return pools.slice(0, limit).map((pool) => this.parsePoolToToken(pool));
    } catch (error) {
      console.error(`Failed to fetch pools for ${address}:`, error);
      return [];
    }
  }

  /**
   * Search tokens by query
   */
  async searchTokens(query: string): Promise<TokenInfo[]> {
    try {
      const url = `${this.baseUrl}/search/pools?query=${encodeURIComponent(query)}&network=${this.network}`;

      const response = await fetch(url, {
        headers: {
          Accept: 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`GeckoTerminal API error: ${response.status}`);
      }

      const data = await response.json() as { data: GeckoPool[] };
      const pools = data.data || [];

      return pools.map((pool) => this.parsePoolToToken(pool));
    } catch (error) {
      console.error(`Failed to search tokens for ${query}:`, error);
      return [];
    }
  }

  /**
   * Get top tokens by volume
   */
  async getTopTokensByVolume(limit: number = 30): Promise<TokenInfo[]> {
    const trending = await this.getTrendingPools(100);

    return trending
      .filter((t) => t.volume24h > 10000 && t.liquidity > 50000)
      .sort((a, b) => b.volume24h - a.volume24h)
      .slice(0, limit);
  }

  /**
   * Get tokens with high momentum (big price moves)
   */
  async getHighMomentumTokens(minChange: number = 20, limit: number = 20): Promise<TokenInfo[]> {
    const trending = await this.getTrendingPools(100);

    return trending
      .filter((t) => Math.abs(t.priceChange24h) >= minChange && t.liquidity > 30000)
      .sort((a, b) => Math.abs(b.priceChange24h) - Math.abs(a.priceChange24h))
      .slice(0, limit);
  }

  /**
   * Filter tokens by quality criteria
   */
  filterByQuality(
    tokens: TokenInfo[],
    criteria: {
      minLiquidity?: number;
      minVolume?: number;
      minGtScore?: number;
      minBuySellRatio?: number;
    }
  ): TokenInfo[] {
    const { minLiquidity = 50000, minVolume = 100000, minGtScore = 50, minBuySellRatio = 0.8 } = criteria;

    return tokens.filter((t) => {
      if (t.liquidity < minLiquidity) return false;
      if (t.volume24h < minVolume) return false;
      if (t.gtScore !== null && t.gtScore < minGtScore) return false;

      const totalTx = t.buys24h + t.sells24h;
      if (totalTx > 0) {
        const buySellRatio = t.buys24h / totalTx;
        if (buySellRatio < minBuySellRatio) return false;
      }

      return true;
    });
  }

  /**
   * Calculate token score (0-100)
   */
  calculateTokenScore(token: TokenInfo): number {
    let score = 0;

    // Liquidity score (max 25)
    if (token.liquidity >= 500000) score += 25;
    else if (token.liquidity >= 100000) score += 20;
    else if (token.liquidity >= 50000) score += 15;
    else if (token.liquidity >= 20000) score += 10;

    // Volume score (max 25)
    if (token.volume24h >= 1000000) score += 25;
    else if (token.volume24h >= 500000) score += 20;
    else if (token.volume24h >= 100000) score += 15;
    else if (token.volume24h >= 50000) score += 10;

    // GT Score (max 25)
    if (token.gtScore !== null) {
      score += Math.min(25, token.gtScore / 4);
    }

    // Buy pressure (max 25)
    const totalTx = token.buys24h + token.sells24h;
    if (totalTx > 0) {
      const buyRatio = token.buys24h / totalTx;
      score += Math.round(buyRatio * 25);
    }

    return Math.round(score);
  }

  /**
   * Parse pool response to TokenInfo
   */
  private parsePoolToToken(pool: GeckoPool): TokenInfo {
    const attr = pool.attributes;

    return {
      address: attr.address,
      symbol: attr.name.split('/')[0]?.trim() || 'UNKNOWN',
      name: attr.name,
      priceUsd: parseFloat(attr.base_token_price_usd) || 0,
      volume24h: parseFloat(attr.volume_usd?.h24) || 0,
      liquidity: parseFloat(attr.reserve_in_usd) || 0,
      priceChange24h: parseFloat(attr.price_change_percentage?.h24) || 0,
      fdv: parseFloat(attr.fdv_usd) || 0,
      marketCap: attr.market_cap_usd ? parseFloat(attr.market_cap_usd) : null,
      gtScore: null, // Not in pool response
      buys24h: attr.transactions?.h24?.buys || 0,
      sells24h: attr.transactions?.h24?.sells || 0,
      poolAddress: pool.id,
    };
  }

  /**
   * Format token info for display
   */
  formatTokenInfo(token: TokenInfo): string {
    const score = this.calculateTokenScore(token);
    const priceChange =
      token.priceChange24h >= 0 ? `+${token.priceChange24h.toFixed(1)}%` : `${token.priceChange24h.toFixed(1)}%`;

    return `${token.symbol} (${token.name})
Address: ${token.address}
Price: $${token.priceUsd.toFixed(6)}
24h Change: ${priceChange}
Volume 24h: $${token.volume24h.toLocaleString()}
Liquidity: $${token.liquidity.toLocaleString()}
Score: ${score}/100
Buys/Sells: ${token.buys24h}/${token.sells24h}`;
  }
}

// Singleton instance
export const geckoTerminalClient = new GeckoTerminalClient();
