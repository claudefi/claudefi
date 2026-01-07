# API Documentation Links

External API documentation for all platforms integrated with claudefi.

## Meteora (DLMM)

| Resource | URL |
|----------|-----|
| DLMM Documentation | https://docs.meteora.ag/dlmm |
| API Base | https://dlmm-api.meteora.ag |
| SDK (TypeScript) | https://github.com/MeteoraAg/dlmm-sdk |
| Discord | https://discord.gg/meteora |

### Key Endpoints

```
GET /pair/all               # List all pools
GET /pair/{address}         # Pool details
GET /pair/{address}/bins    # Bin distribution
```

## Jupiter

| Resource | URL |
|----------|-----|
| Documentation | https://dev.jup.ag/docs |
| Swap API | https://dev.jup.ag/docs/swap-api |
| Tokens V2 API | https://dev.jup.ag/api-reference/tokens/v2 |
| LLMs.txt | https://dev.jup.ag/llms.txt |
| SDK (TypeScript) | https://github.com/jup-ag/jupiter-core |

### Key Endpoints

```
GET  /quote                 # Get swap quote
POST /swap                  # Execute swap
GET  /tokens/v2/trending    # Trending tokens
GET  /tokens/v2/new         # New tokens
GET  /price                 # Token prices
```

## Hyperliquid

| Resource | URL |
|----------|-----|
| API Documentation | https://hyperliquid.gitbook.io/hyperliquid-docs/for-developers/api |
| Mainnet API | https://api.hyperliquid.xyz |
| Testnet API | https://api.hyperliquid-testnet.xyz |
| SDK (Python) | https://github.com/hyperliquid-dex/hyperliquid-python-sdk |
| App | https://app.hyperliquid.xyz |
| Testnet App | https://app.hyperliquid-testnet.xyz |

### Key Endpoints

```
POST /info   # Market data, positions, balances
POST /exchange  # Place/cancel orders
```

## Polymarket (Gamma API)

| Resource | URL |
|----------|-----|
| Gamma API Documentation | https://docs.polymarket.com/#gamma-markets-api |
| API Base | https://gamma-api.polymarket.com |
| CLOB Documentation | https://docs.polymarket.com/#clob-api |
| App | https://polymarket.com |

### Key Endpoints

```
GET /markets                # List markets
GET /markets/{id}           # Market details
GET /markets/trending       # Trending markets
```

## GeckoTerminal

| Resource | URL |
|----------|-----|
| API Documentation | https://www.geckoterminal.com/dex-api |
| API Base | https://api.geckoterminal.com/api/v2 |

### Key Endpoints

```
GET /networks/{network}/tokens/{address}  # Token info
GET /networks/{network}/pools/{address}   # Pool info
GET /networks/{network}/trending_pools    # Trending pools
```

## Solana

| Resource | URL |
|----------|-----|
| RPC Documentation | https://docs.solana.com/api |
| Web3.js SDK | https://solana-labs.github.io/solana-web3.js |
| SPL Token | https://spl.solana.com/token |
| Explorer | https://solscan.io |

### RPC Providers

| Provider | URL |
|----------|-----|
| Helius | https://helius.dev |
| QuickNode | https://quicknode.com |
| Alchemy | https://alchemy.com |
| Public (rate limited) | https://api.mainnet-beta.solana.com |

## Anthropic (Claude)

| Resource | URL |
|----------|-----|
| Claude API Documentation | https://docs.anthropic.com/en/api |
| Agent SDK | https://docs.anthropic.com/en/docs/build-with-claude/agent-sdk |
| Model Pricing | https://anthropic.com/api |

## Firecrawl (Optional)

| Resource | URL |
|----------|-----|
| Documentation | https://docs.firecrawl.dev |
| API Base | https://api.firecrawl.dev |

Used for web scraping in Polymarket research.

## Rate Limits

Approximate rate limits for free tiers:

| API | Requests/min | Notes |
|-----|--------------|-------|
| Meteora | 60 | Generous for DLMM |
| Jupiter | 60 | Higher with API key |
| Hyperliquid | 120 | Very generous |
| Polymarket | 30 | Strict on trending |
| GeckoTerminal | 30 | Higher with API key |
| Solana RPC | Varies | Provider dependent |

## Authentication

### API Keys

Most APIs are public, but some benefit from API keys:

```bash
# Jupiter (higher rate limits)
JUPITER_API_KEY=xxxxx

# Firecrawl (required for web scraping)
FIRECRAWL_API_KEY=xxxxx

# GeckoTerminal (higher rate limits)
GECKO_API_KEY=xxxxx
```

### Wallet Authentication

For trading operations:

```bash
# Solana (Base58 private key)
SOLANA_PRIVATE_KEY=xxxxx

# Hyperliquid (Hex with 0x)
HYPERLIQUID_PRIVATE_KEY=0xxxxx

# Polymarket (Hex with 0x)
POLYMARKET_PRIVATE_KEY=0xxxxx
```

## Health Check Endpoints

Use these to verify API connectivity:

```bash
# Meteora
curl https://dlmm-api.meteora.ag/pair/all | head

# Jupiter
curl "https://quote-api.jup.ag/v6/quote?inputMint=So11111111111111111111111111111111111111112&outputMint=EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v&amount=1000000"

# Hyperliquid
curl -X POST https://api.hyperliquid.xyz/info -H "Content-Type: application/json" -d '{"type":"meta"}'

# Polymarket
curl https://gamma-api.polymarket.com/markets

# GeckoTerminal
curl https://api.geckoterminal.com/api/v2/networks/solana/trending_pools
```

## Related Documentation

- [Clients](../clients/meteora.md) - Client implementations
- [Configuration](../getting-started/configuration.md) - API key setup
