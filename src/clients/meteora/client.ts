/**
 * Meteora DLMM API Client (Standalone)
 *
 * Fetches live liquidity pool data from Meteora
 * Documentation: https://docs.meteora.ag/
 */

import { resilientFetch, ResilientFetchError } from '../../infra/resilient-fetch.js';

export interface MeteoraPool {
  address: string;
  name: string;
  mint_x: string;
  mint_y: string;
  reserve_x: string;
  reserve_y: string;
  reserve_x_amount: number;
  reserve_y_amount: number;
  bin_step: number;
  base_fee_percentage: string;
  max_fee_percentage: string;
  protocol_fee_percentage: string;
  liquidity: string;
  reward_mint_x: string;
  reward_mint_y: string;
  fees_24h: number;
  today_fees: number;
  trade_volume_24h: number;
  cumulative_trade_volume: string;
  cumulative_fee_volume: string;
  current_price: number;
  apr: number;
  apy: number;
  farm_apr: number;
  farm_apy: number;
  hide: boolean;
}

export class MeteoraClient {
  private baseUrl = 'https://dlmm-api.meteora.ag';

  /**
   * Fetch a page of pools sorted by liquidity
   */
  async getPools(limit: number = 100): Promise<MeteoraPool[]> {
    try {
      const url = `${this.baseUrl}/pair/all_with_pagination?page=1&limit=${limit}&sort_by=liquidity&sort_order=desc`;

      const data = await resilientFetch<{ pairs?: MeteoraPool[] } | MeteoraPool[]>(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; Claudefi/1.0)',
        },
      });

      const pools = Array.isArray(data) ? data : (data.pairs || []);
      return pools;
    } catch (error) {
      console.error('Failed to fetch Meteora pools:', error);
      return [];
    }
  }

  /**
   * Fetch a specific pool by address
   */
  async getPool(address: string): Promise<MeteoraPool | null> {
    try {
      const url = `${this.baseUrl}/pair/${address}`;

      return await resilientFetch<MeteoraPool>(url);
    } catch (error) {
      // Handle 404 specifically
      if (error instanceof ResilientFetchError && error.statusCode === 404) {
        return null;
      }
      console.error(`Failed to fetch pool ${address}:`, error);
      return null;
    }
  }

  /**
   * Get top pools by 24h fees (highest earning)
   */
  async getTopPools(limit: number = 30): Promise<MeteoraPool[]> {
    // Fetch 2x to account for filtering
    const fetchLimit = Math.min(limit * 2, 250);
    const pools = await this.getPools(fetchLimit);

    return pools
      .filter(pool => pool.fees_24h > 0 && parseFloat(pool.liquidity) > 10000)
      .sort((a, b) => b.fees_24h - a.fees_24h)
      .slice(0, limit);
  }

  /**
   * Get pools with minimum liquidity threshold
   */
  async getPoolsByMinLiquidity(minLiquidity: number = 50000): Promise<MeteoraPool[]> {
    const pools = await this.getPools(200);

    return pools.filter(pool => parseFloat(pool.liquidity) >= minLiquidity);
  }

  /**
   * Calculate estimated daily fees for a position
   */
  calculateEstimatedFees(pool: MeteoraPool, positionValueUsd: number): number {
    const poolTvl = parseFloat(pool.liquidity);
    if (poolTvl <= 0) return 0;

    const poolShare = positionValueUsd / poolTvl;
    return pool.fees_24h * poolShare;
  }

  /**
   * Calculate APR based on fees and TVL
   */
  calculateApr(pool: MeteoraPool): number {
    const tvl = parseFloat(pool.liquidity);
    if (tvl <= 0) return 0;

    // APR = (daily fees * 365) / TVL * 100
    return (pool.fees_24h * 365 / tvl) * 100;
  }

  /**
   * Format pool info for display
   */
  formatPoolInfo(pool: MeteoraPool): string {
    const tvl = parseFloat(pool.liquidity);
    const apr = this.calculateApr(pool);

    return `${pool.name}
Address: ${pool.address}
TVL: $${tvl.toLocaleString()}
24h Fees: $${pool.fees_24h.toLocaleString()}
24h Volume: $${pool.trade_volume_24h.toLocaleString()}
APR: ${apr.toFixed(1)}%
Price: ${pool.current_price}`;
  }
}

// Singleton instance
export const meteoraClient = new MeteoraClient();
