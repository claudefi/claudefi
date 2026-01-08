/**
 * Portfolio Coordinator - Cross-Domain Intelligence
 *
 * Runs BEFORE domain subagents to:
 * 1. Set portfolio-wide risk level for the cycle
 * 2. Allocate capital budget per domain
 * 3. Identify cross-domain correlations and risks
 * 4. Generate shared market sentiment
 *
 * This creates a hierarchical structure:
 *   Portfolio Coordinator → Domain Subagents → Decisions
 *
 * The coordinator ensures domain subagents work together toward
 * portfolio-level goals rather than optimizing in isolation.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Domain, Portfolio } from '../types/index.js';
import { getPortfolio, getRecentDecisions } from '../db/index.js';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Portfolio directive that guides all domain subagents for this cycle
 */
export interface PortfolioDirective {
  /** Overall risk posture for this cycle */
  riskLevel: 'conservative' | 'normal' | 'aggressive';

  /** Budget allocated to each domain (USD) */
  domainBudgets: Record<Domain, number>;

  /** Shared market sentiment analysis */
  marketSentiment: {
    overall: 'bullish' | 'bearish' | 'neutral' | 'uncertain';
    summary: string;
    keyFactors: string[];
  };

  /** Warnings about correlated risks across domains */
  correlationWarnings: string[];

  /** Specific guidance for each domain */
  domainGuidance: Record<Domain, string>;

  /** Priority ranking of domains for this cycle */
  domainPriority: Domain[];

  /** Generated timestamp */
  timestamp: string;
}

/**
 * Market summary data for coordinator analysis
 */
export interface MarketSummary {
  btcPrice: number;
  btcChange24h: number;
  ethPrice: number;
  ethChange24h: number;
  solPrice: number;
  solChange24h: number;
  fearGreedIndex?: number;
  totalMarketCap?: number;
  dominance?: {
    btc: number;
    eth: number;
  };
}

/**
 * Performance by domain for allocation decisions
 */
interface DomainPerformance {
  domain: Domain;
  totalPnl: number;
  winRate: number;
  avgConfidence: number;
  recentTrend: 'improving' | 'stable' | 'declining';
}

// =============================================================================
// COORDINATOR IMPLEMENTATION
// =============================================================================

/**
 * Default budget allocation percentages by domain
 */
const DEFAULT_ALLOCATION: Record<Domain, number> = {
  dlmm: 0.30,      // 30% - Stable yield
  perps: 0.25,     // 25% - High risk/reward
  spot: 0.25,      // 25% - Momentum plays
  polymarket: 0.20, // 20% - Event-driven
};

/**
 * Analyze recent performance to determine optimal allocations
 */
async function analyzeDomainPerformance(): Promise<DomainPerformance[]> {
  const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
  const performances: DomainPerformance[] = [];

  for (const domain of domains) {
    const decisions = await getRecentDecisions(domain, 20);

    // Calculate metrics
    const completedDecisions = decisions.filter(d =>
      d.outcome === 'profitable' || d.outcome === 'loss'
    );

    const wins = completedDecisions.filter(d => d.outcome === 'profitable');
    const winRate = completedDecisions.length > 0
      ? wins.length / completedDecisions.length
      : 0.5; // Default to neutral

    const totalPnl = completedDecisions.reduce(
      (sum, d) => sum + (d.realizedPnl || 0),
      0
    );

    const avgConfidence = decisions.length > 0
      ? decisions.reduce((sum, d) => sum + d.confidence, 0) / decisions.length
      : 0.5;

    // Determine trend (simple: compare first half vs second half)
    let recentTrend: 'improving' | 'stable' | 'declining' = 'stable';
    if (completedDecisions.length >= 4) {
      const mid = Math.floor(completedDecisions.length / 2);
      const firstHalf = completedDecisions.slice(0, mid);
      const secondHalf = completedDecisions.slice(mid);

      const firstWinRate = firstHalf.filter(d => d.outcome === 'profitable').length / firstHalf.length;
      const secondWinRate = secondHalf.filter(d => d.outcome === 'profitable').length / secondHalf.length;

      if (secondWinRate > firstWinRate + 0.1) recentTrend = 'improving';
      else if (secondWinRate < firstWinRate - 0.1) recentTrend = 'declining';
    }

    performances.push({
      domain,
      totalPnl,
      winRate,
      avgConfidence,
      recentTrend,
    });
  }

  return performances;
}

/**
 * Calculate risk-adjusted allocations based on performance
 */
