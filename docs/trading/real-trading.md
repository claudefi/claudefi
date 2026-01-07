# Real Trading

This guide covers setting up claudefi for live trading with real funds.

## Warning

**Real trading involves financial risk.** Before enabling:

1. Thoroughly test with paper trading
2. Start with small amounts
3. Monitor closely
4. Understand all risk controls
5. Only risk what you can afford to lose

## Prerequisites

### Paper Trading Validation

Before going live, validate with paper trading:

- [ ] Run for at least 1 week (336 cycles)
- [ ] Review decision quality and skill effectiveness
- [ ] Verify hooks are working correctly
- [ ] Check for any errors or unexpected behavior

### Wallet Setup

#### Solana Wallet (DLMM, Spot)

```bash
# Generate or import a Solana wallet
solana-keygen new --outfile ~/.config/solana/claudefi.json

# Get the public key
solana-keygen pubkey ~/.config/solana/claudefi.json

# Fund the wallet with SOL and USDC
```

Export private key for claudefi:

```bash
# Convert to base58 for .env
cat ~/.config/solana/claudefi.json | node -e "
  const data = require('fs').readFileSync(0, 'utf-8');
  const key = JSON.parse(data);
  const bs58 = require('bs58');
  console.log(bs58.encode(Buffer.from(key)));
"
```

#### Hyperliquid Wallet (Perps)

```bash
# Generate or use existing EVM wallet
# Get private key with 0x prefix
```

Fund via Hyperliquid deposit:
1. Go to https://app.hyperliquid.xyz
2. Deposit USDC from Arbitrum

#### Polymarket Wallet (Predictions)

```bash
# Use EVM wallet on Polygon
# Need MATIC for gas and USDC for trading
```

## Configuration

### Environment Variables

```bash
# Enable real trading
TRADING_MODE=mainnet

# Solana
SOLANA_MAINNET_RPC=https://mainnet.helius-rpc.com/?api-key=YOUR_KEY
SOLANA_PRIVATE_KEY=your_base58_private_key

# Hyperliquid
HYPERLIQUID_PRIVATE_KEY=0xyour_hex_private_key

# Polymarket
POLYMARKET_PRIVATE_KEY=0xyour_hex_private_key
```

### Risk Parameters

Start conservative:

```bash
# Reduce position sizes
MAX_POSITION_PCT=0.10          # 10% max (vs 20% paper)

# Lower drawdown limits
MAX_DRAWDOWN=0.10              # 10% global (vs 15% paper)
DOMAIN_MAX_DRAWDOWN=0.15       # 15% domain (vs 20% paper)

# Require higher confidence
CONFIDENCE_THRESHOLD=0.70      # 70% (vs 60% paper)

# Require approval for all trades
HUMAN_APPROVAL_THRESHOLD=100   # $100+ needs approval
```

## Testnet First

Before mainnet, test on testnets:

### Solana Devnet

```bash
TRADING_MODE=testnet
SOLANA_DEVNET_RPC=https://api.devnet.solana.com
```

Fund with devnet SOL:
```bash
solana airdrop 5 YOUR_ADDRESS --url devnet
```

### Hyperliquid Testnet

```bash
# Uses testnet automatically when TRADING_MODE=testnet
```

Access: https://app.hyperliquid-testnet.xyz

## Gradual Rollout

### Phase 1: Single Domain

Start with one domain:

```bash
ACTIVE_DOMAINS=dlmm
```

Monitor for 1 week before adding more.

### Phase 2: Add Domains

Gradually add domains:

```bash
ACTIVE_DOMAINS=dlmm,spot
# Then after validation:
ACTIVE_DOMAINS=dlmm,spot,perps
# Finally:
ACTIVE_DOMAINS=dlmm,spot,perps,polymarket
```

### Phase 3: Scale Up

Gradually increase sizes:

```bash
# Week 1
MAX_POSITION_PCT=0.05  # 5%

# Week 2
MAX_POSITION_PCT=0.10  # 10%

# Week 3+
MAX_POSITION_PCT=0.15  # 15%
```

## Monitoring

### Real-Time Alerts

Configure Telegram for immediate alerts:

```bash
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
```

You'll receive:
- Trade executions
- Error notifications
- Drawdown warnings
- Position updates

### Dashboard

Use Prisma Studio for real-time monitoring:

```bash
npm run db:studio
```

### External Monitoring

Monitor wallet balances directly:

- **Solana**: https://solscan.io/account/YOUR_ADDRESS
- **Hyperliquid**: https://app.hyperliquid.xyz/portfolio
- **Polymarket**: Check positions in UI

## Emergency Procedures

### Pause Trading

```bash
# Quick disable - set paper mode
TRADING_MODE=paper

# Or disable domains
ACTIVE_DOMAINS=
```

### Manual Position Exit

If claudefi can't exit positions:

**DLMM**: Use Meteora UI at https://app.meteora.ag
**Perps**: Use Hyperliquid UI at https://app.hyperliquid.xyz
**Spot**: Use Jupiter UI at https://jup.ag
**Polymarket**: Use Polymarket UI at https://polymarket.com

### Kill Switch

The human-approval hook can block all trades:

```typescript
hookRegistry.register({
  name: 'emergency-stop',
  event: 'PreDecision',
  priority: 1,
  hook: async () => ({ proceed: false, reason: 'Emergency stop active' }),
});
```

## Transaction Tracking

All real transactions are logged:

```typescript
// Transaction record
{
  domain: 'perps',
  action: 'open_long',
  target: 'BTC',
  txHash: '0x...', // On-chain transaction
  status: 'confirmed',
  gasUsed: 150000,
  gasCost: 0.002,
}
```

Query transaction history:

```typescript
const txHistory = await prisma.transaction.findMany({
  where: { domain: 'perps' },
  orderBy: { timestamp: 'desc' },
  take: 50,
});
```

## Cost Considerations

### API Costs

| Service | Estimate |
|---------|----------|
| Claude API | ~$13/day |
| RPC endpoints | $0-50/mo |
| Data APIs | Usually free |

### Transaction Costs

| Domain | Cost per Trade |
|--------|---------------|
| DLMM | ~0.001 SOL (~$0.15) |
| Spot | ~0.001 SOL (~$0.15) |
| Perps | ~0.06% of size |
| Polymarket | ~0.01 MATIC (~$0.01) |

## Checklist Before Going Live

- [ ] Paper traded for 1+ week
- [ ] Reviewed decision quality
- [ ] All wallets funded
- [ ] Private keys secured
- [ ] Risk parameters reduced
- [ ] Telegram alerts configured
- [ ] Emergency procedures documented
- [ ] Starting with single domain
- [ ] Human approval threshold low
- [ ] Monitoring dashboard ready

## Related Documentation

- [Paper Trading](./paper-trading.md) - Testing mode
- [Risk Management](./risk-management.md) - Risk controls
- [Configuration](../getting-started/configuration.md) - Full config reference
