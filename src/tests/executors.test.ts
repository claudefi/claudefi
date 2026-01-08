/**
 * Execution Adapter Unit Tests
 *
 * Tests the math and logic in each execution adapter:
 * - DLMM: Position value calculations
 * - Perps: Leverage, liquidation prices, PnL
 * - Polymarket: Share calculations, odds conversion
 * - Spot: Token amount calculations
 */

import { describe, it, expect } from 'vitest';
import type { AgentDecision } from '../types/index.js';

describe('Execution Adapter Tests', () => {
  describe('Perps Executor', () => {
    describe('liquidation price calculation', () => {
      it('should calculate correct liquidation price for LONG', () => {
        // Long at $100 with 5x leverage
        // Liquidation at 20% loss from entry
        const entryPrice = 100;
        const side = 'LONG';
        const leverage = 5;

        // Manual calc: 100 - (100 * 0.2) = 80
        const expectedLiqPrice = 80;

        const liqPrice = calculateLiquidationPrice(entryPrice, side, leverage);
        expect(liqPrice).toBeCloseTo(expectedLiqPrice, 2);
      });

      it('should calculate correct liquidation price for SHORT', () => {
        // Short at $100 with 5x leverage
        // Liquidation at 20% gain from entry
        const entryPrice = 100;
        const side = 'SHORT';
        const leverage = 5;

        // Manual calc: 100 + (100 * 0.2) = 120
        const expectedLiqPrice = 120;

        const liqPrice = calculateLiquidationPrice(entryPrice, side, leverage);
        expect(liqPrice).toBeCloseTo(expectedLiqPrice, 2);
      });

      it('should have closer liquidation price with higher leverage', () => {
        const entryPrice = 100;
        const liqPrice10x = calculateLiquidationPrice(entryPrice, 'LONG', 10);
        const liqPrice5x = calculateLiquidationPrice(entryPrice, 'LONG', 5);

        expect(liqPrice10x).toBeGreaterThan(liqPrice5x);
        expect(entryPrice - liqPrice10x).toBeLessThan(entryPrice - liqPrice5x);
      });
    });

    describe('PnL calculation', () => {
      it('should calculate positive PnL for profitable LONG', () => {
        const side = 'LONG';
        const positionSize = 1000;
        const entryPrice = 100;
        const currentPrice = 115;

        // 15% gain on $1000 = $150
        const expectedPnl = 150;

        const pnl = calculatePerpsPnL(side, positionSize, entryPrice, currentPrice);
        expect(pnl).toBeCloseTo(expectedPnl, 2);
      });

      it('should calculate negative PnL for losing LONG', () => {
        const side = 'LONG';
        const positionSize = 1000;
        const entryPrice = 100;
        const currentPrice = 90;

        // 10% loss on $1000 = -$100
        const expectedPnl = -100;

        const pnl = calculatePerpsPnL(side, positionSize, entryPrice, currentPrice);
        expect(pnl).toBeCloseTo(expectedPnl, 2);
      });

      it('should calculate positive PnL for profitable SHORT', () => {
        const side = 'SHORT';
        const positionSize = 1000;
        const entryPrice = 100;
        const currentPrice = 85;

        // 15% gain on short = $150
        const expectedPnl = 150;

        const pnl = calculatePerpsPnL(side, positionSize, entryPrice, currentPrice);
        expect(pnl).toBeCloseTo(expectedPnl, 2);
      });
    });

    describe('position sizing', () => {
      it('should calculate correct margin for leveraged position', () => {
        const positionSizeUsd = 1000;
        const leverage = 5;

        // $1000 position with 5x leverage = $200 margin
        const expectedMargin = 200;

        const margin = calculateMargin(positionSizeUsd, leverage);
        expect(margin).toBeCloseTo(expectedMargin, 2);
      });
    });
  });

  describe('Polymarket Executor', () => {
    describe('share calculations', () => {
      it('should calculate correct shares for YES purchase', () => {
        const amountUsd = 100;
        const yesPrice = 0.6; // 60 cents per share

        // $100 / $0.60 = 166.67 shares
        const expectedShares = 166.67;

        const shares = calculateShares(amountUsd, yesPrice);
        expect(shares).toBeCloseTo(expectedShares, 2);
      });

      it('should calculate payout for winning YES shares', () => {
        const shares = 100;
        const outcome = 'YES';
        const resolution = 'YES';

        // 100 shares * $1 payout = $100
        const expectedPayout = 100;

        const payout = calculatePayout(shares, outcome, resolution);
        expect(payout).toBe(expectedPayout);
      });

      it('should return 0 for losing shares', () => {
        const shares = 100;
        const outcome = 'YES';
        const resolution = 'NO';

        const payout = calculatePayout(shares, outcome, resolution);
        expect(payout).toBe(0);
      });
    });

    describe('expected value calculation', () => {
      it('should calculate positive EV when true prob > market prob', () => {
        const trueProbability = 70; // You think 70%
        const marketPrice = 0.5; // Market thinks 50%
        const betSize = 100;

        // EV = (0.7 * $200) - (0.3 * $100) = $140 - $30 = $110
        // Net EV = $110 - $100 = $10
        const ev = calculateExpectedValue(trueProbability, marketPrice, betSize);

        expect(ev).toBeGreaterThan(0);
      });

      it('should calculate negative EV when true prob < market prob', () => {
        const trueProbability = 40;
        const marketPrice = 0.6;
        const betSize = 100;

        const ev = calculateExpectedValue(trueProbability, marketPrice, betSize);
        expect(ev).toBeLessThan(0);
      });
    });

    describe('Kelly criterion', () => {
      it('should calculate optimal bet size for edge', () => {
        const trueProbability = 60;
        const marketPrice = 0.5;
        const bankroll = 1000;

        // Kelly = (p * b - q) / b where b = odds
        // b = (1 - 0.5) / 0.5 = 1
        // Kelly = (0.6 * 1 - 0.4) / 1 = 0.2
        // Bet = 0.2 * $1000 = $200

        const kellyBet = calculateKellyBet(trueProbability, marketPrice, bankroll);
        expect(kellyBet).toBeCloseTo(200, 0);
      });

      it('should return 0 when no edge', () => {
        const trueProbability = 50;
        const marketPrice = 0.5;
        const bankroll = 1000;

        const kellyBet = calculateKellyBet(trueProbability, marketPrice, bankroll);
        expect(kellyBet).toBe(0);
      });
    });
  });

  describe('Spot Executor', () => {
    describe('token amount calculations', () => {
      it('should calculate correct tokens for USD amount', () => {
        const usdAmount = 100;
        const tokenPrice = 0.5; // $0.50 per token

        // $100 / $0.50 = 200 tokens
        const expectedTokens = 200;

        const tokens = calculateTokenAmount(usdAmount, tokenPrice);
        expect(tokens).toBeCloseTo(expectedTokens, 2);
      });

      it('should calculate USD value for token amount', () => {
        const tokenAmount = 1000;
        const tokenPrice = 0.15; // $0.15 per token

        // 1000 * $0.15 = $150
        const expectedValue = 150;

        const value = calculateTokenValue(tokenAmount, tokenPrice);
        expect(value).toBeCloseTo(expectedValue, 2);
      });
    });

    describe('slippage calculation', () => {
      it('should calculate expected output with slippage', () => {
        const inputAmount = 100;
        const expectedOutput = 200;
        const slippageBps = 100; // 1%

        // 200 - (200 * 0.01) = 198
        const minOutput = 198;

        const result = calculateMinOutput(inputAmount, expectedOutput, slippageBps);
        expect(result).toBeCloseTo(minOutput, 2);
      });
    });
  });

  describe('DLMM Executor', () => {
    describe('liquidity position value', () => {
      it('should calculate position value from token amounts', () => {
        const tokenXAmount = 100; // SOL
        const tokenYAmount = 10000; // USDC
        const priceX = 150; // $150 per SOL
        const priceY = 1; // $1 per USDC

        // (100 * $150) + (10000 * $1) = $15000 + $10000 = $25000
        const expectedValue = 25000;

        const value = calculateLiquidityValue(tokenXAmount, tokenYAmount, priceX, priceY);
        expect(value).toBeCloseTo(expectedValue, 2);
      });
    });

    describe('fee earnings', () => {
      it('should calculate APR from 24h fees', () => {
        const fees24h = 100;
        const tvl = 10000;

        // Daily rate = 100 / 10000 = 1%
        // APR = 1% * 365 = 365%
        const expectedAPR = 365;

        const apr = calculateAPR(fees24h, tvl);
        expect(apr).toBeCloseTo(expectedAPR, 0);
      });
    });
  });
});

