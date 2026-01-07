# Architecture Overview

claudefi is built as a modular, event-driven system with clear separation between market data, decision-making, and execution layers.

## High-Level Data Flow

```mermaid
flowchart TB
    subgraph APIs["Live Market APIs"]
        M[Meteora]
        H[Hyperliquid]
        P[Polymarket]
        J[Jupiter]
    end

    subgraph Agent["Claude Agent"]
        MCP[MCP Tools]
        SK[Skills]
        CLAUDE((Claude<br/>Opus 4.5))
    end

    subgraph Execution["Execution Layer"]
        PAPER[Paper Trading]
        REAL[Real Trading]
        subgraph Hooks
            VAL[Validation]
            LOG[Logging]
            DD[Drawdown Guard]
        end
    end

    DB[(Database<br/>Prisma)]

    subgraph Learning["Learning System"]
        JUDGE[Judge]
        SKILL[Skill Creator]
    end

    APIs --> Agent
    Agent --> Execution
    Execution --> DB
    DB --> Learning
    Learning -.->|Feedback| SK

```

## Component Interaction

```mermaid
flowchart LR
    subgraph Orchestrator
        RL[Ralph Loop]
    end

    subgraph Subagents
        DLMM[DLMM Agent]
        PERPS[Perps Agent]
        SPOT[Spot Agent]
        POLY[Polymarket Agent]
    end

    subgraph MCP["MCP Servers"]
        T1[dlmm-server]
        T2[perps-server]
        T3[spot-server]
        T4[polymarket-server]
    end

    RL --> DLMM & PERPS & SPOT & POLY
    DLMM --> T1
    PERPS --> T2
    SPOT --> T3
    POLY --> T4

```

## Core Components

### 1. Orchestrator (Ralph Loop)

The central coordinator that runs the continuous trading cycle:

- Schedules domain execution
- Coordinates cross-domain intelligence
- Manages skill lifecycle
- Handles error recovery

See [The Ralph Loop](./ralph-loop.md) for details.

### 2. Subagents

Domain-specific Claude agents, each with:

- Custom system prompt with trading strategies
- MCP tools for market data and execution
- Session persistence for multi-turn conversations
- Access to relevant skills

### 3. MCP Servers

Model Context Protocol servers that expose tools to Claude:

- `dlmm-server.ts` - Meteora pool operations
- `perps-server.ts` - Hyperliquid trading
- `polymarket-server.ts` - Prediction markets
- `spot-server.ts` - Token swaps

See [MCP Server Overview](../mcp-server/overview.md) for details.

### 4. Clients

Direct API clients for each platform:

- **Meteora Client** - DLMM pool data and LP operations
- **Hyperliquid Client** - Perp trading and positions
- **Jupiter Client** - Token swaps and pricing
- **Gamma Client** - Polymarket data

See [Clients](../clients/meteora.md) for API details.

### 5. Skills System

Self-improvement through outcome analysis:

- Warning skills from losses
- Pattern skills from wins
- Strategy skills from experience
- Automatic expiration and archiving

See [Skills System](../skills/overview.md) for details.

### 6. Hooks System

Event-driven middleware for validation and logging:

- Pre/post decision hooks
- Tool use interception
- Global risk controls

See [Hooks System](../hooks/overview.md) for details.

### 7. Database Layer

Prisma ORM with SQLite (local) or PostgreSQL (production):

- Position tracking
- Decision history
- Skill effectiveness
- Performance snapshots

See [Database Schema](../database/schema.md) for details.

## Decision Flow Example

Here's what happens when claudefi decides to open a perps position:

```mermaid
sequenceDiagram
    participant RL as Ralph Loop
    participant SA as Perps Subagent
    participant MCP as MCP Server
    participant HL as Hyperliquid
    participant HK as Hooks
    participant DB as Database
    participant JG as Judge

    RL->>SA: Trigger cycle
    SA->>SA: Load skills + context
    SA->>MCP: fetch_markets()
    MCP->>HL: GET /info
    HL-->>MCP: Market data
    MCP-->>SA: Markets + indicators
    SA->>SA: Analyze with skills
    SA->>MCP: submit_decision()
    MCP->>HK: PreDecision
    HK-->>MCP: Validated
    MCP->>DB: Record position
    DB-->>MCP: Confirmed
    MCP-->>SA: Execution result
    RL->>JG: Evaluate decision
    JG->>DB: Store evaluation
    JG-->>RL: Generate skill if significant
```

## Design Principles

### Separation of Concerns

- **Market Data**: Clients handle API specifics
- **Decision Logic**: Claude with prompts and skills
- **Execution**: Hooks validate, executor acts
- **Learning**: Judge and skill creator analyze

### Fail-Safe Design

- Paper trading by default
- Multiple validation hooks
- Position limits per domain
- Global drawdown protection

### Extensibility

- New domains: Add client + MCP server + prompts
- New hooks: Register via hook registry
- New skills: Generated automatically from outcomes

## Related Documentation

- [The Ralph Loop](./ralph-loop.md) - Execution cycle details
- [Directory Structure](./directory-structure.md) - Code organization
- [MCP Server Overview](../mcp-server/overview.md) - Tool system
