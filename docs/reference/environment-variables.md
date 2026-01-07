# Environment Variables

Complete reference for all claudefi environment variables.

## Required Variables

```bash
# Claude API key (required)
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx
```

## Trading Configuration

```bash
# Trading mode
TRADING_MODE=paper                    # paper | testnet | mainnet
                                      # Default: paper

# Active domains (comma-separated)
ACTIVE_DOMAINS=dlmm,perps,polymarket,spot
                                      # Default: all four domains

# Cycle interval in milliseconds
CYCLE_INTERVAL_MS=1800000             # Default: 1800000 (30 minutes)
```

## Database Configuration

```bash
# Option 1: SQLite (default)
# No configuration needed - uses prisma/dev.db

# Option 2: Supabase/PostgreSQL
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Direct PostgreSQL connection (alternative)
DATABASE_URL=postgresql://user:pass@host:5432/db
```

## Network Configuration

```bash
# Solana RPC endpoints
SOLANA_MAINNET_RPC=https://mainnet.helius-rpc.com/?api-key=xxxxx
SOLANA_DEVNET_RPC=https://api.devnet.solana.com
                                      # Default: public endpoints

# Hyperliquid automatically uses:
# Mainnet: https://api.hyperliquid.xyz
# Testnet: https://api.hyperliquid-testnet.xyz
```

## Wallet Configuration

Required for testnet/mainnet trading:

```bash
# Solana wallet (Base58 encoded private key)
SOLANA_PRIVATE_KEY=4Nda...xxxxx

# Hyperliquid wallet (Hex with 0x prefix)
HYPERLIQUID_PRIVATE_KEY=0x1234...xxxxx

# Polymarket wallet (Hex with 0x prefix)
POLYMARKET_PRIVATE_KEY=0x5678...xxxxx
```

**Security Note**: Never commit private keys. Use environment variables or a secrets manager.

## Risk Parameters

```bash
# Maximum position size as percentage of domain balance
MAX_POSITION_PCT=0.20                 # Default: 0.20 (20%)

# Maximum concurrent positions per domain
MAX_POSITIONS_PER_DOMAIN=3            # Default: 3

# Minimum confidence threshold for trades
CONFIDENCE_THRESHOLD=0.60             # Default: 0.60 (60%)

# Global portfolio drawdown limit (pauses trading)
MAX_DRAWDOWN=0.15                     # Default: 0.15 (15%)

# Per-domain drawdown limit (blocks new entries)
DOMAIN_MAX_DRAWDOWN=0.20              # Default: 0.20 (20%)

# Trade amount requiring human approval
HUMAN_APPROVAL_THRESHOLD=500          # Default: 500 (USD)
```

## API Keys (Optional)

```bash
# Jupiter Tokens V2 API
JUPITER_API_KEY=xxxxx                 # Optional: improves rate limits

# Firecrawl for Polymarket research
FIRECRAWL_API_KEY=xxxxx               # Optional: enables web scraping

# GeckoTerminal
GECKO_API_KEY=xxxxx                   # Optional: improves rate limits
```

## Notifications

```bash
# Telegram bot for alerts
TELEGRAM_BOT_TOKEN=1234567890:ABCdefGHIjklMNOpqrsTUVwxyz
TELEGRAM_CHAT_ID=-1001234567890       # Group or user chat ID
```

## Logging

```bash
# Log level
LOG_LEVEL=info                        # debug | info | warn | error
                                      # Default: info

# Enable detailed tool logging
LOG_TOOL_CALLS=true                   # Default: false
```

## Full Example

```bash
# =============================================================================
# CLAUDEFI CONFIGURATION
# =============================================================================

# --- Required ---
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# --- Trading ---
TRADING_MODE=paper
ACTIVE_DOMAINS=dlmm,perps,polymarket,spot
CYCLE_INTERVAL_MS=1800000

# --- Database (Supabase) ---
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# --- Network ---
SOLANA_MAINNET_RPC=https://mainnet.helius-rpc.com/?api-key=xxxxx

# --- Wallets (for real trading) ---
# SOLANA_PRIVATE_KEY=xxxxx
# HYPERLIQUID_PRIVATE_KEY=0xxxxx
# POLYMARKET_PRIVATE_KEY=0xxxxx

# --- Risk Parameters ---
MAX_POSITION_PCT=0.20
MAX_POSITIONS_PER_DOMAIN=3
CONFIDENCE_THRESHOLD=0.60
MAX_DRAWDOWN=0.15
DOMAIN_MAX_DRAWDOWN=0.20
HUMAN_APPROVAL_THRESHOLD=500

# --- API Keys (optional) ---
# JUPITER_API_KEY=xxxxx
# FIRECRAWL_API_KEY=xxxxx

# --- Notifications ---
TELEGRAM_BOT_TOKEN=xxxxx
TELEGRAM_CHAT_ID=xxxxx

# --- Logging ---
LOG_LEVEL=info
```

## Environment-Specific Configs

### Development

```bash
TRADING_MODE=paper
LOG_LEVEL=debug
LOG_TOOL_CALLS=true
```

### Testing

```bash
TRADING_MODE=testnet
SOLANA_DEVNET_RPC=https://api.devnet.solana.com
LOG_LEVEL=info
```

### Production

```bash
TRADING_MODE=mainnet
SOLANA_MAINNET_RPC=https://mainnet.helius-rpc.com/?api-key=xxxxx
LOG_LEVEL=warn
```

## Validation

claudefi validates environment on startup:

```typescript
function validateEnvironment(): void {
  // Required
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error('ANTHROPIC_API_KEY is required');
  }

  // Trading mode validation
  if (process.env.TRADING_MODE === 'mainnet') {
    // Require wallets for mainnet
    if (!process.env.SOLANA_PRIVATE_KEY) {
      throw new Error('SOLANA_PRIVATE_KEY required for mainnet');
    }
  }

  // Validate risk parameters
  const maxDrawdown = parseFloat(process.env.MAX_DRAWDOWN || '0.15');
  if (maxDrawdown > 0.30) {
    console.warn('MAX_DRAWDOWN > 30% is very risky');
  }
}
```

## Related Documentation

- [Configuration Guide](../getting-started/configuration.md) - Detailed setup
- [Paper Trading](../trading/paper-trading.md) - Paper trading setup
- [Real Trading](../trading/real-trading.md) - Mainnet setup
