/**
 * Subagent Executor
 *
 * Runs domain-specific subagents using Claude Agent SDK.
 * Supports parallel execution, session persistence, transcripts, and context pruning.
 */

import Anthropic from '@anthropic-ai/sdk';
import type { Domain, AgentDecision, DomainContext } from '../types/index.js';
import { getSubagent } from './index.js';
import { sessionStore } from './session-store.js';
import { hookRegistry } from '../hooks/index.js';
import { SELF_AWARENESS_CONTEXT } from '../skills/reflection-creator.js';
import { synthesizeInsights, evaluateDecision } from '../learning/judge-feedback.js';
import {
  formatDirectiveForPrompt,
  type PortfolioDirective,
} from './portfolio-coordinator.js';
import { formatMemoryForPrompt } from '../memory/index.js';
import { TranscriptStore } from '../transcripts/store.js';
import type { TranscriptEntry } from '../transcripts/types.js';
import { createContextManager } from '../context/manager.js';
// New skill recommendation system (Phase 1)
import { recommendSkills, formatRecommendedSkills } from '../skills/skill-recommender.js';
import { trackSkillUsage } from '../skills/skill-tracker.js';
import type { QualifiedSkill, SkillMarketContext } from '../skills/types.js';

// Import MCP server executors
import { createDlmmTools, executeDlmmTool, type DlmmRuntime } from './mcp-servers/dlmm-server.js';
import { createPerpsTools, executePerpsTools, type PerpsRuntime } from './mcp-servers/perps-server.js';
import { createPolymarketTools, executePolymarketTool, type PolymarketRuntime } from './mcp-servers/polymarket-server.js';
import { createSpotTools, executeSpotTool, type SpotRuntime } from './mcp-servers/spot-server.js';

// Runtime types for each domain
type DomainRuntime = DlmmRuntime | PerpsRuntime | PolymarketRuntime | SpotRuntime;

// =============================================================================
// MODEL SELECTION & THINKING LEVELS
// =============================================================================

/**
 * Thinking level configuration
 */
export type ThinkingLevel = 'off' | 'minimal' | 'low' | 'medium' | 'high';

/**
 * Model configuration for different task types
 */
export interface ModelConfig {
  model: string;
  thinkingLevel: ThinkingLevel;
  thinkingBudget: number;  // Max tokens for thinking
  maxTokens: number;
}

/**
 * Decision context for model selection
 */
export interface DecisionContext {
  domain: Domain;
  amountUsd: number;
  positionCount: number;
  hasOpenPositions: boolean;
  recentLosses: number;      // Count of losses in last 10 decisions
  marketVolatility: 'low' | 'normal' | 'high';
  taskType: 'monitor' | 'analyze' | 'execute' | 'strategy';
}

/**
 * Thinking budget by level
 */
const THINKING_BUDGETS: Record<ThinkingLevel, number> = {
  off: 0,
  minimal: 1024,
  low: 4096,
  medium: 10000,
  high: 20000,
};

// Agent SDK compatible models
const VALID_MODELS = [
  'claude-opus-4-5-20251101',
  'claude-sonnet-4-20250514',
  'claude-3-5-sonnet-20241022',
];

const DEFAULT_MODEL = 'claude-opus-4-5-20251101';

// Singleton instances for transcript and context management
const transcriptStore = new TranscriptStore();
const contextManager = createContextManager();

/**
 * Get configured model from env or default
 */
function getConfiguredModel(): string {
  const model = process.env.CLAUDE_MODEL || DEFAULT_MODEL;
  if (!VALID_MODELS.includes(model)) {
    console.warn(`[Model] Invalid model "${model}", using default: ${DEFAULT_MODEL}`);
    console.warn(`[Model] Valid models: ${VALID_MODELS.join(', ')}`);
    return DEFAULT_MODEL;
  }
  return model;
}

/**
 * Select appropriate model and thinking level based on decision context
 */