function calculateAllocations(
  performances: DomainPerformance[],
  portfolio: Portfolio,
  riskLevel: 'conservative' | 'normal' | 'aggressive'
): Record<Domain, number> {
  const totalBudget = portfolio.totalValueUsd;
  const allocations: Record<Domain, number> = {
    dlmm: 0,
    perps: 0,
    polymarket: 0,
    spot: 0,
  };

  // Risk multipliers
  const riskMultipliers = {
    conservative: { dlmm: 1.2, perps: 0.6, polymarket: 0.8, spot: 0.7 },
    normal: { dlmm: 1.0, perps: 1.0, polymarket: 1.0, spot: 1.0 },
    aggressive: { dlmm: 0.7, perps: 1.3, polymarket: 1.1, spot: 1.3 },
  };

  // Performance multipliers (reward improving domains)
  const trendMultipliers = {
    improving: 1.15,
    stable: 1.0,
    declining: 0.85,
  };

  // Calculate weighted allocations
  let totalWeight = 0;
  const weights: Record<Domain, number> = {
    dlmm: 0,
    perps: 0,
    polymarket: 0,
    spot: 0,
  };

  for (const perf of performances) {
    const baseAllocation = DEFAULT_ALLOCATION[perf.domain];
    const riskMult = riskMultipliers[riskLevel][perf.domain];
    const trendMult = trendMultipliers[perf.recentTrend];
    const winRateMult = 0.5 + perf.winRate; // 0.5 to 1.5 range

    weights[perf.domain] = baseAllocation * riskMult * trendMult * winRateMult;
    totalWeight += weights[perf.domain];
  }

  // Normalize to sum to 1
  for (const domain of Object.keys(weights) as Domain[]) {
    allocations[domain] = (weights[domain] / totalWeight) * totalBudget;
  }

  return allocations;
}

/**
 * Identify cross-domain correlations and risks
 */
function identifyCorrelations(
  performances: DomainPerformance[],
  marketSummary: MarketSummary
): string[] {
  const warnings: string[] = [];

  // Check for correlated losses
  const decliningDomains = performances.filter(p => p.recentTrend === 'declining');
  if (decliningDomains.length >= 2) {
    warnings.push(
      `Multiple domains declining: ${decliningDomains.map(d => d.domain).join(', ')}. Consider reducing overall exposure.`
    );
  }

  // Check crypto correlation (BTC down affects DLMM, Perps, Spot)
  if (marketSummary.btcChange24h < -5) {
    warnings.push(
      `BTC down ${marketSummary.btcChange24h.toFixed(1)}%. DLMM, Perps, and Spot are correlated - reduce crypto exposure.`
    );
  }

  // Check SOL specifically for DLMM and Spot
  if (marketSummary.solChange24h < -8) {
    warnings.push(
      `SOL down ${marketSummary.solChange24h.toFixed(1)}%. DLMM and Spot (Solana-based) at elevated risk.`
    );
  }

  // Check for overconcentration
  const topPerformers = performances
    .sort((a, b) => b.winRate - a.winRate)
    .slice(0, 2);

  if (topPerformers[0].winRate > 0.7 && topPerformers[1].winRate < 0.4) {
    warnings.push(
      `Performance highly concentrated in ${topPerformers[0].domain}. Diversification risk if market regime changes.`
    );
  }

  return warnings;
}

/**
 * Generate domain-specific guidance based on portfolio context
 */
