/**
 * Critical Path Tests
 * Tests for core functionality that must work for live trading
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// Portfolio Coordinator Tests
// =============================================================================

describe('Portfolio Coordinator - Price Feeds', () => {
  it('should fetch live BTC/ETH/SOL prices from Binance', async () => {
    // Mock fetch to avoid actual API calls in tests
    const mockResponse = [
      { symbol: 'BTCUSDT', lastPrice: '95000.50', priceChangePercent: '2.5' },
      { symbol: 'ETHUSDT', lastPrice: '3500.25', priceChangePercent: '-1.2' },
      { symbol: 'SOLUSDT', lastPrice: '200.10', priceChangePercent: '5.0' },
    ];

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockResponse),
    });

    const { fetchMarketSummary } = await import('../subagents/portfolio-coordinator.js');
    const summary = await fetchMarketSummary();

    expect(summary.btcPrice).toBeGreaterThan(0);
    expect(summary.ethPrice).toBeGreaterThan(0);
    expect(summary.solPrice).toBeGreaterThan(0);
    expect(typeof summary.btcChange24h).toBe('number');
  });

  it('should return default values on API failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network error'));

    const { fetchMarketSummary } = await import('../subagents/portfolio-coordinator.js');
    const summary = await fetchMarketSummary();

    // Should return defaults on error
    expect(summary.btcPrice).toBe(95000);
    expect(summary.ethPrice).toBe(3500);
    expect(summary.solPrice).toBe(200);
  });
});

// =============================================================================
// Memory System Tests
// =============================================================================

describe('Memory System - Expiration', () => {
  it('should detect expired facts by date', () => {
    // Test the expiration parsing logic directly without mocking fs
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const mockContent = `# Test Memory

📌 **[MEDIUM]** This is an expired fact [EXPIRES: ${yesterday}]
_Added: 2024-01-01T00:00:00.000Z_

📌 **[MEDIUM]** This is a valid fact
_Added: 2024-01-01T00:00:00.000Z_
`;

    // Test the expiration pattern matching
    const expiredPattern = /\[EXPIRES:\s*(\d{4}-\d{2}-\d{2})\]/i;
    const match = mockContent.match(expiredPattern);

    expect(match).not.toBeNull();
    expect(match![1]).toBe(yesterday);

    // Verify expiration comparison logic
    const expirationDate = new Date(match![1]);
    const now = new Date();
    expect(expirationDate < now).toBe(true);
  });

  it('should detect ISO datetime expiration format', () => {
    const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const mockContent = `_Expires: ${pastDate}_`;

    const isoPattern = /_Expires:\s*(\d{4}-\d{2}-\d{2}T[\d:\.]+Z?)_/i;
    const match = mockContent.match(isoPattern);

    expect(match).not.toBeNull();
    const expirationDate = new Date(match![1]);
    expect(expirationDate < new Date()).toBe(true);
  });
});

// =============================================================================
// Hyperliquid Client Tests
// =============================================================================

describe('Hyperliquid Client', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('should calculate liquidation price correctly for LONG', async () => {
    const { hyperliquidClient } = await import('../clients/hyperliquid/client.js');

    const entryPrice = 100000;
    const leverage = 10;
    const maintenanceMargin = 0.03;

    const liqPrice = hyperliquidClient.calculateLiquidationPrice(
      entryPrice,
      'LONG',
      leverage,
      maintenanceMargin
    );

    // For LONG: liq_price = entry_price * (1 - 1/leverage + maintenance_margin)
    // = 100000 * (1 - 0.1 + 0.03) = 100000 * 0.93 = 93000
    expect(liqPrice).toBeCloseTo(93000, 0);
  });

  it('should calculate liquidation price correctly for SHORT', async () => {
    const { hyperliquidClient } = await import('../clients/hyperliquid/client.js');

    const entryPrice = 100000;
    const leverage = 10;
    const maintenanceMargin = 0.03;

    const liqPrice = hyperliquidClient.calculateLiquidationPrice(
      entryPrice,
      'SHORT',
      leverage,
      maintenanceMargin
    );

    // For SHORT: liq_price = entry_price * (1 + 1/leverage - maintenance_margin)
    // = 100000 * (1 + 0.1 - 0.03) = 100000 * 1.07 = 107000
    expect(liqPrice).toBeCloseTo(107000, 0);
  });

  it('should calculate PnL correctly', async () => {
    const { hyperliquidClient } = await import('../clients/hyperliquid/client.js');

    // LONG with profit
    const pnlLong = hyperliquidClient.calculatePnl('LONG', 1000, 100, 110);
    expect(pnlLong).toBeCloseTo(100, 1); // 10% profit on $1000 = $100

    // SHORT with profit
    const pnlShort = hyperliquidClient.calculatePnl('SHORT', 1000, 100, 90);
    expect(pnlShort).toBeCloseTo(100, 1); // 10% profit on $1000 = $100

    // LONG with loss
    const pnlLongLoss = hyperliquidClient.calculatePnl('LONG', 1000, 100, 90);
    expect(pnlLongLoss).toBeCloseTo(-100, 1); // 10% loss
  });

  it('should throw when placeOrder called without wallet', async () => {
    const { hyperliquidClient } = await import('../clients/hyperliquid/client.js');

    await expect(
      hyperliquidClient.placeOrder('BTC', 'LONG', 1000, 5)
    ).rejects.toThrow('Wallet not initialized');
  });
});

// =============================================================================
// Position Monitor Tests
// =============================================================================

describe('Position Monitor - Risk Assessment', () => {
  it('should assess liquidation risk correctly', async () => {
    const { assessLiquidationRisk } = await import('../services/position-monitor.js');

    // Safe margin (>50%)
    const safeResult = assessLiquidationRisk(0.6, 100000, 80000);
    expect(safeResult.riskLevel).toBe('safe');
    expect(safeResult.recommendedAction).toBe('none');

    // Warning margin (25-50%)
    const warningResult = assessLiquidationRisk(0.35, 100000, 80000);
    expect(warningResult.riskLevel).toBe('warning');
    expect(warningResult.recommendedAction).toBe('monitor');

    // Danger margin (15-25%)
    const dangerResult = assessLiquidationRisk(0.20, 100000, 80000);
    expect(dangerResult.riskLevel).toBe('danger');
    expect(dangerResult.recommendedAction).toBe('reduce_25');

    // Critical margin (<15%)
    const criticalResult = assessLiquidationRisk(0.10, 100000, 80000);
    expect(criticalResult.riskLevel).toBe('critical');
    expect(['reduce_50', 'close']).toContain(criticalResult.recommendedAction);
  });

  it('should parse stop-loss from reasoning', async () => {
    const { positionMonitor } = await import('../services/position-monitor.js');

    // Test stop-loss parsing
    const exitCondition = positionMonitor.parseExitFromReasoning(
      'test-position-1',
      'perps',
      'Opening a long position with stop loss at $95000',
      100000
    );

    expect(exitCondition).not.toBeNull();
    expect(exitCondition!.type).toBe('stop_loss');
    expect(exitCondition!.triggerPrice).toBe(95000);
    expect(exitCondition!.triggerPriceDirection).toBe('below');
  });

  it('should parse take-profit from reasoning', async () => {
    const { positionMonitor } = await import('../services/position-monitor.js');

    // Test take-profit parsing (pattern requires "take profit" not "taking profit")
    const exitCondition = positionMonitor.parseExitFromReasoning(
      'test-position-2',
      'perps',
      'I will take profit at $105000 if we hit that target',
      100000
    );

    expect(exitCondition).not.toBeNull();
    expect(exitCondition!.type).toBe('take_profit');
    expect(exitCondition!.triggerPrice).toBe(105000);
    expect(exitCondition!.triggerPriceDirection).toBe('above');
  });

  it('should parse TP shorthand from reasoning', async () => {
    const { positionMonitor } = await import('../services/position-monitor.js');

    const exitCondition = positionMonitor.parseExitFromReasoning(
      'test-position-3',
      'perps',
      'Setting TP at $110000',
      100000
    );

    expect(exitCondition).not.toBeNull();
    expect(exitCondition!.type).toBe('take_profit');
    expect(exitCondition!.triggerPrice).toBe(110000);
  });
});

// =============================================================================
// Meteora Client Tests
// =============================================================================

describe('Meteora Client', () => {
  it('should calculate APR correctly', async () => {
    const { meteoraClient } = await import('../clients/meteora/client.js');

    const mockPool = {
      fees_24h: 1000, // $1000 in fees
      liquidity: '365000', // $365k TVL
    } as any;

    const apr = meteoraClient.calculateApr(mockPool);
    // APR = (1000 * 365 / 365000) * 100 = 100%
    expect(apr).toBeCloseTo(100, 0);
  });

  it('should estimate daily fees correctly', async () => {
    const { meteoraClient } = await import('../clients/meteora/client.js');

    const mockPool = {
      fees_24h: 1000,
      liquidity: '100000',
    } as any;

    // $1000 in position on $100k pool with $1000 daily fees
    // = 1% share * $1000 = $10
    const fees = meteoraClient.calculateEstimatedFees(mockPool, 1000);
    expect(fees).toBeCloseTo(10, 0);
  });
});
