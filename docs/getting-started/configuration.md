# Configuration

claudefi is configured via environment variables. This guide covers all available options.

## Required Variables

These are the minimum required variables to run claudefi:

```bash
# Claude API key (required)
ANTHROPIC_API_KEY=sk-ant-...
```

## Model Selection

claudefi uses the Claude Agent SDK, which requires specific model versions:

```bash
# Model to use (default: claude-opus-4-5-20251101)
CLAUDE_MODEL=claude-opus-4-5-20251101
```

### Agent SDK Compatible Models

| Model | ID | Best For | Cost |
|-------|-----|----------|------|
| **Opus 4.5** | `claude-opus-4-5-20251101` | Best quality, complex decisions | $$$ |
| **Sonnet 4** | `claude-sonnet-4-20250514` | Good balance of quality/speed | $$ |
| **Sonnet 3.5** | `claude-3-5-sonnet-20241022` | Fast, cost-effective | $ |

> **Note**: Only these models support extended thinking and the Agent SDK. Other models will not work.

## Trading Mode

Control how trades are executed:

```bash
# Trading mode: paper | testnet | mainnet
TRADING_MODE=paper

# Active domains (comma-separated)
ACTIVE_DOMAINS=dlmm,perps,polymarket,spot

# Cycle interval in milliseconds (default: 30 minutes)
CYCLE_INTERVAL_MS=1800000
```

### Mode Comparison

| Mode | Market Data | Execution | Wallet Needed | Real Money |
|------|-------------|-----------|---------------|------------|
| `paper` | Live | Simulated | No | No |
| `testnet` | Live | Real (test networks) | Yes | No |
| `mainnet` | Live | Real | Yes | Yes |

## Database

```bash
# Option 1: SQLite (default, no config needed)
# Database created at prisma/dev.db

# Option 2: Supabase/PostgreSQL
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

## Network Configuration

Required for testnet and mainnet modes:

```bash
# Solana RPC endpoints
SOLANA_MAINNET_RPC=https://mainnet.helius-rpc.com/?api-key=xxx
SOLANA_DEVNET_RPC=https://api.devnet.solana.com
```

## Wallet Configuration

Required for real trading (testnet/mainnet):

```bash
# Solana wallet (Base58 encoded private key)
SOLANA_PRIVATE_KEY=...

# Hyperliquid wallet (Hex with 0x prefix)
HYPERLIQUID_PRIVATE_KEY=0x...

# Polymarket wallet (for CLOB trading)
POLYMARKET_PRIVATE_KEY=0x...
```

> **Security Note**: Never commit private keys to git. Use environment variables or a secrets manager.

## Optional API Keys

These enhance functionality but aren't required:

```bash
# Jupiter Tokens V2 API (for trending tokens)
JUPITER_API_KEY=xxx

# Firecrawl (for Polymarket research)
FIRECRAWL_API_KEY=xxx
```

## Risk Parameters

Control position sizing and risk limits:

```bash
# Maximum position size as percentage of domain balance
MAX_POSITION_PCT=0.20  # 20%

# Maximum positions per domain
MAX_POSITIONS_PER_DOMAIN=3

# Minimum confidence threshold for trades
CONFIDENCE_THRESHOLD=0.60  # 60%

# Global drawdown limit (pause trading)
MAX_DRAWDOWN=0.15  # 15%

# Per-domain drawdown limit (reduce exposure)
DOMAIN_MAX_DRAWDOWN=0.20  # 20%
```

## Resilience Settings

Control retry behavior and fallback:

```bash
# Retry configuration for API calls
RETRY_MAX_ATTEMPTS=3
RETRY_BASE_DELAY_MS=300
RETRY_MAX_DELAY_MS=30000

# Context pruning thresholds
CONTEXT_MAX_TOKENS=180000
CONTEXT_SOFT_THRESHOLD=0.7   # Start pruning at 70%
CONTEXT_HARD_THRESHOLD=0.9   # Aggressive prune at 90%

# Model fallback (comma-separated, first is primary)
MODEL_FALLBACK_CHAIN=claude-opus-4-5-20251101,claude-sonnet-4-20250514,claude-3-5-sonnet-20241022

# Idempotency TTL (prevents duplicate trades)
IDEMPOTENCY_TTL_MS=86400000  # 24 hours
```

### Model Fallback

When the primary model is overloaded or rate-limited, claudefi automatically falls back:

1. **claude-opus-4-5** (primary) - Best quality decisions
2. **claude-sonnet-4** (fallback) - Good balance
3. **claude-3-5-sonnet** (fallback) - Fast, reliable

Each model has a 60-second cooldown after failure before retry.

### Transcript Storage

All conversations are logged to JSONL files for debugging and audit:

```
.claude/transcripts/
  dlmm/2024-01-07-abc123.jsonl
  perps/2024-01-07-def456.jsonl
```

- Files older than 24 hours are automatically compressed
- Files older than 30 days are automatically deleted

## Notifications

Configure Telegram alerts:

```bash
TELEGRAM_BOT_TOKEN=xxx
TELEGRAM_CHAT_ID=xxx
```

## Full Example

```bash
# Core
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# Trading
TRADING_MODE=paper
ACTIVE_DOMAINS=dlmm,perps,polymarket,spot
CYCLE_INTERVAL_MS=1800000

# Database (optional - defaults to SQLite)
# SUPABASE_URL=https://xxx.supabase.co
# SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Network (for real trading)
# SOLANA_MAINNET_RPC=https://mainnet.helius-rpc.com/?api-key=xxx

# Wallets (for real trading)
# SOLANA_PRIVATE_KEY=...
# HYPERLIQUID_PRIVATE_KEY=0x...

# Risk
MAX_POSITION_PCT=0.20
MAX_POSITIONS_PER_DOMAIN=3
CONFIDENCE_THRESHOLD=0.60
MAX_DRAWDOWN=0.15

# Notifications
# TELEGRAM_BOT_TOKEN=xxx
# TELEGRAM_CHAT_ID=xxx
```

## Domain-Specific Configuration

Each domain has default starting balances configured in the database:

| Domain | Default Balance |
|--------|----------------|
| DLMM | $2,500 |
| Perps | $2,500 |
| Polymarket | $2,500 |
| Spot | $2,500 |

These can be modified via Prisma Studio:

```bash
npm run db:studio
```

## Runtime Configuration

Some settings can be changed without restarting:

```typescript
// In code or via admin API
await updateAgentConfig({
  activeDomains: ['dlmm', 'perps'],
  paperTrading: true,
});
```

## Related Documentation

- [Installation](./installation.md) - Initial setup
- [Paper Trading](../trading/paper-trading.md) - Testing without real money
- [Real Trading](../trading/real-trading.md) - Live trading setup
- [Risk Management](../trading/risk-management.md) - Understanding risk controls
