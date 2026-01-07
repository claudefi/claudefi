# Claudefi Architecture

## Overview

Claudefi is an autonomous DeFi trading agent that uses the Claude Agent SDK for multi-turn tool conversations. It operates across four domains: DLMM liquidity provision, perpetual futures, spot memecoins, and prediction markets.

The core innovation is a **self-improving learning system** that converts trading outcomes into actionable skills, enabling the agent to avoid past mistakes and replicate successes.

```
┌─────────────────────────────────────────────────────────────────┐
│                      THE RALPH LOOP                             │
│                                                                 │
│   ┌─────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐    │
│   │ OBSERVE │───→│  THINK  │───→│   ACT   │───→│  LEARN  │──┐ │
│   └─────────┘    └─────────┘    └─────────┘    └─────────┘  │ │
│        ↑              ↑                                      │ │
│        │         ┌────┴────┐                                 │ │
│        │         │ SKILLS  │←────────────────────────────────┘ │
│        │         └─────────┘                                   │
│        └───────────── 30 min cycle ────────────────────────────┘
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure

```
claudefi/
├── src/
│   ├── orchestrator/          # Ralph Loop (main execution cycle)
│   │   └── ralph-loop.ts
│   │
│   ├── subagents/             # Domain-specific Claude agents
│   │   ├── index.ts           # Subagent registry
│   │   ├── executor.ts        # Agent SDK execution engine
│   │   ├── session-store.ts   # Session persistence
│   │   ├── portfolio-coordinator.ts  # Cross-domain intelligence (NEW)
│   │   └── mcp-servers/       # MCP tool servers per domain
│   │       ├── dlmm-server.ts
│   │       ├── perps-server.ts
│   │       ├── polymarket-server.ts
│   │       └── spot-server.ts
│   │
│   ├── learning/              # Judge feedback system
│   │   ├── index.ts
│   │   └── judge-feedback.ts  # Decision evaluation & insights
│   │
│   ├── skills/                # Self-improvement system
│   │   ├── skill-creator.ts   # Generate skills from outcomes
│   │   ├── skill-merger.ts    # Deduplicate similar skills
│   │   ├── cross-domain-patterns.ts  # General skills (NEW)
│   │   └── built-in/          # Pre-loaded domain skills
│   │
│   ├── services/              # Background services (NEW)
│   │   └── position-monitor.ts  # Exit conditions & liquidation prevention
│   │
│   ├── hooks/                 # Event system
│   │   ├── index.ts           # Hook registry
│   │   └── built-in.ts        # Default hooks (+ drawdown limits)
│   │
│   ├── clients/               # Live API clients
│   │   ├── meteora/           # DLMM pools
│   │   ├── hyperliquid/       # Perps trading
│   │   ├── polymarket/        # Gamma API
│   │   ├── geckoterminal/     # Spot tokens
│   │   └── jupiter/           # Swaps
│   │
│   ├── db/                    # Database layer
│   │   ├── index.ts           # Database operations
│   │   └── schema.sql         # Raw SQL schema
│   │
│   ├── types/                 # TypeScript types
│   │   └── index.ts
│   │
│   └── cli/                   # CLI commands
│       └── commands/
│           ├── run.ts
│           └── init.ts
│
├── prisma/
│   └── schema.prisma          # Prisma ORM schema
│
├── .claude/
│   └── skills/                # Generated skills (runtime)
│       ├── archive/           # Expired skills
│       ├── general/           # Cross-domain skills (NEW)
│       ├── warning-*.md
│       ├── pattern-*.md
│       ├── strategy-*.md
│       └── evolved-*.md
│
└── docker/                    # Sandbox containers (future)
```

## Core Systems

### 1. Ralph Loop (`src/orchestrator/ralph-loop.ts`)

The main execution cycle that runs every 30 minutes:

```typescript
while (true) {
  // 0. SKILL MAINTENANCE - Archive expired skills
  await archiveExpiredSkills();

  // 1. BUILD CONTEXTS - Fetch live data for all domains
  const contexts = await buildContextsForAllDomains();

  // 2. EXECUTE PARALLEL - Run all subagents via Agent SDK
  const decisions = await executeAllSubagentsParallel(anthropic, domains, contexts);

  // 3. VALIDATE & ACT - Run hooks, execute approved decisions
  for (const decision of decisions) {
    const hookResult = await hookRegistry.run('PreDecision', { decision });
    if (hookResult.proceed) {
      await executeDecision(decision);
    }
  }

  // 4. LEARN - Take performance snapshots
  await takePerformanceSnapshots();

  // 5. REPEAT - Sleep until next cycle
  await sleep(30 * 60 * 1000);
}
```

### 2. Subagent Executor (`src/subagents/executor.ts`)

Runs domain-specific Claude agents using the Agent SDK with multi-turn tool conversations:

**Key Features:**
- Multi-turn tool conversations (up to 5 turns per decision)
- Judge feedback injection into prompts
- Skill application tracking
- Session persistence for agent memory

**Flow:**
```
1. Build system prompt with domain skills + judge feedback
2. Create MCP tool definitions for domain
3. Start multi-turn conversation loop:
   a. Call Claude API with tools
   b. If tool_use, execute tools and continue
   c. If end_turn, extract decision
