/**
 * Gamma API Client for Polymarket (Standalone)
 *
 * Free, no-auth API for reading Polymarket data
 * Docs: https://docs.polymarket.com/#gamma-markets-api
 */

export interface PolyMarket {
  id: string;
  condition_id: string;
  question: string;
  description?: string;
  category?: string;
  endDate: string;
  active: boolean;
  closed: boolean;
  archived: boolean;
  bestBid: number;
  bestAsk: number;
  lastTradePrice: number;
  volume24hrClob?: number;
  volume24hrAmm?: number;
  liquidity?: number;
  outcomePrices?: number[];
}

export class GammaClient {
  private readonly baseUrl = 'https://gamma-api.polymarket.com';

  /**
   * Get markets with optional filters
   */
  async getMarkets(params?: {
    limit?: number;
    offset?: number;
    active?: boolean;
    closed?: boolean;
    archived?: boolean;
  }): Promise<PolyMarket[]> {
    const queryParams = new URLSearchParams();

    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    if (params?.active !== undefined) queryParams.append('active', params.active.toString());
    if (params?.closed !== undefined) queryParams.append('closed', params.closed.toString());
    if (params?.archived !== undefined) queryParams.append('archived', params.archived.toString());

    const url = `${this.baseUrl}/markets?${queryParams.toString()}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Gamma API error: ${response.status} ${response.statusText}`);
      }

      return await response.json() as PolyMarket[];
    } catch (error) {
      console.error('Gamma API getMarkets failed:', error);
      throw error;
    }
  }

  /**
   * Get a specific market by condition_id
   */
  async getMarket(conditionId: string): Promise<PolyMarket | null> {
    const url = `${this.baseUrl}/markets/${conditionId}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Gamma API error: ${response.status}`);
      }

      return await response.json() as PolyMarket;
    } catch (error) {
      console.error(`Gamma API getMarket(${conditionId}) failed:`, error);
      return null;
    }
  }

  /**
   * Search markets by text query
   */
  async searchMarkets(query: string, limit: number = 20): Promise<PolyMarket[]> {
    const markets = await this.getMarkets({ limit: 100, active: true });

    const lowerQuery = query.toLowerCase();
    return markets
      .filter(m =>
        m.question.toLowerCase().includes(lowerQuery) ||
        m.description?.toLowerCase().includes(lowerQuery) ||
        m.category?.toLowerCase().includes(lowerQuery)
      )
      .slice(0, limit);
  }

  /**
   * Get trending markets (high volume)
   */
  async getTrendingMarkets(limit: number = 30): Promise<PolyMarket[]> {
    const markets = await this.getMarkets({ limit: 200, active: true, closed: false });

    return markets
      .filter(m => {
        const vol = (m.volume24hrClob || 0) + (m.volume24hrAmm || 0);
        return vol > 0;
      })
      .sort((a, b) => {
        const volA = (a.volume24hrClob || 0) + (a.volume24hrAmm || 0);
        const volB = (b.volume24hrClob || 0) + (b.volume24hrAmm || 0);
        return volB - volA;
      })
      .slice(0, limit);
  }

  /**
   * Get markets by category
   */
  async getMarketsByCategory(category: string, limit: number = 50): Promise<PolyMarket[]> {
    const markets = await this.getMarkets({ limit: 200, active: true });

    return markets
      .filter(m => m.category?.toLowerCase() === category.toLowerCase())
      .slice(0, limit);
  }

  /**
   * Get markets ending soon
   */
  async getMarketsEndingSoon(hoursFromNow: number = 72, limit: number = 20): Promise<PolyMarket[]> {
    const markets = await this.getMarkets({ limit: 200, active: true, closed: false });

    const now = Date.now();
    const cutoff = now + (hoursFromNow * 60 * 60 * 1000);

    return markets
      .filter(m => {
        if (!m.endDate) return false;
        const endTime = new Date(m.endDate).getTime();
        return endTime > now && endTime < cutoff;
      })
      .sort((a, b) => {
        const timeA = new Date(a.endDate).getTime();
        const timeB = new Date(b.endDate).getTime();
        return timeA - timeB;
      })
      .slice(0, limit);
  }

  /**
   * Get YES and NO prices from a market
   */
  getMarketPrices(market: PolyMarket): { yesPrice: number; noPrice: number } {
    const yesPrice = market.lastTradePrice || (market.bestBid + market.bestAsk) / 2;
    const noPrice = 1 - yesPrice;

    return {
      yesPrice: Math.max(0.01, Math.min(0.99, yesPrice)),
      noPrice: Math.max(0.01, Math.min(0.99, noPrice)),
    };
  }

  /**
   * Calculate implied probability from price (0-100%)
   */
  getImpliedProbability(price: number): number {
    return Math.max(0, Math.min(1, price)) * 100;
  }

  /**
   * Calculate expected value of a bet
   */
  calculateExpectedValue(
    trueProb: number,    // Your estimated probability (0-100)
    marketPrice: number, // Current market price (0-1)
    betSize: number      // USD amount
  ): number {
    const potentialWin = betSize / marketPrice;
    const ev = (trueProb / 100 * potentialWin) - ((1 - trueProb / 100) * betSize);
    return ev;
  }

  /**
   * Calculate Kelly Criterion optimal bet size (half-Kelly for safety)
   */
  calculateKellyBet(
    trueProb: number,      // Your estimated probability (0-100)
    marketPrice: number,   // Current market price (0-1)
    bankroll: number       // Available USD
  ): number {
    const p = trueProb / 100;
    const b = (1 / marketPrice) - 1; // Odds
    const q = 1 - p;

    const kellyFraction = (p * (b + 1) - 1) / b;

    // Half-Kelly with 10% max
    const safeFraction = Math.max(0, Math.min(0.1, kellyFraction * 0.5));
    return bankroll * safeFraction;
  }

  /**
   * Calculate days until market closes
   */
  getDaysToClose(market: PolyMarket): number {
    if (!market.endDate) return 999;
    const msToClose = new Date(market.endDate).getTime() - Date.now();
    return Math.max(0, msToClose / (1000 * 60 * 60 * 24));
  }
}

// Singleton instance
export const gammaClient = new GammaClient();