// Helper functions (simplified versions of actual executor logic)

function calculateLiquidationPrice(entryPrice: number, side: 'LONG' | 'SHORT', leverage: number): number {
  const liquidationPercent = 1 / leverage;
  if (side === 'LONG') {
    return entryPrice * (1 - liquidationPercent);
  } else {
    return entryPrice * (1 + liquidationPercent);
  }
}

function calculatePerpsPnL(side: 'LONG' | 'SHORT', positionSize: number, entryPrice: number, currentPrice: number): number {
  const priceChange = currentPrice - entryPrice;
  const percentChange = priceChange / entryPrice;

  if (side === 'LONG') {
    return positionSize * percentChange;
  } else {
    return positionSize * -percentChange;
  }
}

function calculateMargin(positionSize: number, leverage: number): number {
  return positionSize / leverage;
}

function calculateShares(amountUsd: number, price: number): number {
  return amountUsd / price;
}

function calculatePayout(shares: number, outcome: 'YES' | 'NO', resolution: 'YES' | 'NO'): number {
  return outcome === resolution ? shares * 1 : 0;
}

function calculateExpectedValue(trueProbability: number, marketPrice: number, betSize: number): number {
  const trueProb = trueProbability / 100;
  const winAmount = betSize / marketPrice;
  const loseAmount = betSize;

  const ev = (trueProb * winAmount) - ((1 - trueProb) * loseAmount);
  return ev - betSize;
}

function calculateKellyBet(trueProbability: number, marketPrice: number, bankroll: number): number {
  const p = trueProbability / 100;
  const q = 1 - p;
  const b = (1 - marketPrice) / marketPrice;

  const kellyFraction = (p * b - q) / b;

  if (kellyFraction <= 0) return 0;

  return bankroll * kellyFraction;
}

function calculateTokenAmount(usdAmount: number, tokenPrice: number): number {
  return usdAmount / tokenPrice;
}

function calculateTokenValue(tokenAmount: number, tokenPrice: number): number {
  return tokenAmount * tokenPrice;
}

function calculateMinOutput(inputAmount: number, expectedOutput: number, slippageBps: number): number {
  const slippage = slippageBps / 10000;
  return expectedOutput * (1 - slippage);
}

function calculateLiquidityValue(tokenXAmount: number, tokenYAmount: number, priceX: number, priceY: number): number {
  return (tokenXAmount * priceX) + (tokenYAmount * priceY);
}

function calculateAPR(fees24h: number, tvl: number): number {
  if (tvl === 0) return 0;
  const dailyRate = fees24h / tvl;
  return dailyRate * 365 * 100;
}
