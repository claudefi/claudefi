/**
 * Decision Generator
 * Creates realistic trading decisions with domain-specific reasoning
 */

import { CONFIG, type Domain } from '../config.js';
import {
  generateConfidence,
  generateMarketConditions,
  generateUUID,
  addHours,
  randomItem,
  randomInt,
  round2,
} from '../utils.js';
import type { GeneratedPosition } from './positions.js';

export interface GeneratedDecision {
  id: string;
  domain: Domain;
  action: string;
  target: string | null;
  amountUsd: number | null;
  reasoning: string;
  confidence: number;
  outcome: 'profit' | 'loss' | 'pending' | null;
  realizedPnl: number | null;
  pnlPercent: number | null;
  skillsApplied: string[];
  marketConditions: Record<string, unknown>;
  decisionTimestamp: Date;
  positionId?: string; // Link to position
}

// Reasoning templates by domain and action
const REASONING_TEMPLATES = {
  dlmm: {
    hold: [
      'Already at maximum 3 positions with well-diversified allocation across high-quality pools. Fear Index at {fear}.',
      'Current positions performing well with {apr}% combined APR. No better opportunities identified in current market.',
      'Market volatility elevated (Fear Index {fear}). Maintaining existing LP positions rather than adding new exposure.',
      'Portfolio at target allocation across {poolCount} pools. Waiting for better entry on new positions.',
    ],
    add_liquidity: [
      '{pool} pool shows strong APR of {apr}% with TVL of ${tvl}M. Entering with spot strategy.',
      'High volume detected in {pool}. APR at {apr}% with healthy TVL. Adding liquidity to capture fees.',
      'Market dip creating opportunity in {pool}. Current APR {apr}%, entering with tight bin range.',
      '{pool} offering attractive risk-reward with {apr}% APR. BTC at ${btcPrice}, sentiment {sentiment}.',
    ],
    remove_liquidity: [
      'Taking profits from {pool} position at +{pnl}% gain. APR declined below target threshold.',
      '{pool} position showing signs of impermanent loss. Exiting to preserve capital. Fear Index {fear}.',
      'Rebalancing portfolio - removing liquidity from {pool} to redeploy into higher-yield opportunity.',
      'Closing {pool} position after {duration} days. Captured {apr}% in fees, IL manageable.',
    ],
  },
  perps: {
    hold: [
      'No clear setup in current {symbol} price action. RSI at {rsi}, waiting for confirmation.',
      'Already have {posCount} open positions. Risk management prevents additional exposure.',
      'BTC at ${btcPrice}, market indecisive. Sitting on hands until clearer direction emerges.',
      '{symbol} consolidating in range. No edge identified for new position entry.',
    ],
    open_long: [
      'RSI oversold at {rsi} on {symbol}. Entering 3x long with stop below recent support. Target +{target}%.',
      '{symbol} showing bullish divergence on 4H. Funding rate favorable for longs at {funding}%.',
      'BTC breaking above ${btcPrice}, {symbol} lagging. Catching up trade with {leverage}x long.',
      'Strong volume spike on {symbol} with positive price action. Fear Index at {fear} suggests capitulation complete.',
    ],
    open_short: [
      '{symbol} hitting resistance at key level. RSI overbought at {rsi}. Opening 3x short.',
      'Bearish setup on {symbol} with funding rate unfavorable at {funding}%. Shorting with tight stop.',
      'BTC rejection at ${btcPrice}, expecting {symbol} to follow. Short entry with {leverage}x.',
      'Market showing distribution pattern. Shorting {symbol} with target at lower support.',
    ],
    close_position: [
      'Hit +{pnl}% target on {symbol} {side}. In bearish markets, a bird in hand beats two in the bush.',
      'Stop loss triggered on {symbol} at -{pnl}%. Cutting losses quickly per risk management rules.',
      'Taking profit on {symbol} {side} at +{pnl}%. Funding turning against position.',
      'Closing {symbol} position after {duration}h. Target reached, no need to be greedy.',
    ],
  },
  polymarket: {
    hold: [
      'No mispriced markets identified in current scan. Maintaining existing {posCount} positions.',
      'Markets efficiently priced around current events. Waiting for news catalyst to create edge.',
      'Fear Index at {fear} suggests irrational pricing may emerge. Keeping powder dry.',
      'Current positions have best risk-reward. No action needed on portfolio of {posCount} bets.',
    ],
    buy_yes: [
      'Market prices YES at {market}% but analysis suggests true probability is {estimate}%. Edge of +{edge}%.',
      '{question} - News suggests higher probability than {market}% market price. Buying YES shares.',
      'Contrarian YES play on {category} market. Crowd pessimism creating opportunity at {market}%.',
      'Strong conviction on positive outcome. Market at {market}% YES, my estimate {estimate}%. Sizing per Kelly.',
    ],
    buy_no: [
      'Market overpricing YES at {market}%. True probability closer to {estimate}%. Buying NO for +{edge}% edge.',
      '{question} - Analysis indicates lower probability than market. NO shares at {noPrice}% attractive.',
      'Fading the crowd on {category} market. YES overpriced at {market}%, buying NO.',
      'Event unlikely to occur despite {market}% YES price. Edge on NO side significant.',
    ],
    sell: [
      'Closing {outcome} position at +{pnl}% profit. Market moved favorably, locking in gains.',
      'Cutting {outcome} position at -{pnl}% loss. New information changed thesis.',
      'Market resolution approaching in {days}d. De-risking {outcome} position ahead of outcome.',
      'Taking profit on {question}. Price moved from {entry}% to {current}%.',
    ],
  },
  spot: {
    hold: [
      'No compelling setups in current memecoin market. Fear Index {fear} suggests caution.',
      'Watching {watchlist} for entry. Current prices not at target levels.',
      'Already have {posCount} positions. Risk management limits prevent new entries.',
      'Market showing weakness. Holding cash until better opportunities emerge.',
    ],
    buy: [
      'Strong volume surge on {symbol}, RSI oversold at {rsi}. Entering with tight 3% stop loss.',
      '{symbol} has highest GT score ({score}/100) with strong momentum. Entry at ${price}.',
      'Breakout on {symbol} with {volume} 24h volume. Fear Index at {fear}, contrarian entry.',
      '{symbol} showing accumulation pattern. Risk/reward favorable at current levels.',
    ],
    sell: [
      '{symbol} is now at +{pnl}% gain (above 25% profit target). Fear Index {fear}. Locking in profits.',
      'Closing {symbol} at +{pnl}%. Coordinator directive is CONSERVATIVE - securing gains.',
      '{symbol} hitting resistance. Taking full exit at +{pnl}% after {duration}h hold.',
      'Stop loss triggered on {symbol} at -{pnl}%. Risk management working as intended.',
    ],
    partial_sell: [
      '{symbol} is up +{pnl}% with strong momentum ({buyRatio}% buy ratio). Taking 50% off, riding remainder.',
      'Profit-taking at +{pnl}% on {symbol}. Selling half to lock gains, letting winner run.',
      'Risk management - reducing {symbol} position size by 50% at +{pnl}%. Trailing stop on remainder.',
      '{symbol} extended at +{pnl}%. Partial sell to secure profits while maintaining exposure.',
    ],
  },
};