function generateDomainGuidance(
  performances: DomainPerformance[],
  riskLevel: 'conservative' | 'normal' | 'aggressive',
  marketSummary: MarketSummary
): Record<Domain, string> {
  const guidance: Record<Domain, string> = {
    dlmm: '',
    perps: '',
    polymarket: '',
    spot: '',
  };

  const perfMap = new Map(performances.map(p => [p.domain, p]));

  // DLMM guidance
  const dlmmPerf = perfMap.get('dlmm')!;
  if (marketSummary.solChange24h < -3) {
    guidance.dlmm = 'SOL volatility elevated. Prefer stable pairs (SOL-USDC) over volatile pairs. Avoid adding new positions.';
  } else if (dlmmPerf.recentTrend === 'improving') {
    guidance.dlmm = 'DLMM performance improving. Continue current strategy, consider slightly larger positions.';
  } else {
    guidance.dlmm = 'Standard DLMM operation. Focus on high-TVL pools with strong fee generation.';
  }

  // Perps guidance
  const perpsPerf = perfMap.get('perps')!;
  if (riskLevel === 'conservative') {
    guidance.perps = 'Conservative mode: Max 3x leverage, stop losses at -10%, but let winners run - don\'t exit profitable positions early.';
  } else if (marketSummary.btcChange24h > 5) {
    guidance.perps = 'Strong BTC momentum. Look for continuation longs with momentum confirmation.';
  } else if (marketSummary.btcChange24h < -5) {
    guidance.perps = 'BTC weakness. Prefer short setups or wait for clear reversal signals. Reduce position sizes.';
  } else {
    guidance.perps = `Standard perps operation. Recent win rate: ${(perpsPerf.winRate * 100).toFixed(0)}%.`;
  }

  // Polymarket guidance
  const polyPerf = perfMap.get('polymarket')!;
  guidance.polymarket = `Event-driven focus. Recent performance: ${polyPerf.recentTrend}. Maintain diversification across event types.`;

  // Spot guidance
  const spotPerf = perfMap.get('spot')!;
  if (riskLevel === 'aggressive' && spotPerf.recentTrend === 'improving') {
    guidance.spot = 'Aggressive mode with improving spot performance. Increase allocation to high-momentum tokens. Let winners run to +50%+ before taking profits.';
  } else if (marketSummary.solChange24h < -5) {
    guidance.spot = 'SOL ecosystem weak. Reduce memecoin exposure, focus on established tokens only. But don\'t panic-sell existing winners.';
  } else {
    guidance.spot = 'Standard spot operation. Aim for larger wins (+30-50%) rather than quick small exits. Only cut losers fast, let winners run.';
  }

  return guidance;
}

/**
 * Use Claude to generate market sentiment analysis
 */