4. Track which skills influenced the decision
5. Fire async judge evaluation
```

### 3. Learning System

The learning system creates a feedback loop that improves decision quality over time.

#### 3.1 Skill Creator (`src/skills/skill-creator.ts`)

Generates skills from trade outcomes:

| Trigger | Skill Type | TTL |
|---------|-----------|-----|
| Loss > 10% | Warning | 60 days |
| Win > 20% | Pattern | 90 days |
| Every 10 trades | Strategy | 180 days |
| Merge event | Evolved | 180 days |

#### 3.2 Judge Feedback (`src/learning/judge-feedback.ts`) - NEW

Evaluates decisions and generates actionable insights:

```typescript
interface DecisionEvaluation {
  decisionId: string;
  wasGoodDecision: boolean;
  qualityScore: number;      // 0-1
  keyInsight: string;        // Actionable lesson
  insightType: 'timing' | 'sizing' | 'selection' | 'risk' | 'market_read' | 'execution';
  strengths: string[];
  weaknesses: string[];
  betterApproach?: string;
}
```

**Feedback Loop:**
```
Decision → Execute → Judge Evaluates → DB → synthesizeInsights() →
                                           → buildUserPrompt() → Better Decision
```

The `synthesizeInsights()` function groups recent evaluations by insight type and generates a structured summary that's injected into every decision prompt.

#### 3.3 Skill Merger (`src/skills/skill-merger.ts`) - NEW

Prevents skill explosion by deduplicating similar skills:

```typescript
// Before creating new skill
const similar = await findSimilarSkills(newSkillContent, domain);
if (similar.length >= 2) {
  // Merge into evolved skill
  const merged = await mergeSkills(similar, domain, newSkillContent);
  await archiveSkills(similar.map(s => s.filename));
  // Save evolved skill instead
}
```

**Similarity Detection:**
- Uses Claude Haiku for fast semantic comparison
- SIMILARITY_THRESHOLD = 0.7 (70% similar triggers merge)
- MIN_SKILLS_TO_MERGE = 2

#### 3.4 Skill Expiration - NEW

Skills have a time-to-live to prevent stale guidance:

```typescript
const SKILL_TTL_DAYS = {
  warning: 60,   // Market conditions change
  pattern: 90,   // Patterns have medium shelf life
  strategy: 180, // Comprehensive strategies last longer
  evolved: 180,  // Merged wisdom is durable
};
```

Expired skills are archived (not deleted) to `.claude/skills/archive/`.

#### 3.5 Application Tracking - NEW

Tracks which skills influence decisions:

```typescript
// After decision is made
const appliedSkills = await extractAppliedSkills(reasoning, domain);
for (const skill of appliedSkills) {
  await recordSkillApplication(skill, domain, wasSuccessful);
}
```

Skills with effectiveness < 30% are excluded from future prompts to reduce context bloat.

### 4. Hook System (`src/hooks/`)

Event-driven middleware for validation and side effects:

| Hook | When | Purpose |
|------|------|---------|
| `SessionStart` | Before subagent runs | Logging, state init |
| `PreToolUse` | Before each tool call | Validation, rate limits |
| `PostToolUse` | After each tool call | Logging, monitoring |
| `PreDecision` | Before execution | Guard rails |
| `PostDecision` | After execution | Notifications |
| `SessionEnd` | After subagent completes | Cleanup |
| `OnError` | On any error | Error handling |

### 5. MCP Servers (`src/subagents/mcp-servers/`)

Each domain has an MCP server that provides tools:

**DLMM Server:**
- `fetch_pools` - Get top liquidity pools
- `fetch_position_details` - Get position info
- `submit_decision` - Record trading decision

**Perps Server:**
- `fetch_markets` - Get perpetual markets
- `fetch_position` - Get position details
- `submit_decision` - Record trading decision

**Polymarket Server:**
- `fetch_markets` - Get prediction markets
- `web_search` - Research via Perplexity
- `submit_decision` - Record trading decision

**Spot Server:**
- `fetch_trending_tokens` - Get trending memecoins
- `fetch_token_details` - Get token info
- `submit_decision` - Record trading decision

### 6. Database Schema

Using Prisma with SQLite:

```prisma
model Decision {
  id          String   @id @default(uuid())
  domain      String
  action      String
  target      String?
  amountUsd   Float?
  reasoning   String
  confidence  Float
  outcome     String?
  realizedPnl Float?
  createdAt   DateTime @default(now())
}