// Skills that might be applied
const SKILLS_BY_DOMAIN: Record<Domain, string[]> = {
  dlmm: ['avoid-low-liquidity-pools', 'fee-optimization', 'il-management', 'bin-range-strategy'],
  perps: ['stop-loss-discipline', 'leverage-control', 'funding-rate-arb', 'trend-following'],
  polymarket: ['probability-calibration', 'news-catalyst-trading', 'kelly-criterion', 'contrarian-edge'],
  spot: ['memecoin-momentum', 'volume-analysis', 'profit-taking', 'cut-losses-fast'],
};

function fillTemplate(template: string, vars: Record<string, string | number>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value));
  }
  return result;
}

function generateDecisionForPosition(
  position: GeneratedPosition,
  type: 'entry' | 'monitoring' | 'exit',
  timestamp: Date
): GeneratedDecision {
  const { fearGreed, btcPrice, sentiment } = generateMarketConditions();
  const domain = position.domain;

  let action: string;
  let reasoning: string;
  let outcome: 'profit' | 'loss' | 'pending' | null = null;
  let realizedPnl: number | null = null;
  let pnlPercent: number | null = null;

  const vars: Record<string, string | number> = {
    fear: fearGreed,
    btcPrice: Math.round(btcPrice),
    sentiment,
    symbol: position.targetName,
    pool: position.targetName,
    pnl: position.realizedPnl !== null ? Math.abs(round2((position.realizedPnl / position.entryValueUsd) * 100)) : randomInt(5, 35),
    duration: Math.round((position.closedAt?.getTime() ?? Date.now() - position.openedAt.getTime()) / (1000 * 60 * 60)),
    apr: randomInt(15, 55),
    tvl: round2(randomInt(1, 15)),
    rsi: randomInt(20, 80),
    leverage: randomItem([2, 3, 5]),
    funding: round2((Math.random() - 0.5) * 0.1),
    target: randomInt(10, 30),
    side: position.side || 'long',
    posCount: randomInt(1, 3),
    poolCount: randomInt(2, 3),
    market: randomInt(30, 70),
    estimate: randomInt(20, 80),
    edge: randomInt(5, 20),
    noPrice: randomInt(30, 70),
    question: (position.metadata.question as string)?.substring(0, 40) || 'Market question',
    category: (position.metadata.category as string) || 'Crypto',
    outcome: position.side || 'yes',
    days: randomInt(3, 21),
    entry: randomInt(30, 50),
    current: randomInt(40, 70),
    price: round2(Math.random() * 0.01),
    volume: `$${randomInt(1, 5)}M`,
    score: randomInt(55, 75),
    buyRatio: randomInt(55, 75),
    watchlist: 'DINO, FARTCOIN, SPARK',
  };

  if (type === 'entry') {
    // Entry decision
    switch (domain) {
      case 'dlmm':
        action = 'add_liquidity';
        reasoning = fillTemplate(randomItem(REASONING_TEMPLATES.dlmm.add_liquidity), vars);
        break;
      case 'perps':
        action = position.side === 'short' ? 'open_short' : 'open_long';
        reasoning = fillTemplate(randomItem(REASONING_TEMPLATES.perps[action as 'open_long' | 'open_short']), vars);
        break;
      case 'polymarket':
        action = position.side === 'no' ? 'buy_no' : 'buy_yes';
        reasoning = fillTemplate(randomItem(REASONING_TEMPLATES.polymarket[action as 'buy_yes' | 'buy_no']), vars);
        break;
      case 'spot':
        action = 'buy';
        reasoning = fillTemplate(randomItem(REASONING_TEMPLATES.spot.buy), vars);
        break;
    }
    outcome = 'pending';
  } else if (type === 'monitoring') {
    // Hold decision (checking on position)
    action = 'hold';
    reasoning = fillTemplate(randomItem(REASONING_TEMPLATES[domain].hold), vars);
    outcome = 'pending';
  } else {
    // Exit decision
    switch (domain) {
      case 'dlmm':
        action = 'remove_liquidity';
        reasoning = fillTemplate(randomItem(REASONING_TEMPLATES.dlmm.remove_liquidity), vars);
        break;
      case 'perps':
        action = 'close_position';
        reasoning = fillTemplate(randomItem(REASONING_TEMPLATES.perps.close_position), vars);
        break;
      case 'polymarket':
        action = 'sell';
        reasoning = fillTemplate(randomItem(REASONING_TEMPLATES.polymarket.sell), vars);
        break;
      case 'spot':
        action = Math.random() > 0.3 ? 'sell' : 'partial_sell';
        reasoning = fillTemplate(randomItem(REASONING_TEMPLATES.spot[action as 'sell' | 'partial_sell']), vars);
        break;
    }

    // Set outcome based on realized P&L
    if (position.realizedPnl !== null) {
      outcome = position.realizedPnl >= 0 ? 'profit' : 'loss';
      realizedPnl = position.realizedPnl;
      pnlPercent = round2((position.realizedPnl / position.entryValueUsd) * 100);
    }
  }

  // Select 0-2 skills that might have been applied
  const numSkills = randomInt(0, 2);
  const skillsApplied = [];
  const availableSkills = [...SKILLS_BY_DOMAIN[domain]];
  for (let i = 0; i < numSkills && availableSkills.length > 0; i++) {
    const idx = randomInt(0, availableSkills.length - 1);
    skillsApplied.push(availableSkills.splice(idx, 1)[0]);
  }

  return {
    id: generateUUID(),
    domain,
    action,
    target: position.target,
    amountUsd: type === 'entry' ? position.entryValueUsd : (type === 'exit' ? position.currentValueUsd : null),
    reasoning,
    confidence: generateConfidence(),
    outcome,
    realizedPnl,
    pnlPercent,
    skillsApplied,
    marketConditions: {
      fearGreed,
      btcPrice: Math.round(btcPrice),
      sentiment,
    },
    decisionTimestamp: timestamp,
    positionId: position.id,
  };
}

