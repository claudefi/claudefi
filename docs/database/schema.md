# Database Schema

claudefi uses Prisma ORM with SQLite (local development) or PostgreSQL (production via Supabase).

## Setup

### Local Development (SQLite)

```bash
# Initialize database
npm run db:setup

# Generate Prisma client
npm run db:generate

# Open Prisma Studio
npm run db:studio
```

### Production (PostgreSQL)

```bash
# Set environment variables
export SUPABASE_URL=https://xxx.supabase.co
export SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Push schema to database
npm run db:push
```

## Core Models

### AgentConfig

Global agent configuration and domain balances.

```prisma
model AgentConfig {
  id                String   @id @default(cuid())

  // Domain balances (USD)
  dlmmBalance       Float    @default(2500)
  perpsBalance      Float    @default(2500)
  polymarketBalance Float    @default(2500)
  spotBalance       Float    @default(2500)

  // Settings
  paperTrading      Boolean  @default(true)
  activeDomains     String   @default("dlmm,perps,polymarket,spot")
  cycleIntervalMs   Int      @default(1800000)

  // Risk parameters
  maxPositionPct    Float    @default(0.20)
  maxDrawdown       Float    @default(0.15)
  confidenceThreshold Float  @default(0.60)

  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
}
```

### Position

Trading positions across all domains.

```prisma
model Position {
  id              String    @id @default(cuid())

  // Identity
  domain          String    // dlmm, perps, polymarket, spot
  target          String    // Pool/market/token identifier
  targetAddress   String?   // On-chain address

  // Position details
  side            String?   // long, short, yes, no (domain-specific)
  size            Float?    // Position size in native units
  entryPrice      Float?
  currentPrice    Float?
  leverage        Float?    // For perps

  // Values
  entryValueUsd   Float
  currentValueUsd Float
  unrealizedPnl   Float     @default(0)
  realizedPnl     Float?

  // Status
  status          String    @default("open")  // open, closed
  openedAt        DateTime  @default(now())
  closedAt        DateTime?

  // Links
  decisionId      String?
  decision        Decision? @relation(fields: [decisionId], references: [id])

  // Domain-specific metadata (JSON)
  metadata        String    @default("{}")

  @@index([domain])
  @@index([status])
  @@index([openedAt])
}
```

### Decision

Record of all trading decisions.

```prisma
model Decision {
  id          String    @id @default(cuid())

  // Identity
  domain      String
  sessionId   String?

  // Decision details
  action      String    // buy, sell, hold, open_long, etc.
  target      String?   // What asset/pool/market
  amountUsd   Float?
  leverage    Float?    // For perps

  // Reasoning
  reasoning   String    // Claude's explanation
  confidence  Float     // 0-1

  // Outcome (populated after position closes)
  outcome     String?   // profit, loss, pending
  realizedPnl Float?
  pnlPercent  Float?

  // Evaluation
  evaluationId String?  @unique
  evaluation   DecisionEvaluation? @relation(fields: [evaluationId], references: [id])

  // Timestamps
  createdAt   DateTime  @default(now())

  // Relations
  positions   Position[]

  @@index([domain])
  @@index([createdAt])
  @@index([outcome])
}
```

### DecisionEvaluation

Judge's evaluation of decision quality.

```prisma
model DecisionEvaluation {
  id              String    @id @default(cuid())

  // Identity
  decisionId      String    @unique
  decision        Decision?

  // Evaluation
  wasGoodDecision Boolean
  qualityScore    Float?    // 0-1
  keyInsight      String    // Main lesson learned
  insightType     String    // timing, sizing, selection, risk
  judgeWasRight   Boolean?  // Validated by outcome

  // Details
  strengths       String?   // JSON array
  weaknesses      String?   // JSON array
  betterApproach  String?

  // Promotion tracking (for learning pipelines)
  promotedToMemory Boolean  @default(false)
  promotedToSkill  Boolean  @default(false)
  promotedAt       DateTime?

  createdAt       DateTime  @default(now())

  @@index([wasGoodDecision])
  @@index([insightType])
  @@index([promotedToMemory])
}
```

### SkillReflection

Lesson tracking and effectiveness (reflections stored in `.claude/skills/reflections/`).

```prisma
model SkillReflection {
  id                 String    @id @default(cuid())

  // Identity
  skillName          String
  skillPath          String
  domain             String
  sourceType         String    // warning, pattern, strategy, evolved

  // Effectiveness tracking
  effectivenessScore Float?    // 0-1, null if not enough data
  timesApplied       Int       @default(0)
  successCount       Int       @default(0)
  failureCount       Int       @default(0)
  lastApplied        DateTime?

  // Qualification status (for lesson recommendations)
  provenEffective     Boolean   @default(false) // >=3 uses, >=50% success
  qualifiedAt         DateTime?
  consecutiveFailures Int       @default(0)

  // Source info
  triggerDecisionId  String?
  triggerPnl         Float?
  triggerPnlPct      Float?

  // Lifecycle
  createdAt          DateTime  @default(now())
  updatedAt          DateTime  @updatedAt

  @@unique([skillName, domain])
  @@index([domain])
  @@index([sourceType])
  @@index([effectivenessScore])
  @@index([provenEffective])
}
```

