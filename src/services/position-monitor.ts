/**
 * Position Monitor Service
 *
 * Background service that monitors open positions and executes exit conditions.
 * Runs every 5 minutes to check:
 * - Stop-loss triggers
 * - Take-profit triggers
 * - Time-based exits
 * - Liquidation risk (perps)
 *
 * Exit conditions can be:
 * 1. Parsed from agent reasoning (e.g., "stop loss at $50")
 * 2. Registered manually via registerExit()
 * 3. Auto-generated for safety (liquidation prevention)
 */

import type { Domain, Position } from '../types/index.js';
import { getOpenPositions, closePosition, updatePositionValue } from '../db/index.js';
import { hyperliquidClient } from '../clients/hyperliquid/client.js';
import { meteoraClient } from '../clients/meteora/client.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Types of exit conditions
 */
export type ExitType = 'stop_loss' | 'take_profit' | 'time_based' | 'liquidation_risk' | 'trailing_stop';

/**
 * An exit condition to monitor
 */
export interface ExitCondition {
  id: string;
  positionId: string;
  domain: Domain;
  type: ExitType;
  triggerPrice?: number;       // For stop_loss, take_profit, trailing_stop
  triggerPriceDirection?: 'above' | 'below'; // Price must go above or below trigger
  triggerTime?: Date;          // For time_based
  marginThreshold?: number;    // For liquidation_risk (e.g., 0.25 = 25% margin)
  trailingPercent?: number;    // For trailing_stop (e.g., 0.05 = 5%)
  highWaterMark?: number;      // Highest price seen (for trailing stop)
  active: boolean;
  createdAt: Date;
  triggeredAt?: Date;
  metadata?: Record<string, unknown>;
}

/**
 * Result of executing an exit
 */
export interface ExecutedExit {
  exitCondition: ExitCondition;
  positionId: string;
  domain: Domain;
  executionPrice?: number;
  executionTime: Date;
  reason: string;
  success: boolean;
  error?: string;
}

/**
 * Current price data for position monitoring
 */
interface PriceData {
  positionId: string;
  currentPrice: number;
  marginRatio?: number; // For perps
}

// =============================================================================
// POSITION MONITOR CLASS
// =============================================================================

/**
 * Position Monitor Service
 * Call start() to begin background monitoring
 */
export class PositionMonitor {
  private exitConditions: Map<string, ExitCondition> = new Map();
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;

  // Check interval in milliseconds (5 minutes)
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000;

  /**
   * Start the position monitor
   */
  start(): void {
    if (this.isRunning) {
      console.log('[PositionMonitor] Already running');
      return;
    }

    console.log('[PositionMonitor] Starting position monitor...');
    this.isRunning = true;

    // Run immediately
    this.checkAllExits().catch(err =>
      console.error('[PositionMonitor] Initial check failed:', err)
    );

    // Set up interval
    this.checkInterval = setInterval(async () => {
      try {
        await this.checkAllExits();
      } catch (error) {
        console.error('[PositionMonitor] Check failed:', error);
      }
    }, this.CHECK_INTERVAL_MS);

    console.log(`[PositionMonitor] Monitoring every ${this.CHECK_INTERVAL_MS / 1000 / 60} minutes`);
  }