export function generateDecisions(positions: GeneratedPosition[]): GeneratedDecision[] {
  const decisions: GeneratedDecision[] = [];

  for (const position of positions) {
    // Entry decision
    decisions.push(generateDecisionForPosition(position, 'entry', position.openedAt));

    // Monitoring decision(s) - if position lasted > 24h
    if (position.closedAt) {
      const durationHours = (position.closedAt.getTime() - position.openedAt.getTime()) / (1000 * 60 * 60);
      if (durationHours > 24) {
        // Add 1-2 monitoring decisions
        const numMonitoring = durationHours > 72 ? 2 : 1;
        for (let i = 0; i < numMonitoring; i++) {
          const monitorTime = addHours(position.openedAt, (durationHours * (i + 1)) / (numMonitoring + 1));
          decisions.push(generateDecisionForPosition(position, 'monitoring', monitorTime));
        }
      }

      // Exit decision
      decisions.push(generateDecisionForPosition(position, 'exit', position.closedAt));
    } else {
      // Open position - might have monitoring decision
      const hoursSinceOpen = (CONFIG.endDate.getTime() - position.openedAt.getTime()) / (1000 * 60 * 60);
      if (hoursSinceOpen > 24) {
        const monitorTime = addHours(position.openedAt, hoursSinceOpen / 2);
        decisions.push(generateDecisionForPosition(position, 'monitoring', monitorTime));
      }
    }
  }

  // Add some standalone hold decisions (no position action)
  const numStandaloneHolds = randomInt(15, 25);
  for (let i = 0; i < numStandaloneHolds; i++) {
    const domain = randomItem([...CONFIG.domains]);
    const { fearGreed, btcPrice, sentiment } = generateMarketConditions();

    const vars: Record<string, string | number> = {
      fear: fearGreed,
      btcPrice: Math.round(btcPrice),
      sentiment,
      posCount: randomInt(1, 3),
      poolCount: randomInt(2, 3),
      symbol: randomItem(['BTC', 'ETH', 'SOL', 'HYPE']),
      rsi: randomInt(40, 60),
      watchlist: 'DINO, FARTCOIN, SPARK',
    };

    const timestamp = new Date(
      CONFIG.startDate.getTime() +
        Math.random() * (CONFIG.endDate.getTime() - CONFIG.startDate.getTime())
    );

    decisions.push({
      id: generateUUID(),
      domain,
      action: 'hold',
      target: null,
      amountUsd: null,
      reasoning: fillTemplate(randomItem(REASONING_TEMPLATES[domain].hold), vars),
      confidence: generateConfidence(),
      outcome: null,
      realizedPnl: null,
      pnlPercent: null,
      skillsApplied: [],
      marketConditions: { fearGreed, btcPrice: Math.round(btcPrice), sentiment },
      decisionTimestamp: timestamp,
    });
  }

  // Sort by timestamp
  decisions.sort((a, b) => a.decisionTimestamp.getTime() - b.decisionTimestamp.getTime());

  return decisions;
}