async function analyzeMarketSentiment(
  marketSummary: MarketSummary,
  portfolio: Portfolio
): Promise<PortfolioDirective['marketSentiment']> {
  const anthropic = new Anthropic();

  const prompt = `Analyze the current crypto market conditions and provide a brief sentiment assessment.

## Market Data
- BTC: $${marketSummary.btcPrice.toFixed(0)} (${marketSummary.btcChange24h >= 0 ? '+' : ''}${marketSummary.btcChange24h.toFixed(1)}% 24h)
- ETH: $${marketSummary.ethPrice.toFixed(0)} (${marketSummary.ethChange24h >= 0 ? '+' : ''}${marketSummary.ethChange24h.toFixed(1)}% 24h)
- SOL: $${marketSummary.solPrice.toFixed(0)} (${marketSummary.solChange24h >= 0 ? '+' : ''}${marketSummary.solChange24h.toFixed(1)}% 24h)
${marketSummary.fearGreedIndex ? `- Fear & Greed Index: ${marketSummary.fearGreedIndex}` : ''}

## Portfolio Context
- Total Value: $${portfolio.totalValueUsd.toFixed(2)}
- Open Positions: ${portfolio.positions.length}

Respond in JSON format only:
{
  "overall": "bullish" | "bearish" | "neutral" | "uncertain",
  "summary": "One sentence market summary",
  "keyFactors": ["factor1", "factor2", "factor3"]
}`;

  try {
    const response = await anthropic.messages.create({
      model: 'claude-opus-4-5-20251101', // Always use Opus 4.5 for best quality
      max_tokens: 300,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].type === 'text' ? response.content[0].text : '{}';

    // Parse JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
  } catch (error) {
    console.warn('Failed to analyze market sentiment:', error);
  }

  // Fallback sentiment based on simple rules
  let overall: 'bullish' | 'bearish' | 'neutral' | 'uncertain' = 'neutral';
  if (marketSummary.btcChange24h > 3 && marketSummary.ethChange24h > 2) {
    overall = 'bullish';
  } else if (marketSummary.btcChange24h < -3 && marketSummary.ethChange24h < -2) {
    overall = 'bearish';
  } else if (Math.abs(marketSummary.btcChange24h) > 5) {
    overall = 'uncertain';
  }

  return {
    overall,
    summary: `BTC ${marketSummary.btcChange24h >= 0 ? 'up' : 'down'} ${Math.abs(marketSummary.btcChange24h).toFixed(1)}%, market ${overall}.`,
    keyFactors: [
      `BTC ${marketSummary.btcChange24h >= 0 ? '+' : ''}${marketSummary.btcChange24h.toFixed(1)}%`,
      `SOL ${marketSummary.solChange24h >= 0 ? '+' : ''}${marketSummary.solChange24h.toFixed(1)}%`,
    ],
  };
}

/**
 * Determine overall risk level based on market conditions and portfolio
 */
function determineRiskLevel(
  marketSummary: MarketSummary,
  portfolio: Portfolio,
  performances: DomainPerformance[]
): 'conservative' | 'normal' | 'aggressive' {
  let riskScore = 50; // Start neutral

  // Market factors
  if (marketSummary.btcChange24h > 5) riskScore += 15;
  else if (marketSummary.btcChange24h < -5) riskScore -= 20;

  if (marketSummary.solChange24h > 5) riskScore += 10;
  else if (marketSummary.solChange24h < -5) riskScore -= 15;

  // Fear & Greed (if available)
  if (marketSummary.fearGreedIndex) {
    if (marketSummary.fearGreedIndex > 70) riskScore += 10; // Greed = more aggressive
    else if (marketSummary.fearGreedIndex < 30) riskScore -= 15; // Fear = conservative
  }

  // Performance factors
  const avgWinRate = performances.reduce((sum, p) => sum + p.winRate, 0) / performances.length;
  if (avgWinRate > 0.6) riskScore += 10;
  else if (avgWinRate < 0.4) riskScore -= 15;

  const improvingCount = performances.filter(p => p.recentTrend === 'improving').length;
  const decliningCount = performances.filter(p => p.recentTrend === 'declining').length;
  riskScore += (improvingCount - decliningCount) * 5;

  // Portfolio factors
  const totalPnl = performances.reduce((sum, p) => sum + p.totalPnl, 0);
  if (totalPnl > portfolio.totalValueUsd * 0.1) riskScore += 10; // Up >10%
  else if (totalPnl < -portfolio.totalValueUsd * 0.1) riskScore -= 20; // Down >10%

  // Map score to risk level
  if (riskScore >= 65) return 'aggressive';
  if (riskScore <= 35) return 'conservative';
  return 'normal';
}

// =============================================================================
// MAIN EXPORT
// =============================================================================

/**
 * Generate portfolio directive for this cycle
 *
 * Call this at the START of each Ralph Loop cycle, BEFORE domain subagents.
 * The directive guides all domain decisions for coordinated portfolio management.
 */
export async function getPortfolioDirective(
  marketSummary: MarketSummary
): Promise<PortfolioDirective> {
  console.log('\n🎯 Portfolio Coordinator analyzing...');

  // Get current portfolio state
  const portfolio = await getPortfolio();
  console.log(`   Portfolio value: $${portfolio.totalValueUsd.toFixed(2)}`);

  // Analyze domain performance
  const performances = await analyzeDomainPerformance();
  console.log('   Domain performance analyzed');

  // Determine risk level
  const riskLevel = determineRiskLevel(marketSummary, portfolio, performances);
  console.log(`   Risk level: ${riskLevel.toUpperCase()}`);

  // Calculate allocations
  const domainBudgets = calculateAllocations(performances, portfolio, riskLevel);
  console.log('   Budgets allocated');

  // Get market sentiment
  const marketSentiment = await analyzeMarketSentiment(marketSummary, portfolio);
  console.log(`   Market sentiment: ${marketSentiment.overall}`);

  // Identify correlations
  const correlationWarnings = identifyCorrelations(performances, marketSummary);
  if (correlationWarnings.length > 0) {
    console.log(`   ⚠️  ${correlationWarnings.length} correlation warning(s)`);
  }

  // Generate domain guidance
  const domainGuidance = generateDomainGuidance(performances, riskLevel, marketSummary);

  // Determine priority order
  const domainPriority = performances
    .sort((a, b) => {
      // Prioritize improving domains with good win rates
      const aScore = (a.winRate * 10) + (a.recentTrend === 'improving' ? 3 : a.recentTrend === 'declining' ? -3 : 0);
      const bScore = (b.winRate * 10) + (b.recentTrend === 'improving' ? 3 : b.recentTrend === 'declining' ? -3 : 0);
      return bScore - aScore;
    })
    .map(p => p.domain);

  const directive: PortfolioDirective = {
    riskLevel,
    domainBudgets,
    marketSentiment,
    correlationWarnings,
    domainGuidance,
    domainPriority,
    timestamp: new Date().toISOString(),
  };

  console.log('   ✅ Portfolio directive generated\n');

  return directive;
}

/**
 * Format directive for injection into domain prompts
 */
export function formatDirectiveForPrompt(directive: PortfolioDirective, domain: Domain): string {
  const budget = directive.domainBudgets[domain];
  const guidance = directive.domainGuidance[domain];
  const priority = directive.domainPriority.indexOf(domain) + 1;

  let text = `## Portfolio Coordinator Directive

**Risk Level:** ${directive.riskLevel.toUpperCase()}
**Your Budget:** $${budget.toFixed(2)}
**Domain Priority:** ${priority} of ${directive.domainPriority.length}

### Market Sentiment
**Overall:** ${directive.marketSentiment.overall}
${directive.marketSentiment.summary}

Key Factors:
${directive.marketSentiment.keyFactors.map(f => `- ${f}`).join('\n')}

### Your Guidance
${guidance}
`;

  if (directive.correlationWarnings.length > 0) {
    text += `
### ⚠️ Portfolio Warnings
${directive.correlationWarnings.map(w => `- ${w}`).join('\n')}
`;
  }

  return text;
}

/**
 * Fetch market summary from real price feeds
 */
export async function fetchMarketSummary(): Promise<MarketSummary> {
  console.log('📊 Fetching market summary from live APIs...');

  const results = await Promise.allSettled([
    fetchBinancePrices(),
    fetchFearGreedIndex(),
  ]);

  // Parse Binance prices
  let btcPrice = 95000, btcChange24h = 0;
  let ethPrice = 3500, ethChange24h = 0;
  let solPrice = 200, solChange24h = 0;

  if (results[0].status === 'fulfilled') {
    const prices = results[0].value;
    btcPrice = prices.btcPrice;
    btcChange24h = prices.btcChange24h;
    ethPrice = prices.ethPrice;
    ethChange24h = prices.ethChange24h;
    solPrice = prices.solPrice;
    solChange24h = prices.solChange24h;
    console.log(`   BTC: $${btcPrice.toFixed(0)} (${btcChange24h >= 0 ? '+' : ''}${btcChange24h.toFixed(1)}%)`);
    console.log(`   SOL: $${solPrice.toFixed(0)} (${solChange24h >= 0 ? '+' : ''}${solChange24h.toFixed(1)}%)`);
  } else {
    console.warn('   ⚠️ Failed to fetch Binance prices, using defaults');
  }

  // Parse Fear & Greed
  let fearGreedIndex = 50;
  if (results[1].status === 'fulfilled') {
    fearGreedIndex = results[1].value;
    console.log(`   Fear & Greed: ${fearGreedIndex}`);
  }

  return {
    btcPrice,
    btcChange24h,
    ethPrice,
    ethChange24h,
    solPrice,
    solChange24h,
    fearGreedIndex,
  };
}

/**
 * Fetch BTC, ETH, SOL prices from Binance public API
 */
async function fetchBinancePrices(): Promise<{
  btcPrice: number;
  btcChange24h: number;
  ethPrice: number;
  ethChange24h: number;
  solPrice: number;
  solChange24h: number;
}> {
  const symbols = ['BTCUSDT', 'ETHUSDT', 'SOLUSDT'];
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbols=${JSON.stringify(symbols)}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Binance API error: ${response.status}`);
    }

    const data = await response.json() as Array<{
      symbol: string;
      lastPrice: string;
      priceChangePercent: string;
    }>;

    const btc = data.find(d => d.symbol === 'BTCUSDT');
    const eth = data.find(d => d.symbol === 'ETHUSDT');
    const sol = data.find(d => d.symbol === 'SOLUSDT');

    return {
      btcPrice: btc ? parseFloat(btc.lastPrice) : 95000,
      btcChange24h: btc ? parseFloat(btc.priceChangePercent) : 0,
      ethPrice: eth ? parseFloat(eth.lastPrice) : 3500,
      ethChange24h: eth ? parseFloat(eth.priceChangePercent) : 0,
      solPrice: sol ? parseFloat(sol.lastPrice) : 200,
      solChange24h: sol ? parseFloat(sol.priceChangePercent) : 0,
    };
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}

/**
 * Fetch Fear & Greed Index from Alternative.me
 */
async function fetchFearGreedIndex(): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch('https://api.alternative.me/fng/?limit=1', {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!response.ok) {
      throw new Error(`Fear & Greed API error: ${response.status}`);
    }

    const data = await response.json() as {
      data: Array<{ value: string }>;
    };

    return data.data?.[0]?.value ? parseInt(data.data[0].value, 10) : 50;
  } catch (error) {
    clearTimeout(timeout);
    throw error;
  }
}