model Position {
  id              String   @id @default(uuid())
  domain          String
  target          String
  targetName      String?
  entryValueUsd   Float
  currentValueUsd Float?
  status          String   @default("open")
  openedAt        DateTime @default(now())
  closedAt        DateTime?
}

model SkillReflection {
  id                String   @id @default(uuid())
  skillName         String   @unique
  skillPath         String
  domain            String
  sourceType        String   // 'warning' | 'pattern' | 'strategy'
  timesApplied      Int      @default(0)
  successfulApplies Int      @default(0)
  effectivenessScore Float?
  triggerDecisionId String?
  triggerPnl        Float?
  triggerPnlPct     Float?
  metadata          Json?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}

model DecisionEvaluation {
  id                String   @id @default(uuid())
  decisionId        String
  domain            String
  action            String
  target            String?
  wasGoodDecision   Boolean
  qualityScore      Float?
  strengths         String?
  weaknesses        String?
  missedFactors     String?
  betterApproach    String?
  keyInsight        String
  insightType       String   // 'timing' | 'sizing' | etc.
  applicability     String   @default("domain")
  actualOutcome     String?
  actualPnlPercent  Float?
  judgeWasRight     Boolean?
  createdAt         DateTime @default(now())
}
```

## Data Flow

### Decision Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        DECISION FLOW                             │
│                                                                  │
│  Market Data                                                     │
│      │                                                           │
│      ▼                                                           │
│  ┌─────────────┐    ┌────────────────┐    ┌─────────────┐      │
│  │ Build       │───→│ Inject Judge   │───→│ Execute     │      │
│  │ Context     │    │ Feedback       │    │ Subagent    │      │
│  └─────────────┘    └────────────────┘    └─────────────┘      │
│        ↑                   ↑                    │               │
│        │                   │                    ▼               │
│  ┌─────────────┐    ┌────────────────┐    ┌─────────────┐      │
│  │ Skill       │←───│ Synthesize     │←───│ Decision    │      │
│  │ Reflections │    │ Insights       │    │ Made        │      │
│  └─────────────┘    └────────────────┘    └─────────────┘      │
│                                                  │               │
│                                                  ▼               │
│                                          ┌─────────────┐        │
│                                          │ Run Hooks   │        │
│                                          │ Validate    │        │
│                                          └─────────────┘        │
│                                                  │               │
│                                                  ▼               │
│                                          ┌─────────────┐        │
│                                          │ Execute     │        │
│                                          │ Trade       │        │
│                                          └─────────────┘        │
│                                                  │               │
│                                                  ▼               │
│                                          ┌─────────────┐        │
│                                          │ Judge       │        │
│                                          │ Evaluates   │        │
│                                          └─────────────┘        │
│                                                  │               │
│                                                  └───→ DB       │
└──────────────────────────────────────────────────────────────────┘
```

