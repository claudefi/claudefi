---
name: spot-memecoin-analysis
description: Analysis and trading strategies for Solana memecoins and spot tokens via Jupiter. Use when evaluating tokens, buying/selling spot positions, or analyzing token metrics.
allowed-tools: spot_fetch_tokens, spot_buy_token, spot_sell_token, spot_get_positions
---

# Spot Token Trading Strategy

## When to Use
- Evaluating new token opportunities
- Deciding to buy or sell spot tokens
- Analyzing token metrics and safety
- Timing entries and exits

## Core Principles

### 1. Risk Management
- This is the highest risk domain
- Position size max: 10% of spot balance per token
- Max 5 concurrent spot positions
- Assume any token can go to zero

### 2. Due Diligence Requirements
- Check contract for rugs/honeypots
- Verify liquidity depth
- Analyze holder distribution
- Review team/socials

### 3. Speed vs Safety Tradeoff
- New launches: High risk, high reward, fast decisions
- Established tokens: Lower risk, more time to analyze

## Token Evaluation Framework

### Green Flags
- Liquidity > $100k and locked
- Top 10 holders < 50% of supply
- Active social presence (not botted)
- Clear narrative/meme
- Growing holder count

### Red Flags
- Liquidity < $50k or unlocked
- Single holder > 20% supply
- Contract not verified/renounced
- Dead socials or obvious bots
- Declining holder count

### Instant Disqualifiers
- Honeypot contract
- Team wallet active selling
- Fake volume (wash trading)
- Copy of rugged token

## Entry Strategies

### Early Entry (High Risk)
- New token < 24h old
- Small position (5% max)
- Quick profit target (2-5x)
- Tight mental stop (-30%)

### Momentum Entry
- Token trending on socials
- Volume increasing
- Price above recent lows
- Enter on pullback, not peak

### Value Entry
- Established token
- Good fundamentals
- Price significantly down from ATH
- Catalyst expected

## Exit Strategies

### Take Profit Rules
- Take 50% at 2x
- Take 25% at 5x
- Let 25% ride with trailing stop
- Never let winner become loser

### Stop Loss Rules
- Early entry: -30% max loss
- Momentum: -20% max loss
- Value: -15% max loss
- Exit IMMEDIATELY on rug signs

### Exit Signals
- Team selling large amounts
- Liquidity being removed
- Narrative dying
- Better opportunity elsewhere

## Market Timing

### Good Times to Trade
- US market hours (high volume)
- After major alpha calls
- During market-wide pumps
- Following successful audits

### Bad Times to Trade
- Low volume hours
- Market-wide dumps
- Right after huge pump (FOMO)
- During network congestion

## Slippage Management

### Expected Slippage
- Large caps: 0.1-0.5%
- Mid caps: 0.5-2%
- Small caps: 2-10%
- Micro caps: 10%+ or fails

### Slippage Rules
- Set tolerance based on market cap
- If slippage warning > 10%, reduce size
- Never market buy with unlimited slippage

## Checklist Before Buying Token
- [ ] Contract verified or audited
- [ ] Liquidity > $50k and locked
- [ ] Top holders < 50% supply
- [ ] No honeypot indicators
- [ ] Position size <= 10% of balance
- [ ] Clear profit target set
- [ ] Mental stop loss defined
- [ ] Slippage tolerance set appropriately