export function selectModel(context: DecisionContext): ModelConfig {
  const model = getConfiguredModel();
  return {
    model,
    thinkingLevel: 'high',
    thinkingBudget: THINKING_BUDGETS['high'],
    maxTokens: 8000,
  };
}

/**
 * Infer decision context from domain context
 */
export function inferDecisionContext(
  domain: Domain,
  context: DomainContext,
  taskType: DecisionContext['taskType'] = 'analyze'
): DecisionContext {
  // Count recent losses
  const recentLosses = context.recentDecisions.filter(d =>
    d.outcome === 'loss' || (d.realizedPnl !== undefined && d.realizedPnl !== null && d.realizedPnl < 0)
  ).length;

  // Estimate market volatility (simplified)
  // In production, would analyze price data
  const marketVolatility: DecisionContext['marketVolatility'] = 'normal';

  // Estimate potential amount based on balance
  const estimatedAmount = context.balance * 0.1; // 10% position size estimate

  return {
    domain,
    amountUsd: estimatedAmount,
    positionCount: context.positions.length,
    hasOpenPositions: context.positions.length > 0,
    recentLosses,
    marketVolatility,
    taskType,
  };
}

/**
 * Build skill market context from domain context
 */
function buildSkillMarketContext(
  domain: Domain,
  context: DomainContext
): SkillMarketContext {
  // Count recent losses
  const recentLossCount = context.recentDecisions.filter(d =>
    d.outcome === 'loss' || (d.realizedPnl !== undefined && d.realizedPnl !== null && d.realizedPnl < 0)
  ).length;

  // Calculate recent win rate
  const completedDecisions = context.recentDecisions.filter(d =>
    d.outcome === 'profitable' || d.outcome === 'loss'
  );
  const recentWinRate = completedDecisions.length > 0
    ? completedDecisions.filter(d => d.outcome === 'profitable').length / completedDecisions.length
    : undefined;

  return {
    domain,
    hasOpenPositions: context.positions.length > 0,
    positionCount: context.positions.length,
    recentLossCount,
    recentWinRate,
    // Market data varies by domain - can be extended
    marketData: {},
  };
}

/**
 * Create a domain-specific runtime
 */
function createRuntime(domain: Domain): DomainRuntime {
  return { decision: null };
}

/**
 * Generic MCP Tool interface for type compatibility
 */
interface GenericMcpTool {
  name: string;
  description: string;
  inputSchema: unknown;
  handler: (args: unknown, runtime: unknown) => Promise<{ content: Array<{ type: 'text'; text: string }> }>;
}

/**
 * Get tool definitions for a domain
 */
function getToolDefinitions(domain: Domain): Anthropic.Tool[] {
  const runtime = createRuntime(domain);

  let tools: GenericMcpTool[];

  switch (domain) {
    case 'dlmm':
      tools = createDlmmTools(runtime as DlmmRuntime) as GenericMcpTool[];
      break;
    case 'perps':
      tools = createPerpsTools(runtime as PerpsRuntime) as GenericMcpTool[];
      break;
    case 'polymarket':
      tools = createPolymarketTools(runtime as PolymarketRuntime) as GenericMcpTool[];
      break;
    case 'spot':
      tools = createSpotTools(runtime as SpotRuntime) as GenericMcpTool[];
      break;
    default:
      return [];
  }

  // Convert to Anthropic Tool format
  return tools.map(tool => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: 'object' as const,
      properties: {},
    },
  }));
}

/**
 * Execute a tool call for a domain
 */