### Learning Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                        LEARNING FLOW                             │
│                                                                  │
│  Trade Closes with P&L                                           │
│      │                                                           │
│      ▼                                                           │
│  ┌─────────────┐                                                │
│  │ Significant │──No──→ (no skill created)                      │
│  │ Outcome?    │                                                │
│  └─────────────┘                                                │
│      │Yes                                                        │
│      ▼                                                           │
│  ┌─────────────┐    ┌────────────────┐    ┌─────────────┐      │
│  │ Generate    │───→│ Check Similar  │───→│ Merge?      │      │
│  │ Skill       │    │ Skills         │    └─────────────┘      │
│  └─────────────┘    └────────────────┘          │               │
│                                            Yes  │  No            │
│                                   ┌─────────────┴───────┐       │
│                                   ▼                     ▼       │
│                            ┌─────────────┐      ┌─────────────┐ │
│                            │ Create      │      │ Save New    │ │
│                            │ Evolved     │      │ Skill       │ │
│                            │ Skill       │      └─────────────┘ │
│                            └─────────────┘                      │
│                                   │                             │
│                                   ▼                             │
│                            ┌─────────────┐                      │
│                            │ Archive Old │                      │
│                            │ Skills      │                      │
│                            └─────────────┘                      │
│                                                                  │
│  At Cycle Start:                                                 │
│  ┌─────────────┐    ┌────────────────┐                          │
│  │ Check All   │───→│ Archive        │                          │
│  │ Skill TTLs  │    │ Expired        │                          │
│  └─────────────┘    └────────────────┘                          │
└──────────────────────────────────────────────────────────────────┘
```

## Configuration

### Environment Variables

```bash
# Required
ANTHROPIC_API_KEY=sk-ant-...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Trading Mode
PAPER_TRADING=true                    # Safe mode (default)
ACTIVE_DOMAINS=dlmm,perps,polymarket,spot

# Timing
CYCLE_INTERVAL_MS=1800000             # 30 minutes

# Thresholds
CONFIDENCE_THRESHOLD=0.6              # Min confidence to execute