  /**
   * Stop the position monitor
   */
  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[PositionMonitor] Stopped');
  }

  /**
   * Register an exit condition for monitoring
   */
  registerExit(condition: Omit<ExitCondition, 'id' | 'createdAt' | 'active'>): string {
    const id = `exit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const fullCondition: ExitCondition = {
      ...condition,
      id,
      active: true,
      createdAt: new Date(),
    };

    this.exitConditions.set(id, fullCondition);
    console.log(`[PositionMonitor] Registered ${condition.type} for position ${condition.positionId}`);

    return id;
  }

  /**
   * Remove an exit condition
   */
  removeExit(exitId: string): boolean {
    const removed = this.exitConditions.delete(exitId);
    if (removed) {
      console.log(`[PositionMonitor] Removed exit condition ${exitId}`);
    }
    return removed;
  }

  /**
   * Remove all exit conditions for a position
   */
  removeExitsForPosition(positionId: string): number {
    let removed = 0;
    for (const [id, condition] of this.exitConditions) {
      if (condition.positionId === positionId) {
        this.exitConditions.delete(id);
        removed++;
      }
    }
    return removed;
  }

  /**
   * Parse exit conditions from agent's reasoning
   * Returns null if no exit conditions are mentioned
   */
  parseExitFromReasoning(
    positionId: string,
    domain: Domain,
    reasoning: string,
    currentPrice: number
  ): ExitCondition | null {
    const lowerReasoning = reasoning.toLowerCase();

    // Look for stop loss mentions
    const stopLossPatterns = [
      /stop\s*loss\s*(?:at|@)?\s*\$?([\d,]+(?:\.\d+)?)/i,
      /sl\s*(?:at|@|:)?\s*\$?([\d,]+(?:\.\d+)?)/i,
      /exit\s*if\s*(?:price\s*)?(?:drops?|falls?)\s*(?:below|under)\s*\$?([\d,]+(?:\.\d+)?)/i,
    ];

    for (const pattern of stopLossPatterns) {
      const match = reasoning.match(pattern);
      if (match) {
        const triggerPrice = parseFloat(match[1].replace(/,/g, ''));
        return {
          id: '',
          positionId,
          domain,
          type: 'stop_loss',
          triggerPrice,
          triggerPriceDirection: 'below',
          active: true,
          createdAt: new Date(),
        };
      }
    }

    // Look for take profit mentions
    const takeProfitPatterns = [
      /take\s*profit\s*(?:at|@)?\s*\$?([\d,]+(?:\.\d+)?)/i,
      /tp\s*(?:at|@|:)?\s*\$?([\d,]+(?:\.\d+)?)/i,
      /exit\s*if\s*(?:price\s*)?(?:rises?|reaches?)\s*(?:above|over)?\s*\$?([\d,]+(?:\.\d+)?)/i,
      /target\s*(?:price|:)?\s*\$?([\d,]+(?:\.\d+)?)/i,
    ];

    for (const pattern of takeProfitPatterns) {
      const match = reasoning.match(pattern);
      if (match) {
        const triggerPrice = parseFloat(match[1].replace(/,/g, ''));
        return {
          id: '',
          positionId,
          domain,
          type: 'take_profit',
          triggerPrice,
          triggerPriceDirection: 'above',
          active: true,
          createdAt: new Date(),
        };
      }
    }

    // Look for percentage-based stop loss
    const percentStopPatterns = [
      /stop\s*(?:loss)?\s*(?:at|@)?\s*(\d+(?:\.\d+)?)\s*%/i,
      /risk(?:ing)?\s*(\d+(?:\.\d+)?)\s*%/i,
    ];

    for (const pattern of percentStopPatterns) {
      const match = reasoning.match(pattern);
      if (match) {
        const percent = parseFloat(match[1]) / 100;
        const triggerPrice = currentPrice * (1 - percent);
        return {
          id: '',
          positionId,
          domain,
          type: 'stop_loss',
          triggerPrice,
          triggerPriceDirection: 'below',
          active: true,
          createdAt: new Date(),
          metadata: { parsedFromPercent: percent },
        };
      }
    }

    return null;
  }

  /**
   * Get current prices for all open positions
   * Delegates to the standalone getCurrentPrices function which uses real APIs
   */
  private async getCurrentPrices(): Promise<Map<string, PriceData>> {
    // Use the standalone function that integrates with real price feeds
    return getCurrentPrices();
  }

  /**
   * Check all exit conditions and execute triggered ones
   */
  async checkAllExits(): Promise<ExecutedExit[]> {
    if (this.exitConditions.size === 0) {
      return [];
    }

    console.log(`[PositionMonitor] Checking ${this.exitConditions.size} exit conditions...`);

    const prices = await getCurrentPrices();
    const executedExits: ExecutedExit[] = [];

    for (const [id, condition] of this.exitConditions) {
      if (!condition.active) continue;

      const priceData = prices.get(condition.positionId);
      if (!priceData) {
        // Position may have been closed
        this.exitConditions.delete(id);
        continue;
      }

      let triggered = false;
      let reason = '';

      switch (condition.type) {
        case 'stop_loss':
          if (condition.triggerPrice && condition.triggerPriceDirection === 'below') {
            triggered = priceData.currentPrice <= condition.triggerPrice;
            reason = `Stop loss triggered at $${priceData.currentPrice} (trigger: $${condition.triggerPrice})`;
          }
          break;

        case 'take_profit':
          if (condition.triggerPrice && condition.triggerPriceDirection === 'above') {
            triggered = priceData.currentPrice >= condition.triggerPrice;
            reason = `Take profit triggered at $${priceData.currentPrice} (trigger: $${condition.triggerPrice})`;
          }
          break;

        case 'time_based':
          if (condition.triggerTime) {
            triggered = new Date() >= condition.triggerTime;
            reason = `Time-based exit triggered at ${new Date().toISOString()}`;
          }
          break;

        case 'liquidation_risk':
          if (condition.marginThreshold && priceData.marginRatio !== undefined) {
            triggered = priceData.marginRatio <= condition.marginThreshold;
            reason = `Liquidation risk: margin ${(priceData.marginRatio * 100).toFixed(1)}% below threshold ${(condition.marginThreshold * 100).toFixed(0)}%`;
          }
          break;

        case 'trailing_stop':
          if (condition.trailingPercent) {
            // Update high water mark
            condition.highWaterMark = Math.max(
              condition.highWaterMark || priceData.currentPrice,
              priceData.currentPrice
            );
            const trailPrice = condition.highWaterMark * (1 - condition.trailingPercent);
            triggered = priceData.currentPrice <= trailPrice;
            reason = `Trailing stop triggered at $${priceData.currentPrice} (trail from $${condition.highWaterMark})`;
          }
          break;
      }

      if (triggered) {
        // Execute the exit
        const exit = await this.executeExit(condition, priceData, reason);
        executedExits.push(exit);

        // Mark as triggered
        condition.active = false;
        condition.triggeredAt = new Date();
      }
    }

    if (executedExits.length > 0) {
      console.log(`[PositionMonitor] Executed ${executedExits.length} exits`);
    }

    return executedExits;
  }

  /**
   * Execute a triggered exit condition
   */
  private async executeExit(
    condition: ExitCondition,
    priceData: PriceData,
    reason: string
  ): Promise<ExecutedExit> {
    console.log(`[PositionMonitor] Executing ${condition.type} for ${condition.positionId}: ${reason}`);

    try {
      // Close the position in the database
      // In production, this would also execute the actual trade
      await closePosition(condition.domain, condition.positionId, {
        currentValueUsd: priceData.currentPrice,
      });

      return {
        exitCondition: condition,
        positionId: condition.positionId,
        domain: condition.domain,
        executionPrice: priceData.currentPrice,
        executionTime: new Date(),
        reason,
        success: true,
      };
    } catch (error) {
      console.error(`[PositionMonitor] Failed to execute exit:`, error);

      return {
        exitCondition: condition,
        positionId: condition.positionId,
        domain: condition.domain,
        executionTime: new Date(),
        reason,
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  /**
   * Get all active exit conditions
   */
  getActiveExits(): ExitCondition[] {
    return Array.from(this.exitConditions.values()).filter(c => c.active);
  }

  /**
   * Get exits for a specific position
   */
  getExitsForPosition(positionId: string): ExitCondition[] {
    return Array.from(this.exitConditions.values()).filter(
      c => c.positionId === positionId
    );
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

/**
 * Singleton position monitor instance
 */
export const positionMonitor = new PositionMonitor();

/**
 * Get current prices for all open positions using real APIs
 */
async function getCurrentPrices(): Promise<Map<string, PriceData>> {
  const prices = new Map<string, PriceData>();

  const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];

  // Fetch all Hyperliquid prices at once (for perps)
  let hyperliquidMids: Record<string, string> = {};
  try {
    hyperliquidMids = await hyperliquidClient.getAllMids();
  } catch (error) {
    console.warn('[PositionMonitor] Failed to fetch Hyperliquid prices:', error);
  }

  for (const domain of domains) {
    const positions = await getOpenPositions(domain);

    for (const position of positions) {
      let currentPrice = position.currentValueUsd || position.entryValueUsd;
      let marginRatio: number | undefined;

      try {
        switch (domain) {
          case 'perps': {
            // Perps: Use Hyperliquid prices
            const symbol = position.target; // e.g., "BTC", "ETH"
            const midPrice = hyperliquidMids[symbol];
            if (midPrice) {
              const entryPrice = (position.metadata as Record<string, unknown>)?.entry_price as number || 0;
              const size = (position.metadata as Record<string, unknown>)?.size_usd as number || position.entryValueUsd;
              const side = (position.metadata as Record<string, unknown>)?.side as string || 'LONG';
              const leverage = (position.metadata as Record<string, unknown>)?.leverage as number || 1;

              const price = parseFloat(midPrice);

              // Calculate P&L based on position side
              let pnl = 0;
              if (entryPrice > 0) {
                if (side === 'LONG') {
                  pnl = size * ((price - entryPrice) / entryPrice);
                } else {
                  pnl = size * ((entryPrice - price) / entryPrice);
                }
              }

              currentPrice = size + pnl;

              // Estimate margin ratio (simplified)
              // marginRatio = equity / margin = (size + pnl) / (size / leverage)
              const margin = size / leverage;
              marginRatio = margin > 0 ? (size + pnl) / margin : 0.5;
            }
            break;
          }

          case 'dlmm': {
            // DLMM: Use Meteora pool data
            const poolAddress = position.target;
            try {
              const pool = await meteoraClient.getPool(poolAddress);
              if (pool) {
                // Estimate current value based on APR and time held
                const apr = meteoraClient.calculateApr(pool);
                const daysHeld = (Date.now() - new Date(position.openedAt).getTime()) / (1000 * 60 * 60 * 24);
                const dailyRate = apr / 365 / 100;
                const estimatedFees = position.entryValueUsd * dailyRate * daysHeld;
                currentPrice = position.entryValueUsd + estimatedFees;
              }
            } catch {
              // Keep existing value if fetch fails
            }
            break;
          }

          case 'spot': {
            // Spot: Use Jupiter/Birdeye prices via Meteora (SOL tokens)
            // For simplicity, use entry price + estimated movement
            // In production, would query Jupiter price API
            currentPrice = position.currentValueUsd || position.entryValueUsd;
            break;
          }

          case 'polymarket': {
            // Polymarket: Current share price
            const shares = (position.metadata as Record<string, unknown>)?.shares as number || 1;
            const currentSharePrice = (position.metadata as Record<string, unknown>)?.current_price as number;
            if (currentSharePrice && shares) {
              currentPrice = shares * currentSharePrice;
            }
            break;
          }
        }
      } catch (error) {
        console.warn(`[PositionMonitor] Failed to get price for ${position.id}:`, error);
      }

      prices.set(position.id, {
        positionId: position.id,
        currentPrice,
        marginRatio,
      });
    }
  }

  return prices;
}

// =============================================================================
// AUTO-REGISTRATION HELPERS
// =============================================================================

/**
 * Auto-register safety exits for a new position
 * Called when a position is opened
 */
export function registerSafetyExits(
  positionId: string,
  domain: Domain,
  entryPrice: number,
  reasoning?: string
): string[] {
  const exitIds: string[] = [];

  // Parse exits from reasoning if available
  if (reasoning) {
    const parsed = positionMonitor.parseExitFromReasoning(
      positionId,
      domain,
      reasoning,
      entryPrice
    );

    if (parsed) {
      const id = positionMonitor.registerExit(parsed);
      exitIds.push(id);
    }
  }

  // Auto-register liquidation protection for perps
  if (domain === 'perps') {
    const id = positionMonitor.registerExit({
      positionId,
      domain,
      type: 'liquidation_risk',
      marginThreshold: 0.25, // 25% margin threshold
    });
    exitIds.push(id);
  }

  // Auto-register default stop loss if none was parsed (5% for perps, 15% for spot)
  const hasStopLoss = exitIds.some(id => {
    const exit = positionMonitor.getExitsForPosition(positionId).find(e => e.id === id);
    return exit?.type === 'stop_loss';
  });

  if (!hasStopLoss) {
    const defaultStopPercent = domain === 'perps' ? 0.05 : 0.15;
    const id = positionMonitor.registerExit({
      positionId,
      domain,
      type: 'stop_loss',
      triggerPrice: entryPrice * (1 - defaultStopPercent),
      triggerPriceDirection: 'below',
      metadata: { autoGenerated: true, defaultStopPercent },
    });
    exitIds.push(id);
    console.log(`[PositionMonitor] Auto-registered ${(defaultStopPercent * 100).toFixed(0)}% stop loss for ${positionId}`);
  }

  return exitIds;
}

// =============================================================================
// PERPS LIQUIDATION PREVENTION
// =============================================================================

/**
 * Liquidation risk levels for perps positions
 */
export type LiquidationRiskLevel = 'safe' | 'warning' | 'danger' | 'critical';

/**
 * Result of liquidation risk check
 */
export interface LiquidationRiskResult {
  positionId: string;
  symbol: string;
  riskLevel: LiquidationRiskLevel;
  marginRatio: number;
  liquidationPrice: number;
  currentPrice: number;
  distanceToLiquidation: number; // percentage
  recommendedAction: 'none' | 'monitor' | 'reduce_25' | 'reduce_50' | 'close';
}

/**
 * Check liquidation risk for a perps position
 * Risk thresholds:
 * - safe: margin > 50%
 * - warning: margin 25-50%
 * - danger: margin 15-25%
 * - critical: margin < 15%
 */
export function assessLiquidationRisk(
  marginRatio: number,
  currentPrice: number,
  liquidationPrice: number
): Pick<LiquidationRiskResult, 'riskLevel' | 'distanceToLiquidation' | 'recommendedAction'> {
  const distanceToLiquidation = Math.abs((currentPrice - liquidationPrice) / currentPrice);

  let riskLevel: LiquidationRiskLevel;
  let recommendedAction: LiquidationRiskResult['recommendedAction'];

  if (marginRatio > 0.50) {
    riskLevel = 'safe';
    recommendedAction = 'none';
  } else if (marginRatio > 0.25) {
    riskLevel = 'warning';
    recommendedAction = 'monitor';
  } else if (marginRatio > 0.15) {
    riskLevel = 'danger';
    recommendedAction = 'reduce_25';
  } else {
    riskLevel = 'critical';
    recommendedAction = marginRatio > 0.10 ? 'reduce_50' : 'close';
  }

  return { riskLevel, distanceToLiquidation, recommendedAction };
}

/**
 * Emergency position reducer for perps
 * Called when liquidation risk is detected
 */
export interface EmergencyReduceResult {
  positionId: string;
  originalSize: number;
  reducedBy: number;
  newSize: number;
  reason: string;
  success: boolean;
  error?: string;
}

/**
 * Execute emergency position reduction
 * Uses the actual trading APIs to reduce positions
 */
export async function executeEmergencyReduce(
  positionId: string,
  domain: Domain,
  reducePercent: number, // 0.25 = reduce by 25%
  reason: string
): Promise<EmergencyReduceResult> {
  console.log(`🚨 [EMERGENCY] Reducing ${domain} position ${positionId} by ${(reducePercent * 100).toFixed(0)}%`);
  console.log(`   Reason: ${reason}`);

  const paperMode = process.env.PAPER_TRADING !== 'false';

  try {
    // Get the position details
    const positions = await getOpenPositions(domain);
    const position = positions.find(p => p.id === positionId);

    if (!position) {
      return {
        positionId,
        originalSize: 0,
        reducedBy: reducePercent,
        newSize: 0,
        reason,
        success: false,
        error: 'Position not found',
      };
    }

    const metadata = position.metadata as Record<string, unknown>;
    const originalSize = (metadata?.size_usd as number) || position.entryValueUsd;
    const reduceAmount = originalSize * reducePercent;
    const newSize = originalSize - reduceAmount;

    if (paperMode) {
      // Paper trading - just log and update database
      console.log(`   [PAPER] Would reduce $${reduceAmount.toFixed(2)} from position`);

      // Update position in database if full close
      if (reducePercent >= 1.0) {
        await closePosition(domain, positionId, {
          currentValueUsd: position.currentValueUsd,
          realizedPnl: position.currentValueUsd - position.entryValueUsd,
        });
      }

      return {
        positionId,
        originalSize,
        reducedBy: reducePercent,
        newSize,
        reason,
        success: true,
      };
    }

    // Real trading
    if (domain === 'perps') {
      // Check if wallet is initialized
      const privateKey = process.env.HYPERLIQUID_PRIVATE_KEY as `0x${string}` | undefined;
      if (!privateKey) {
        return {
          positionId,
          originalSize,
          reducedBy: reducePercent,
          newSize,
          reason,
          success: false,
          error: 'HYPERLIQUID_PRIVATE_KEY not set. Cannot execute real trades.',
        };
      }

      // Initialize wallet if needed
      hyperliquidClient.initializeWallet(privateKey);

      // Execute the close order
      const symbol = position.target;
      const side = (metadata?.side as 'LONG' | 'SHORT') || 'LONG';

      const result = await hyperliquidClient.closePosition(symbol, side, reduceAmount);
      console.log(`   ✅ Position reduced: fill price $${result.fillPrice}, order ${result.orderId}`);

      // Update position in database
      if (reducePercent >= 1.0) {
        await closePosition(domain, positionId, {
          currentValueUsd: position.currentValueUsd,
          realizedPnl: position.currentValueUsd - position.entryValueUsd,
        });
      }

      return {
        positionId,
        originalSize,
        reducedBy: reducePercent,
        newSize,
        reason,
        success: true,
      };
    }

    // Other domains - placeholder for now
    return {
      positionId,
      originalSize,
      reducedBy: reducePercent,
      newSize,
      reason,
      success: false,
      error: `Real trading not yet implemented for ${domain}`,
    };
  } catch (error) {
    console.error(`   ❌ Emergency reduce failed:`, error);
    return {
      positionId,
      originalSize: 0,
      reducedBy: reducePercent,
      newSize: 0,
      reason,
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Monitor all perps positions for liquidation risk
 * Should be called periodically (every 1-5 minutes for perps)
 */
export async function checkAllPerpsLiquidationRisk(): Promise<LiquidationRiskResult[]> {
  const positions = await getOpenPositions('perps');
  const results: LiquidationRiskResult[] = [];

  // Fetch all current prices from Hyperliquid
  let hyperliquidMids: Record<string, string> = {};
  try {
    hyperliquidMids = await hyperliquidClient.getAllMids();
  } catch (error) {
    console.warn('[PositionMonitor] Failed to fetch Hyperliquid prices for liquidation check:', error);
    // Return empty results if we can't get prices
    return [];
  }

  for (const position of positions) {
    const symbol = position.target; // e.g., "BTC", "ETH"
    const midPriceStr = hyperliquidMids[symbol];

    if (!midPriceStr) {
      console.warn(`[PositionMonitor] No price for ${symbol}, skipping liquidation check`);
      continue;
    }

    const currentMarkPrice = parseFloat(midPriceStr);

    // Extract position metadata
    const metadata = position.metadata as Record<string, unknown>;
    const entryPrice = (metadata?.entry_price as number) || currentMarkPrice;
    const size = (metadata?.size_usd as number) || position.entryValueUsd;
    const side = (metadata?.side as string) || 'LONG';
    const leverage = (metadata?.leverage as number) || 1;

    // Calculate current value and P&L
    let pnl = 0;
    if (side === 'LONG') {
      pnl = size * ((currentMarkPrice - entryPrice) / entryPrice);
    } else {
      pnl = size * ((entryPrice - currentMarkPrice) / entryPrice);
    }

    const currentValue = size + pnl;
    const margin = size / leverage;

    // Calculate margin ratio (equity / initial margin)
    // equity = position value + pnl = margin + pnl
    const equity = margin + pnl;
    const marginRatio = margin > 0 ? equity / margin : 0.5;

    // Calculate liquidation price using Hyperliquid's formula
    // For longs: liq_price = entry_price * (1 - 1/leverage + maintenance_margin)
    // For shorts: liq_price = entry_price * (1 + 1/leverage - maintenance_margin)
    const maintenanceMargin = 0.03; // 3% maintenance margin typical for Hyperliquid
    const liquidationPrice = hyperliquidClient.calculateLiquidationPrice(
      entryPrice,
      side as 'LONG' | 'SHORT',
      leverage,
      maintenanceMargin
    );

    const assessment = assessLiquidationRisk(marginRatio, currentMarkPrice, liquidationPrice);

    const result: LiquidationRiskResult = {
      positionId: position.id,
      symbol,
      marginRatio,
      liquidationPrice,
      currentPrice: currentMarkPrice,
      ...assessment,
    };

    results.push(result);

    // Take automatic action if needed
    if (assessment.recommendedAction !== 'none' && assessment.recommendedAction !== 'monitor') {
      let reducePercent = 0;
      switch (assessment.recommendedAction) {
        case 'reduce_25':
          reducePercent = 0.25;
          break;
        case 'reduce_50':
          reducePercent = 0.50;
          break;
        case 'close':
          reducePercent = 1.0;
          break;
      }

      if (reducePercent > 0) {
        const reason = `Liquidation risk ${assessment.riskLevel}: margin at ${(marginRatio * 100).toFixed(1)}%`;
        await executeEmergencyReduce(position.id, 'perps', reducePercent, reason);
      }
    }

    // Log warnings
    if (assessment.riskLevel === 'warning') {
      console.log(`⚠️ [PERPS] ${symbol} margin warning: ${(marginRatio * 100).toFixed(1)}%`);
    } else if (assessment.riskLevel === 'danger') {
      console.log(`🔶 [PERPS] ${symbol} in DANGER zone: ${(marginRatio * 100).toFixed(1)}%`);
    } else if (assessment.riskLevel === 'critical') {
      console.log(`🚨 [PERPS] ${symbol} CRITICAL: ${(marginRatio * 100).toFixed(1)}%`);
    }
  }

  return results;
}

/**
 * Start dedicated perps liquidation monitor
 * Runs more frequently than position monitor (every 2 minutes)
 */
export class PerpsLiquidationMonitor {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private readonly CHECK_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

  start(): void {
    if (this.isRunning) {
      console.log('[PerpsMonitor] Already running');
      return;
    }

    console.log('[PerpsMonitor] Starting perps liquidation monitor...');
    this.isRunning = true;

    // Run immediately
    this.check().catch(err => console.error('[PerpsMonitor] Initial check failed:', err));

    // Set up interval
    this.checkInterval = setInterval(async () => {
      try {
        await this.check();
      } catch (error) {
        console.error('[PerpsMonitor] Check failed:', error);
      }
    }, this.CHECK_INTERVAL_MS);

    console.log(`[PerpsMonitor] Checking every ${this.CHECK_INTERVAL_MS / 1000} seconds`);
  }

  stop(): void {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log('[PerpsMonitor] Stopped');
  }

  private async check(): Promise<void> {
    const results = await checkAllPerpsLiquidationRisk();
    const atRisk = results.filter(r => r.riskLevel !== 'safe');

    if (atRisk.length > 0) {
      console.log(`[PerpsMonitor] ${atRisk.length} positions at risk`);
    }
  }
}

// Singleton perps monitor
export const perpsLiquidationMonitor = new PerpsLiquidationMonitor();
