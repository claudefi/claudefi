/**
 * Test Fixtures for Decisions
 *
 * Provides realistic decision data for testing
 */

import type { AgentDecision, Domain } from '../../types/index.js';

export const spotDecisions: AgentDecision[] = [
  {
    domain: 'spot',
    action: 'buy',
    target: 'SOL',
    reasoning: 'Strong uptrend with volume confirmation. RSI oversold at 28.',
    confidence: 0.82,
    amountUsd: 500,
  },
  {
    domain: 'spot',
    action: 'sell',
    target: 'SOL',
    reasoning: 'Reached profit target of 15%. Taking profits before resistance.',
    confidence: 0.88,
    amountUsd: 575,
  },
  {
    domain: 'spot',
    action: 'hold',
    target: undefined,
    reasoning: 'Market consolidating. Waiting for clear direction.',
    confidence: 0.65,
  },
];

export const perpsDecisions: AgentDecision[] = [
  {
    domain: 'perps',
    action: 'buy',
    target: 'BTC-PERP',
    reasoning: 'Long setup: 5x leverage at $42,000 support. Stop at $40,500.',
    confidence: 0.75,
    amountUsd: 1000,
  },
  {
    domain: 'perps',
    action: 'sell',
    target: 'ETH-PERP',
    reasoning: 'Short setup: 3x leverage at resistance. Funding rate extremely positive.',
    confidence: 0.70,
    amountUsd: 750,
  },
  {
    domain: 'perps',
    action: 'hold',
    target: undefined,
    reasoning: 'High volatility. Avoiding new positions until calm.',
    confidence: 0.80,
  },
];

export const polymarketDecisions: AgentDecision[] = [
  {
    domain: 'polymarket',
    action: 'buy',
    target: 'ELECTION_2024',
    reasoning: 'Market probability 45%, my model shows 60%. +15% edge with Kelly sizing.',
    confidence: 0.85,
    amountUsd: 300,
  },
  {
    domain: 'polymarket',
    action: 'sell',
    target: 'ELECTION_2024',
    reasoning: 'Market resolved YES. Closing position for 2x return.',
    confidence: 0.95,
    amountUsd: 600,
  },
  {
    domain: 'polymarket',
    action: 'hold',
    target: undefined,
    reasoning: 'No markets with sufficient edge. Waiting for mispricing.',
    confidence: 0.60,
  },
];

export const dlmmDecisions: AgentDecision[] = [
  {
    domain: 'dlmm',
    action: 'buy',
    target: 'SOL-USDC-0.3%',
    reasoning: 'High volume pool with 24h APR of 125%. Tight bid-ask spread.',
    confidence: 0.78,
    amountUsd: 5000,
  },
  {
    domain: 'dlmm',
    action: 'sell',
    target: 'SOL-USDC-0.3%',
    reasoning: 'Accumulated $1,200 in fees over 3 days. IL minimal. Closing position.',
    confidence: 0.82,
    amountUsd: 6200,
  },
  {
    domain: 'dlmm',
    action: 'hold',
    target: undefined,
    reasoning: 'All profitable pools at capacity. Monitoring for new opportunities.',
    confidence: 0.70,
  },
];

export const lowConfidenceDecisions: AgentDecision[] = [
  {
    domain: 'spot',
    action: 'buy',
    target: 'RANDOM',
    reasoning: 'Speculative trade on low liquidity token.',
    confidence: 0.35,
    amountUsd: 100,
  },
  {
    domain: 'perps',
    action: 'buy',
    target: 'DEGEN-PERP',
    reasoning: 'High risk YOLO trade. 20x leverage.',
    confidence: 0.25,
    amountUsd: 50,
  },
];

export const highConfidenceDecisions: AgentDecision[] = [
  {
    domain: 'spot',
    action: 'buy',
    target: 'BTC',
    reasoning: 'Strong fundamentals. Institutional buying. Technical confluence.',
    confidence: 0.92,
    amountUsd: 2000,
  },
  {
    domain: 'polymarket',
    action: 'buy',
    target: 'SURE_BET',
    reasoning: 'Market probability 30%, insider info shows 95% YES. Max Kelly.',
    confidence: 0.98,
    amountUsd: 1000,
  },
];

export const holdDecisions: AgentDecision[] = [
  {
    domain: 'spot',
    action: 'hold',
    target: undefined,
    reasoning: 'No clear setup. Markets choppy.',
    confidence: 0.60,
  },
  {
    domain: 'perps',
    action: 'hold',
    target: undefined,
    reasoning: 'Waiting for funding rate to normalize.',
    confidence: 0.55,
  },
  {
    domain: 'polymarket',
    action: 'hold',
    target: undefined,
    reasoning: 'All markets fairly priced. No edge detected.',
    confidence: 0.70,
  },
  {
    domain: 'dlmm',
    action: 'hold',
    target: undefined,
    reasoning: 'Pool fees below threshold. Holding cash.',
    confidence: 0.65,
  },
];

export const largePositionDecisions: AgentDecision[] = [
  {
    domain: 'spot',
    action: 'buy',
    target: 'ETH',
    reasoning: 'High conviction long-term hold. Allocating significant capital.',
    confidence: 0.88,
    amountUsd: 10000,
  },
  {
    domain: 'perps',
    action: 'buy',
    target: 'BTC-PERP',
    reasoning: 'Max position size. Strong trend continuation setup.',
    confidence: 0.90,
    amountUsd: 15000,
  },
];

export const edgeCaseDecisions: AgentDecision[] = [
  {
    domain: 'spot',
    action: 'buy',
    target: 'TOKEN_WITH_SPECIAL_!@#$%',
    reasoning: 'Testing special characters in target name.',
    confidence: 0.50,
    amountUsd: 10,
  },
  {
    domain: 'perps',
    action: 'buy',
    target: 'EXTREME-LEVERAGE-100X',
    reasoning: 'Testing extreme leverage handling.',
    confidence: 0.20,
    amountUsd: 50,
  },
  {
    domain: 'polymarket',
    action: 'buy',
    target: 'MARKET_ID_' + 'X'.repeat(100),
    reasoning: 'Testing very long market IDs.',
    confidence: 0.40,
    amountUsd: 25,
  },
  {
    domain: 'dlmm',
    action: 'buy',
    target: '',
    reasoning: 'Testing empty target string.',
    confidence: 0.30,
    amountUsd: 5,
  },
];

export function getRandomDecision(domain?: Domain): AgentDecision {
  const allDecisions = [
    ...spotDecisions,
    ...perpsDecisions,
    ...polymarketDecisions,
    ...dlmmDecisions,
  ];

  const filtered = domain
    ? allDecisions.filter(d => d.domain === domain)
    : allDecisions;

  return filtered[Math.floor(Math.random() * filtered.length)];
}

export function getDecisionsByAction(action: 'buy' | 'sell' | 'hold'): AgentDecision[] {
  const allDecisions = [
    ...spotDecisions,
    ...perpsDecisions,
    ...polymarketDecisions,
    ...dlmmDecisions,
  ];

  return allDecisions.filter(d => d.action === action);
}

export function getDecisionsByConfidence(
  minConfidence: number,
  maxConfidence: number = 1.0
): AgentDecision[] {
  const allDecisions = [
    ...spotDecisions,
    ...perpsDecisions,
    ...polymarketDecisions,
    ...dlmmDecisions,
    ...lowConfidenceDecisions,
    ...highConfidenceDecisions,
  ];

  return allDecisions.filter(
    d => d.confidence >= minConfidence && d.confidence <= maxConfidence
  );
}