# Real Trading (when PAPER_TRADING=false)
SOLANA_PRIVATE_KEY=...
HYPERLIQUID_API_KEY=...
HYPERLIQUID_API_SECRET=...
```

## API Costs

Approximate costs per cycle (4 domains):

| Component | Model | Calls/Cycle | Est. Cost |
|-----------|-------|-------------|-----------|
| Decision Making | claude-sonnet-4 | 4 | ~$0.08 |
| Judge Evaluation | claude-sonnet-4 | 4 | ~$0.04 |
| Skill Similarity | claude-haiku-3.5 | 0-20 | ~$0.01 |
| Skill Generation | claude-sonnet-4 | 0-2 | ~$0.02 |
| **Total/Cycle** | | | **~$0.15** |
| **Daily (48 cycles)** | | | **~$7.20** |

### 7. Portfolio Coordinator (`src/subagents/portfolio-coordinator.ts`) - NEW

The Portfolio Coordinator runs BEFORE domain subagents to provide cross-domain intelligence:

```typescript
interface PortfolioDirective {
  riskLevel: 'conservative' | 'normal' | 'aggressive';
  domainBudgets: Record<Domain, number>;
  marketSentiment: {
    overall: 'bullish' | 'bearish' | 'neutral' | 'uncertain';
    summary: string;
    keyFactors: string[];
  };
  correlationWarnings: string[];
  domainGuidance: Record<Domain, string>;
  domainPriority: Domain[];
}
```

**Features:**
- Dynamic risk level based on market conditions and recent performance
- Risk-adjusted budget allocation per domain
- Market sentiment analysis via Claude Haiku
- Cross-domain correlation detection (e.g., "BTC down affects DLMM, Perps, Spot")
- Domain-specific guidance based on portfolio context
- Performance-based priority ranking

### 8. Cross-Domain Patterns (`src/skills/cross-domain-patterns.ts`) - NEW

Identifies patterns that work across multiple domains and creates "general" skills:

**Pattern Categories:**
- Timing (momentum, reversals, breakouts)
- Risk (stop loss, position sizing, leverage)
- Liquidity (TVL, volume, slippage)
- Sentiment (fear/greed, macro, news)
- Technical (support/resistance, indicators)

**Process:**
1. Analyze decisions from all domains (last 50 per domain)
2. Extract pattern themes from reasoning
3. Find patterns appearing in 2+ domains with >50% win rate
4. Create "general" skills for strong patterns (>55% win rate, 10+ samples)
5. Run every 10 cycles to avoid excessive API costs

**General skills** are stored in `.claude/skills/general/` and loaded into ALL domain prompts.

### 9. Risk Automation System - NEW (Phase 3)

#### 9.1 Position Monitor (`src/services/position-monitor.ts`)

Background service monitoring open positions for exit conditions:

```typescript
export class PositionMonitor {
  // Check interval: every 5 minutes
  private readonly CHECK_INTERVAL_MS = 5 * 60 * 1000;

  start(): void;   // Begin background monitoring
  stop(): void;    // Stop monitoring

  // Register exit conditions
  registerExit(condition: ExitCondition): string;
  removeExit(exitId: string): boolean;

  // Parse exit conditions from agent reasoning
  parseExitFromReasoning(positionId, domain, reasoning, currentPrice): ExitCondition | null;

  // Check all registered exits
  async checkAllExits(): Promise<ExecutedExit[]>;
}
```

**Exit Condition Types:**
- `stop_loss` - Close when price drops below threshold
- `take_profit` - Close when price rises above threshold
- `trailing_stop` - Dynamic stop that follows price up
- `time_based` - Close at specified time
- `liquidation_risk` - Close when margin ratio is critical

**Auto-Registration:**
When opening a position, the system automatically registers:
1. Stop-loss from agent reasoning (if mentioned)
2. Default stop-loss (5% for perps, 15% for spot)
3. Liquidation risk monitor (perps only)

#### 9.2 Drawdown Limits (Hooks)

Two hooks in `src/hooks/built-in.ts` enforce drawdown limits:

**Global Drawdown Limit** (priority: 5)
- Blocks new positions when portfolio down >15% from peak
- Tracks portfolio peak with 1-hour update cooldown
- Configurable via `MAX_DRAWDOWN` env var

**Domain Drawdown Limit** (priority: 6)
- Reduces position size by 50% when domain down >20% from peak
- Uses last 30 performance snapshots to calculate drawdown
- Configurable via `DOMAIN_MAX_DRAWDOWN` env var

```typescript
hookRegistry.register({
  name: 'global-drawdown-limit',
  event: 'PreDecision',
  priority: 5,
  hook: async (ctx) => {
    const drawdown = (peak - current) / peak;
    if (drawdown > 0.15) {
      return { proceed: false, reason: 'Portfolio down >15% from peak' };
    }
    return { proceed: true };
  }
});
```

#### 9.3 Perps Liquidation Prevention

Dedicated monitor for perpetual futures positions:

```typescript
export class PerpsLiquidationMonitor {
  // Check every 2 minutes (more frequent than general position monitor)
  private readonly CHECK_INTERVAL_MS = 2 * 60 * 1000;