### SkillRecommendation

Tracks which lessons were recommended and applied per decision.

```prisma
model SkillRecommendation {
  id                   String    @id @default(uuid())

  // Links
  decisionId           String
  skillName            String    // Lesson name
  domain               String

  // Recommendation
  relevanceScore       Float     // 0-1, how relevant was this lesson
  wasPresented         Boolean   @default(true)
  wasApplied           Boolean   @default(false)
  agentQuote           String?   // Context of usage

  // Outcome (populated when trade closes)
  tradeOutcome         String?   // profit, loss, pending
  pnlPercent           Float?
  contributedToSuccess Boolean?

  createdAt            DateTime  @default(now())
  updatedAt            DateTime  @updatedAt

  @@index([decisionId])
  @@index([skillName, domain])
}
```

### LearningLink

Tracks promotions between learning systems.

```prisma
model LearningLink {
  id         String   @id @default(uuid())

  // Source
  sourceType String   // 'judge', 'memory', 'skill'
  sourceId   String

  // Target
  targetType String   // 'memory', 'skill'
  targetId   String

  // Link metadata
  linkType   String   // 'promoted', 'derived'
  metadata   String   @default("{}")

  createdAt  DateTime @default(now())

  @@index([sourceType, sourceId])
}
```

### PerformanceSnapshot

Point-in-time portfolio snapshots.

```prisma
model PerformanceSnapshot {
  id              String    @id @default(cuid())

  // Values
  totalValueUsd   Float
  totalPnl        Float
  totalPnlPercent Float

  // Per-domain breakdown (JSON)
  domainValues    String    // { dlmm: 2600, perps: 2400, ... }
  domainPnl       String    // { dlmm: 100, perps: -100, ... }

  // Metrics
  openPositions   Int
  winRate         Float?
  sharpeRatio     Float?

  // Timestamps
  timestamp       DateTime  @default(now())

  @@index([timestamp])
}
```

### Session

Subagent session tracking.

```prisma
model Session {
  id          String    @id @default(cuid())

  domain      String
  startedAt   DateTime  @default(now())
  endedAt     DateTime?

  // Stats
  toolCalls   Int       @default(0)
  decisions   Int       @default(0)
  errors      Int       @default(0)

  // Context (JSON)
  context     String?   // Serialized session state

  @@index([domain])
  @@index([startedAt])
}
```

## Relationships

```
AgentConfig (1) -------- Global settings

Decision (many)
    |
    +-- Position (many) -- Each decision can create positions
    |
    +-- DecisionEvaluation (1) -- Each decision gets evaluated

SkillReflection (many) -------- Tracks skill effectiveness

PerformanceSnapshot (many) -------- Historical performance

Session (many) -------- Subagent sessions
```

## Common Queries

### Get Open Positions

```typescript
const openPositions = await prisma.position.findMany({
  where: { status: 'open' },
  include: { decision: true },
  orderBy: { openedAt: 'desc' },
});
```

### Get Domain Balance

```typescript
const config = await prisma.agentConfig.findFirst();
const balance = config.dlmmBalance; // Or perpsBalance, etc.
```

### Get Recent Decisions

```typescript
const decisions = await prisma.decision.findMany({
  where: {
    domain: 'perps',
    createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
  },
  include: { evaluation: true },
  orderBy: { createdAt: 'desc' },
});
```

### Get Effective Skills

```typescript
const skills = await prisma.skillReflection.findMany({
  where: {
    domain: { in: ['dlmm', 'general'] },
    archived: false,
    OR: [
      { effectivenessScore: { gte: 0.3 } },
      { effectivenessScore: null },
    ],
  },
  orderBy: { effectivenessScore: 'desc' },
});
```

### Get Performance History

```typescript
const snapshots = await prisma.performanceSnapshot.findMany({
  where: {
    timestamp: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
  },
  orderBy: { timestamp: 'asc' },
});
```

## Migrations

Create a migration when changing schema:

```bash
# Create migration
npx prisma migrate dev --name add_new_field

# Apply migrations in production
npx prisma migrate deploy
```

## Prisma Studio

Visual database browser:

```bash
npm run db:studio
```

This opens a web UI at `http://localhost:5555` for browsing and editing data.

## Related Documentation

- [Configuration](../getting-started/configuration.md) - Database config
- [Skills System](../skills/overview.md) - Skills & reflections
- [Learning System](../learning/overview.md) - Lesson recommendations & promotion
- [Architecture Overview](../architecture/overview.md) - System design
