/**
 * Context Server
 *
 * Read-only MCP tools that give Ralph full context of portfolio state,
 * trade history, memory, skills, and market data.
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { Domain } from '../types/index.js';
import {
  getPortfolio,
  getAllBalances,
  getOpenPositions,
  getRecentDecisions,
  getAllDecisions,
  getPerformanceSnapshots,
  getSkillReflections,
  getRecentTrades,
} from '../db/index.js';
import {
  recall,
  getMemorySummary,
} from '../memory/index.js';
import {
  getRecentJudgeInsights,
  synthesizeInsights,
} from '../learning/judge-feedback.js';

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const contextTools: Tool[] = [
  {
    name: 'get_portfolio_summary',
    description: 'Get current portfolio value, allocation breakdown by domain, and overall P&L. Shows balances and position values across DLMM, Perps, Polymarket, and Spot.',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_positions',
    description: 'Get all active/open positions. Optionally filter by domain. Shows entry value, current value, P&L, and when opened.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['dlmm', 'perps', 'polymarket', 'spot'],
          description: 'Filter positions by domain (optional)',
        },
      },
    },
  },
  {
    name: 'get_trade_history',
    description: 'Get recent trade executions with details. Shows what was traded, when, size, price, and value.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['dlmm', 'perps', 'polymarket', 'spot'],
          description: 'Filter trades by domain (optional)',
        },
        limit: {
          type: 'number',
          default: 20,
          description: 'Number of trades to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'search_decisions',
    description: 'Search past agent decisions. Use this to understand why trades were made, what reasoning was used, and what the outcomes were.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['dlmm', 'perps', 'polymarket', 'spot'],
          description: 'Filter decisions by domain (optional)',
        },
        outcome: {
          type: 'string',
          enum: ['profit', 'loss', 'pending'],
          description: 'Filter by outcome (optional)',
        },
        limit: {
          type: 'number',
          default: 20,
          description: 'Number of decisions to return (default: 20)',
        },
      },
    },
  },
  {
    name: 'get_memory',
    description: 'Get learned facts, patterns, and warnings from the memory system. These are lessons learned from past trades.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['dlmm', 'perps', 'polymarket', 'spot', 'general'],
          description: 'Filter by domain or get general cross-domain memory (optional)',
        },
      },
    },
  },
  {
    name: 'list_skills',
    description: 'List learned skills with their effectiveness scores. Skills are patterns/strategies automatically generated from trade outcomes.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['dlmm', 'perps', 'polymarket', 'spot'],
          description: 'Filter skills by domain (optional)',
        },
        minEffectiveness: {
          type: 'number',
          description: 'Minimum effectiveness score (0-1) to include (optional)',
        },
      },
    },
  },
  {
    name: 'get_judge_feedback',
    description: 'Get recent judge evaluations of past decisions. The judge rates decision quality and provides insights on what worked/failed.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['dlmm', 'perps', 'polymarket', 'spot'],
          description: 'Filter by domain (optional)',
        },
        limit: {
          type: 'number',
          default: 10,
          description: 'Number of evaluations to return (default: 10)',
        },
      },
    },
  },
  {
    name: 'get_performance',
    description: 'Get performance snapshots over time for a domain. Shows how portfolio value has changed.',
    inputSchema: {
      type: 'object',
      properties: {
        domain: {
          type: 'string',
          enum: ['dlmm', 'perps', 'polymarket', 'spot'],
          description: 'Domain to get performance for',
        },
        limit: {
          type: 'number',
          default: 20,
          description: 'Number of snapshots to return (default: 20)',
        },
      },
      required: ['domain'],
    },
  },
];

// =============================================================================
// TOOL HANDLERS
// =============================================================================

export async function handleContextTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'get_portfolio_summary': {
      const portfolio = await getPortfolio();
      const INITIAL_BALANCE = 2500;
      const TOTAL_INITIAL = INITIAL_BALANCE * 4;

      return {
        totalValueUsd: `$${portfolio.totalValueUsd.toFixed(2)}`,
        totalPnl: `$${(portfolio.totalValueUsd - TOTAL_INITIAL).toFixed(2)}`,
        totalPnlPercent: `${(((portfolio.totalValueUsd - TOTAL_INITIAL) / TOTAL_INITIAL) * 100).toFixed(1)}%`,
        openPositionsCount: portfolio.positions.length,
        lastUpdated: portfolio.lastUpdated,
        domains: Object.entries(portfolio.domains).map(([domain, data]) => ({
          domain,
          balance: `$${data.balance.toFixed(2)}`,
          positionsValue: `$${data.positionsValue.toFixed(2)}`,
          totalValue: `$${data.totalValue.toFixed(2)}`,
          numPositions: data.numPositions,
          allocation: `${((data.totalValue / portfolio.totalValueUsd) * 100).toFixed(1)}%`,
          pnl: `$${(data.totalValue - INITIAL_BALANCE).toFixed(2)}`,
        })),
      };
    }

    case 'get_positions': {
      const domain = args.domain as Domain | undefined;

      if (domain) {
        const positions = await getOpenPositions(domain);
        return {
          domain,
          count: positions.length,
          positions: positions.map(p => ({
            id: p.id,
            target: p.target,
            entryValueUsd: `$${p.entryValueUsd.toFixed(2)}`,
            currentValueUsd: `$${p.currentValueUsd.toFixed(2)}`,
            pnl: `$${(p.currentValueUsd - p.entryValueUsd).toFixed(2)}`,
            pnlPercent: `${(((p.currentValueUsd - p.entryValueUsd) / p.entryValueUsd) * 100).toFixed(1)}%`,
            openedAt: p.openedAt,
            metadata: p.metadata,
          })),
        };
      }

      // Get positions for all domains
      const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
      const allPositions = await Promise.all(
        domains.map(async d => ({
          domain: d,
          positions: await getOpenPositions(d),
        }))
      );

      return {
        totalCount: allPositions.reduce((sum, d) => sum + d.positions.length, 0),
        byDomain: Object.fromEntries(
          allPositions.map(d => [
            d.domain,
            {
              count: d.positions.length,
              positions: d.positions.map(p => ({
                id: p.id,
                target: p.target,
                currentValueUsd: `$${p.currentValueUsd.toFixed(2)}`,
                pnl: `$${(p.currentValueUsd - p.entryValueUsd).toFixed(2)}`,
                pnlPercent: `${(((p.currentValueUsd - p.entryValueUsd) / p.entryValueUsd) * 100).toFixed(1)}%`,
              })),
            },
          ])
        ),
      };
    }

    case 'get_trade_history': {
      const domain = args.domain as Domain | undefined;
      const limit = (args.limit as number) || 20;

      const trades = await getRecentTrades(domain, limit);

      return {
        count: trades.length,
        trades: trades.map(t => ({
          id: t.id,
          domain: t.domain,
          action: t.action,
          target: t.target,
          targetName: t.targetName,
          side: t.side,
          size: t.size,
          priceUsd: `$${t.priceUsd.toFixed(4)}`,
          valueUsd: `$${t.valueUsd.toFixed(2)}`,
          executedAt: t.executedAt,
        })),
      };
    }

    case 'search_decisions': {
      const domain = args.domain as Domain | undefined;
      const outcome = args.outcome as 'profit' | 'loss' | 'pending' | undefined;
      const limit = (args.limit as number) || 20;

      const decisions = await getAllDecisions({ domain, outcome, limit });

      return {
        count: decisions.length,
        decisions: decisions.map(d => ({
          action: d.action,
          target: d.target,
          amountUsd: d.amountUsd ? `$${d.amountUsd.toFixed(2)}` : undefined,
          confidence: `${(d.confidence * 100).toFixed(0)}%`,
          reasoning: d.reasoning,
          outcome: d.outcome,
          realizedPnl: d.realizedPnl ? `$${d.realizedPnl.toFixed(2)}` : undefined,
          timestamp: d.timestamp,
        })),
      };
    }

    case 'get_memory': {
      const domain = args.domain as Domain | 'general' | undefined;

      if (domain) {
        const facts = await recall(domain);
        return {
          domain,
          factCount: facts.length,
          facts,
        };
      }

      // Get memory summary for all domains
      const summary = await getMemorySummary();
      const allFacts: Record<string, string[]> = {};

      for (const s of summary) {
        const facts = await recall(s.domain as Domain | 'general');
        allFacts[s.domain] = facts;
      }

      return {
        summary: summary.map(s => ({
          domain: s.domain,
          factCount: s.factCount,
          recentLogsCount: s.recentLogsCount,
        })),
        facts: allFacts,
      };
    }

    case 'list_skills': {
      const domain = args.domain as Domain | undefined;
      const minEffectiveness = args.minEffectiveness as number | undefined;

      const skills = await getSkillReflections({ domain, minEffectiveness });

      return {
        count: skills.length,
        skills: skills.map(s => ({
          name: s.skillName,
          domain: s.domain,
          type: s.sourceType,
          effectiveness: s.effectivenessScore !== null
            ? `${(s.effectivenessScore * 100).toFixed(0)}%`
            : 'Not yet evaluated',
          timesApplied: s.timesApplied,
          successRate: s.successRate !== null
            ? `${(s.successRate * 100).toFixed(0)}%`
            : 'N/A',
          createdAt: s.createdAt,
        })),
      };
    }

    case 'get_judge_feedback': {
      const domain = args.domain as Domain | undefined;
      const limit = (args.limit as number) || 10;

      if (!domain) {
        // Get synthesized insights for all domains
        const domains: Domain[] = ['dlmm', 'perps', 'polymarket', 'spot'];
        const synthesized = await Promise.all(
          domains.map(async d => ({
            domain: d,
            feedback: await synthesizeInsights(d, limit),
          }))
        );

        return {
          byDomain: Object.fromEntries(
            synthesized.map(s => [
              s.domain,
              {
                insightsCount: s.feedback.recentInsightsCount,
                keyThemes: s.feedback.keyThemes,
                warningsToHeed: s.feedback.warningsToHeed,
                patternsToFollow: s.feedback.patternsToFollow,
                calibrationNotes: s.feedback.calibrationNotes,
              },
            ])
          ),
        };
      }

      const insights = await getRecentJudgeInsights(domain, limit);
      const synthesized = await synthesizeInsights(domain, limit);

      return {
        domain,
        insightsCount: insights.length,
        synthesis: {
          keyThemes: synthesized.keyThemes,
          warningsToHeed: synthesized.warningsToHeed,
          patternsToFollow: synthesized.patternsToFollow,
          calibrationNotes: synthesized.calibrationNotes,
        },
        recentEvaluations: insights.slice(0, 5).map(i => ({
          action: i.action,
          target: i.target,
          wasGoodDecision: i.wasGoodDecision,
          qualityScore: i.qualityScore,
          keyInsight: i.keyInsight,
          insightType: i.insightType,
          actualOutcome: i.actualOutcome,
          judgeWasRight: i.judgeWasRight,
        })),
      };
    }

    case 'get_performance': {
      const domain = args.domain as Domain;
      const limit = (args.limit as number) || 20;

      const snapshots = await getPerformanceSnapshots(domain, limit);

      if (snapshots.length === 0) {
        return { domain, message: 'No performance data available yet' };
      }

      const latest = snapshots[0];
      const oldest = snapshots[snapshots.length - 1];
      const changeUsd = latest.totalValueUsd - oldest.totalValueUsd;
      const changePercent = oldest.totalValueUsd > 0
        ? ((changeUsd / oldest.totalValueUsd) * 100)
        : 0;

      return {
        domain,
        currentValue: `$${latest.totalValueUsd.toFixed(2)}`,
        numPositions: latest.numPositions,
        periodStart: oldest.timestamp,
        periodEnd: latest.timestamp,
        changeUsd: `$${changeUsd.toFixed(2)}`,
        changePercent: `${changePercent.toFixed(1)}%`,
        trend: changeUsd > 0 ? 'up' : changeUsd < 0 ? 'down' : 'flat',
        snapshots: snapshots.slice(0, 10).map(s => ({
          timestamp: s.timestamp,
          totalValueUsd: `$${s.totalValueUsd.toFixed(2)}`,
          numPositions: s.numPositions,
        })),
      };
    }

    default:
      throw new Error(`Unknown context tool: ${name}`);
  }
}