  start(): void;
  stop(): void;
}
```

**Risk Levels:**
| Margin Ratio | Risk Level | Action |
|--------------|------------|--------|
| > 50% | Safe | None |
| 25-50% | Warning | Monitor |
| 15-25% | Danger | Reduce 25% |
| 10-15% | Critical | Reduce 50% |
| < 10% | Critical | Close position |

**Auto-Actions:**
- Logs warnings at 25% margin
- Automatically reduces position at 15% margin
- Emergency close at 10% margin

#### 9.4 Built-in Hooks Summary

All registered hooks (in priority order):

| Hook | Priority | Purpose |
|------|----------|---------|
| `global-drawdown-limit` | 5 | Block at -15% portfolio |
| `domain-drawdown-limit` | 6 | Reduce at -20% domain |
| `balance-check` | 10 | Ensure sufficient balance |
| `position-limit` | 20 | Max 3 positions per domain |
| `confidence-threshold` | 30 | Min 60% confidence |
| `human-approval` | 100 | Approval for >$500 trades |
| `decision-logger` | 10 (Post) | Log all decisions |
| `session-start-logger` | 10 | Log session start |
| `session-end-logger` | 10 | Log session end |
| `error-logger` | 10 | Log errors |

### 10. Code Generation Sandbox - NEW (Phase 4)

The sandbox allows agents to write custom trading strategies, backtest them safely, and promote successful strategies to skills.

#### 10.1 Strategy Sandbox (`src/sandbox/strategy-runner.ts`)

**Security Features:**
- Runs in Node.js VM with isolated context
- No network access
- Time-limited execution (30 seconds max)
- Memory-limited execution
- No filesystem access outside sandbox
- Only whitelisted globals available

```typescript
export class StrategySandbox {
  async backtest(strategy: StrategyCode, marketData: MarketDataPoint[]): Promise<BacktestResult>;
  async promoteToSkill(strategy: StrategyCode, result: BacktestResult): Promise<string | null>;
}
```

#### 10.2 Strategy Definition

Agents can define strategies with entry/exit conditions:

```typescript
interface StrategyDefinition {
  name: string;
  domain: Domain;
  description: string;
  entryConditions: string;   // TypeScript code for entry signal
  exitConditions: string;    // TypeScript code for exit signal
  riskManagement: string;    // Position sizing logic
}
```

#### 10.3 Backtest Analysis

Strategies are evaluated against historical data with these thresholds:

| Metric | Threshold | Description |
|--------|-----------|-------------|
| Win Rate | >= 40% | Minimum winning trades percentage |
| Min Trades | >= 10 | Minimum trade count for validity |
| Max Drawdown | <= 20% | Maximum peak-to-trough decline |
| Sharpe Ratio | >= 0.5 | Risk-adjusted return |
| Total Return | >= 5% | Minimum backtest return |

#### 10.4 Built-in Helpers

Strategies have access to common technical indicators:

- `helpers.sma(data, period)` - Simple Moving Average
- `helpers.ema(data, period)` - Exponential Moving Average
- `helpers.rsi(data, period)` - Relative Strength Index
- `helpers.percentChange(a, b)` - Percentage change
- `helpers.crossedAbove(fast, slow)` - Cross detection
- `helpers.crossedBelow(fast, slow)` - Cross detection

#### 10.5 Promotion to Skill

When a strategy passes all thresholds, it's automatically saved as a skill:

```
.claude/skills/strategy-momentum-crossover-1704672000000.md
```

The skill file includes:
- Backtest performance metrics
- Full strategy code
- Usage guidelines
- Risk management rules

### 11. Memory System - NEW (Phase 5)

Provides persistent memory across agent sessions, stored in markdown files for easy inspection.

#### 11.1 Memory Structure

```
.claude/memory/
├── dlmm/
│   ├── MEMORY.md        # Persistent facts
│   ├── 2024-01-07.md    # Daily log
│   └── 2024-01-06.md
├── perps/
│   └── ...
├── polymarket/
│   └── ...
├── spot/
│   └── ...
└── general/
    └── MEMORY.md        # Cross-domain facts