async function executeToolCall(
  domain: Domain,
  toolName: string,
  toolInput: unknown,
  runtime: DomainRuntime
): Promise<string> {
  // Run PreToolUse hooks
  const preResult = await hookRegistry.run('PreToolUse', {
    domain,
    toolName,
    toolInput,
    timestamp: new Date(),
  });

  if (!preResult.proceed) {
    return JSON.stringify({ error: `Blocked by hook: ${preResult.reason}` });
  }

  let result: { content: Array<{ type: 'text'; text: string }> };

  switch (domain) {
    case 'dlmm':
      result = await executeDlmmTool(toolName, toolInput, runtime as DlmmRuntime);
      break;
    case 'perps':
      result = await executePerpsTools(toolName, toolInput, runtime as PerpsRuntime);
      break;
    case 'polymarket':
      result = await executePolymarketTool(toolName, toolInput, runtime as PolymarketRuntime);
      break;
    case 'spot':
      result = await executeSpotTool(toolName, toolInput, runtime as SpotRuntime);
      break;
    default:
      result = { content: [{ type: 'text', text: JSON.stringify({ error: `Unknown domain: ${domain}` }) }] };
  }

  const output = result.content[0]?.text || '';

  // Run PostToolUse hooks
  await hookRegistry.run('PostToolUse', {
    domain,
    toolName,
    toolInput,
    toolOutput: output,
    timestamp: new Date(),
  });

  return output;
}

/**
 * Build user prompt with context, judge feedback, and portfolio directive
 */
async function buildUserPrompt(
  domain: Domain,
  context: DomainContext,
  portfolioDirective?: PortfolioDirective
): Promise<string> {
  // Fetch synthesized judge feedback
  let judgeFeedback = '';
  try {
    const feedback = await synthesizeInsights(domain);
    if (feedback.recentInsightsCount > 0) {
      judgeFeedback = `\n---\n\n${feedback.fullText}\n`;
    }
  } catch (error) {
    console.warn(`[${domain}] Could not fetch judge feedback:`, error);
  }

  // Format portfolio directive if available
  let directiveSection = '';
  if (portfolioDirective) {
    directiveSection = `\n---\n\n${formatDirectiveForPrompt(portfolioDirective, domain)}\n`;
  }

  // Fetch agent memory
  let memorySection = '';
  try {
    memorySection = await formatMemoryForPrompt(domain);
    if (memorySection) {
      memorySection = `\n---\n\n${memorySection}\n`;
    }
  } catch (error) {
    console.warn(`[${domain}] Could not fetch memory:`, error);
  }

  return `
# Current State
${directiveSection}
## Balance
$${context.balance.toFixed(2)} available for ${domain.toUpperCase()}

## Open Positions (${context.positions.length})
${context.positions.length === 0
    ? 'No open positions'
    : JSON.stringify(context.positions.slice(0, 5), null, 2)}

## Recent Decisions
${context.recentDecisions.length === 0
    ? 'No recent decisions'
    : context.recentDecisions.slice(0, 3).map(d =>
      `- ${d.action} ${d.target || ''}: ${d.reasoning.slice(0, 50)}... (conf: ${d.confidence})`
    ).join('\n')}
${judgeFeedback}${memorySection}
## Market Data Available
Use the fetch tools to get LIVE market data.

---

Analyze the market and your portfolio. Make a decision.

1. Use fetch tools to get current market data
2. Analyze opportunities and risks
3. Use submit_decision to record your action

You MUST call submit_decision with your final decision.
`;
}

/**
 * Execute a single subagent
 */