```

#### 11.2 API (`src/memory/index.ts`)

**Persistent Memory:**
```typescript
// Store a persistent fact
await remember('dlmm', 'SOL/USDC pools typically have highest volume on Mondays', 'high');

// Recall all facts
const facts = await recall('dlmm');
// Returns: ['SOL/USDC pools typically have highest volume on Mondays', ...]
```

**Daily Logs:**
```typescript
// Log an observation
await logDailyMemory('dlmm', 'observation', 'Market volatility increased after CPI release');

// Log an outcome
await logDailyMemory('perps', 'outcome', 'BTC long +5.2% closed after 3 hours', { pnl: 52 });
```

**Integration in Prompts:**
```typescript
// Get formatted memory for injection into prompt
const memorySection = await formatMemoryForPrompt('dlmm');
```

#### 11.3 Memory Types

| Type | Description | Persistence |
|------|-------------|-------------|
| `observation` | Market observations | Daily log |
| `learning` | Lessons learned | Daily log |
| `decision` | Decision rationale | Daily log |
| `outcome` | Trade results | Daily log |
| `error` | Errors encountered | Daily log |
| Persistent Fact | Important knowledge | MEMORY.md |

#### 11.4 Memory in Decision Making

Memory is automatically loaded into prompts with:
- Cross-domain knowledge (general facts)
- Domain-specific knowledge
- Recent activity indicator

Facts are limited (20 domain, 10 general) to prevent context bloat.

### 12. Thinking Levels & Model Selection - NEW (Phase 6)

Dynamic model selection based on decision complexity and context.

#### 12.1 Model Selection Logic (`src/subagents/executor.ts`)

```typescript
export function selectModel(context: DecisionContext): ModelConfig {
  // Returns: { model, thinkingLevel, thinkingBudget, maxTokens }
}
```

#### 12.2 Decision Context

| Factor | Impact |
|--------|--------|
| `taskType: monitor` | Use Haiku with minimal thinking |
| `amountUsd < 50` | Use Haiku (low stakes) |
| `amountUsd < 200` | Use Sonnet with low thinking |
| `taskType: strategy` | Use Opus with high thinking |
| `amountUsd > 500` | Increase thinking to high |
| `amountUsd > 1000` | Use Opus |
| `recentLosses >= 3` | Increase thinking level |
| `recentLosses >= 5` | Use Opus |
| `marketVolatility: high` | Bump to high thinking |
| `positionCount >= 3` | High thinking (risk management) |

#### 12.3 Thinking Levels

| Level | Budget Tokens | Use Case |
|-------|---------------|----------|
| `off` | 0 | Not used |
| `minimal` | 1,024 | Quick monitoring, trivial decisions |
| `low` | 4,096 | Simple trades, low amounts |
| `medium` | 10,000 | Standard analysis (default) |
| `high` | 20,000 | Complex analysis, high stakes |

#### 12.4 Model Tiers

| Model | When Used |
|-------|-----------|
| `claude-3-5-haiku` | Monitoring, amounts < $50 |
| `claude-sonnet-4` | Standard decisions (default) |
| `claude-opus-4-5` | Strategy generation, >$1000, losing streaks |

#### 12.5 Cost Optimization

The model selection reduces API costs by:
- Using Haiku for ~40% of calls (monitoring, small trades)
- Using Sonnet for ~55% of calls (standard decisions)
- Using Opus for ~5% of calls (only when necessary)

Estimated cost savings: ~60% compared to always using Opus.

## Future Enhancements (Roadmap)
- Cross-session learning
- Docker isolation for strategy sandbox
- Real-time price feeds for position monitor
- Telegram bot for human approval workflow

---

*Last updated: 2025-01-07*
*Phase 1 (Learning System) complete*
*Phase 2 (Cross-Domain Intelligence) complete*
*Phase 3 (Risk Automation) complete*
*Phase 4 (Code Generation Sandbox) complete*
*Phase 5 (Memory System) complete*
*Phase 6 (Thinking Levels & Model Selection) complete*

**All 6 phases of the claudefi improvement plan are complete.**