export async function executeSubagent(
  anthropic: Anthropic,
  domain: Domain,
  context: DomainContext,
  portfolioDirective?: PortfolioDirective
): Promise<AgentDecision | null> {
  const subagent = getSubagent(domain);
  const runtime = createRuntime(domain);

  // Initialize session store
  await sessionStore.init();

  // Run SessionStart hooks
  await hookRegistry.run('SessionStart', {
    domain,
    timestamp: new Date(),
  });

  // Select model based on decision context
  const decisionCtx = inferDecisionContext(domain, context);
  const modelConfig = selectModel(decisionCtx);
  console.log(`  📊 Model: ${modelConfig.model}, Thinking: ${modelConfig.thinkingLevel}`);

  // Get recommended skills using new explicit tracking system
  const skillMarketContext = buildSkillMarketContext(domain, context);
  const skillRecommendation = await recommendSkills(domain, skillMarketContext);
  const skillsContext = formatRecommendedSkills(skillRecommendation.recommendedSkills);

  console.log(
    `  🎯 Skills: ${skillRecommendation.recommendedSkills.length} recommended ` +
    `(${skillRecommendation.excludedLowEffectiveness} low-eff, ${skillRecommendation.excludedLowRelevance} low-rel excluded)`
  );

  const isPaperTrading = process.env.PAPER_TRADING !== 'false';

  const tradingModeGuidance = isPaperTrading ? `
PAPER TRADING MODE - BE AGGRESSIVE:
- This is paper trading with simulated money - take more risks!
- Prefer ACTION over holding when opportunities exist
- Test strategies, explore the market, generate trading activity
- Don't be overly conservative - we're learning, not protecting real capital
- If confidence > 50%, consider taking the trade
- Holding is boring - find opportunities!
` : `
REAL TRADING MODE - BE PRUDENT:
- This is real money - be careful and conservative
- Only trade with high confidence (>70%)
- Prefer holding over risky trades
`;

  const systemPrompt = `${subagent.systemPrompt}

---

${tradingModeGuidance}

---

${SELF_AWARENESS_CONTEXT}

${skillsContext}

---

IMPORTANT: You must call submit_decision at the end with your final decision.
Even if you decide to HOLD, call submit_decision with action: "hold".`;

  // Build user prompt with context, judge feedback, and portfolio directive
  const userPrompt = await buildUserPrompt(domain, context, portfolioDirective);

  // Get tool definitions
  const toolDefs = getToolDefinitions(domain);

  // Generate session ID for transcript logging
  const sessionId = TranscriptStore.generateSessionId();

  // Log initial user message to transcript
  await transcriptStore.append(domain, sessionId, {
    timestamp: new Date().toISOString(),
    role: 'user',
    content: userPrompt,
    metadata: { domain },
  });

  // Multi-turn conversation loop
  let messages: Anthropic.MessageParam[] = [
    { role: 'user', content: userPrompt }
  ];

  const maxTurns = 5;
  let turn = 0;

  while (turn < maxTurns) {
    turn++;

    // Apply context pruning if needed
    if (contextManager.shouldPrune(messages)) {
      const pruneResult = contextManager.prune(messages);
      messages = pruneResult.pruned;
      console.log(
        `  [${domain}] Context pruned: ${pruneResult.droppedCount} msgs dropped, ` +
        `${pruneResult.estimatedTokensBefore} -> ${pruneResult.estimatedTokensAfter} tokens`
      );
    }

    try {
      const response = await anthropic.messages.create({
        model: modelConfig.model,
        max_tokens: modelConfig.maxTokens,
        system: systemPrompt,
        messages,
        tools: toolDefs,
      });

      // Log assistant response to transcript
      await transcriptStore.append(domain, sessionId, {
        timestamp: new Date().toISOString(),
        role: 'assistant',
        content: response.content,
        metadata: {
          domain,
          model: modelConfig.model,
          tokensUsed: response.usage?.output_tokens,
        },
      });

      // Check if we need to handle tool calls
      if (response.stop_reason === 'tool_use') {
        // Find tool use blocks
        const toolUseBlocks = response.content.filter(
          (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
        );

        // Add assistant response to messages
        messages.push({ role: 'assistant', content: response.content });

        // Execute tools and collect results
        const toolResults: Anthropic.ToolResultBlockParam[] = [];

        for (const toolUse of toolUseBlocks) {
          const result = await executeToolCall(
            domain,
            toolUse.name,
            toolUse.input,
            runtime
          );

          toolResults.push({
            type: 'tool_result',
            tool_use_id: toolUse.id,
            content: result,
          });

          // Log tool use and result to transcript
          await transcriptStore.append(domain, sessionId, {
            timestamp: new Date().toISOString(),
            role: 'tool_use',
            content: { name: toolUse.name, input: toolUse.input },
            metadata: { domain, toolName: toolUse.name },
          });
          await transcriptStore.append(domain, sessionId, {
            timestamp: new Date().toISOString(),
            role: 'tool_result',
            content: result,
            metadata: { domain, toolName: toolUse.name },
          });
        }

        // Add tool results to messages
        messages.push({ role: 'user', content: toolResults });

        // Continue conversation
        continue;
      }

      // End of conversation - check for decision
      if (response.stop_reason === 'end_turn') {
        break;
      }

      // Unexpected stop reason
      console.warn(`[${domain}] Unexpected stop reason: ${response.stop_reason}`);
      break;

    } catch (error) {
      console.error(`[${domain}] API error:`, error);
      await hookRegistry.run('OnError', {
        domain,
        error: error instanceof Error ? error : new Error(String(error)),
        timestamp: new Date(),
      });
      break;
    }
  }

  // Run SessionEnd hooks
  await hookRegistry.run('SessionEnd', {
    domain,
    decision: runtime.decision ?? undefined,
    timestamp: new Date(),
  });

  // Track skill applications and evaluate decision
  if (runtime.decision) {
    // Generate a decision ID for tracking (will be replaced with DB ID when decision is logged)
    const decisionId = `${domain}-${Date.now()}`;

    // Track which recommended skills were applied using new explicit tracking
    if (skillRecommendation.recommendedSkills.length > 0) {
      try {
        const trackingResult = await trackSkillUsage(
          decisionId,
          skillRecommendation.recommendedSkills,
          runtime.decision.reasoning
        );

        // Store decision ID in metadata for outcome linking
        runtime.decision.metadata = {
          ...runtime.decision.metadata,
          decisionId,
          skillsPresented: skillRecommendation.recommendedSkills.map(s => s.name),
          skillTrackingResult: {
            recommendationsCreated: trackingResult.recommendationsCreated,
            appliedCount: trackingResult.detections.filter(d => d.wasApplied).length,
          },
        };
      } catch (error) {
        console.warn(`[${domain}] Skill tracking failed:`, error);
      }
    }

    // Evaluate the decision using judge (async, don't block)
    if (runtime.decision.action !== 'hold') {
      // Fire and forget - evaluation happens asynchronously
      evaluateDecision(
        decisionId,
        domain,
        runtime.decision.action,
        runtime.decision.target,
        runtime.decision.reasoning,
        runtime.decision.confidence,
        runtime.decision.metadata || {}
      ).catch(err => console.warn(`[${domain}] Judge evaluation failed:`, err));
    }
  }

  return runtime.decision;
}

/**
 * Execute all subagents in parallel
 */
export async function executeAllSubagentsParallel(
  anthropic: Anthropic,
  domains: Domain[],
  contexts: Map<Domain, DomainContext>,
  portfolioDirective?: PortfolioDirective
): Promise<Map<Domain, AgentDecision | null>> {
  console.log(`\n🚀 Executing ${domains.length} subagents in parallel...`);

  const results = await Promise.all(
    domains.map(async (domain) => {
      const context = contexts.get(domain);
      if (!context) {
        console.warn(`[${domain}] No context provided, skipping`);
        return { domain, decision: null };
      }

      try {
        console.log(`  [${domain}] Starting...`);
        const decision = await executeSubagent(anthropic, domain, context, portfolioDirective);
        console.log(`  [${domain}] ${decision?.action || 'no decision'}`);
        return { domain, decision };
      } catch (error) {
        console.error(`  [${domain}] Error:`, error);
        return { domain, decision: null };
      }
    })
  );

  return new Map(results.map(r => [r.domain, r.decision]));
}

/**
 * Execute a single domain (for testing)
 */
export async function executeSingleSubagent(
  domain: Domain,
  context: DomainContext
): Promise<AgentDecision | null> {
  const anthropic = new Anthropic();
  return executeSubagent(anthropic, domain, context);
}
