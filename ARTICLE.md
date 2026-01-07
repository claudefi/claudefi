# How We Built an AI Trading Agent That Knows When to Forget

*18 months of building AI agents led here. The Claude Agent SDK made it real.*

---

## The Problem with AI Traders

Most AI trading systems fail for the same reason: they're static.

They execute fixed strategies. When market conditions change, they keep doing the same thing. When they lose money, they don't learn why. When they win, they can't replicate it systematically.

The feedback loop is broken. Information flows in one direction - from human to bot - and never comes back.

I've spent 18 months building AI agents. Langchain. Autogen. Custom solutions. All of them hit the same wall: the gap between demo and production was massive. The infrastructure to close the learning loop simply didn't exist.

Then the Claude Agent SDK dropped.

---

## What the Claude Agent SDK Changes

The SDK isn't a wrapper around an API. It's Claude Code's entire infrastructure - exposed for developers.

- **Hooks** - inject custom logic before and after any action
- **Guardrails** - stop bad decisions before they execute
- **Human-in-loop** - approve high-risk operations
- **Subagents** - specialized agents coordinated by an orchestrator
- **Persistent memory** - context that survives across sessions

This is production infrastructure. Not a toy.

So I built claudefi: the first autonomous agent that trades across all four major DeFi domains.

---

## The Four Domains

These are the four ways people actually make money in DeFi right now:

**DLMM** (Meteora) - Concentrated liquidity provision. Earns 10-100x more fees than traditional LPs, but requires active management. Perfect for an agent that never sleeps.

**Perps** (Hyperliquid) - Leveraged futures trading. The agent monitors funding rates, identifies trend setups, manages risk religiously. Max 5x leverage. Always with stops.

**Spot** (Jupiter) - Memecoin hunting. Chaos has patterns. Volume spikes, liquidity depth, momentum indicators. Not hunting 1000x moonshots - catching 20-50% moves with quick exits.

**Polymarket** - Prediction markets. Pure information alpha. When the market says 60% and research suggests 80%, the agent bets.

One agent. Four domains. Learning across all of them.

---

## The Ralph Loop

The core is a continuous 30-minute cycle we call the Ralph Loop.

Named after Ralph Wiggum from The Simpsons. Not because he's smart, but because he's relentlessly persistent. No overthinking, no fancy strategies - just show up, analyze, decide, learn, repeat.

```
OBSERVE → THINK → ACT → LEARN → REPEAT
```

Every 30 minutes:
1. **OBSERVE** - Fetch live market data across all domains
2. **THINK** - Claude analyzes opportunities using learned skills
3. **ACT** - Execute validated decisions through the hooks system
4. **LEARN** - Generate skills from outcomes

The agent that runs today is smarter than the one that ran yesterday.

---

## The Skill System

This is where it gets interesting.

After every trade - win or lose - the agent writes a skill file. Not just "trade closed +5%." Actual reasoning:

> "Entered SOL pool at 847% APR. TVL dropped 40% in 2 hours. IL exceeded fees. Lesson: high APR without volume confirmation is a trap."

There are four skill types:

| Type | Trigger | TTL | Purpose |
|------|---------|-----|---------|
| Warning | Loss >10% | 60 days | Prevent similar mistakes |
| Pattern | Win >20% | 90 days | Replicate success |
| Strategy | Every 10 trades | 180 days | Comprehensive playbook |
| Evolved | Merge event | 180 days | Combined wisdom |

These skills load into Claude's context on every cycle. The lessons learned from losses directly influence future decisions.

### Skills Expire

Here's what most learning systems get wrong: they accumulate forever.

A warning learned 90 days ago might not be relevant anymore. Market conditions change. That's why skills have a time-to-live. Warnings last 60 days. Patterns last 90. Strategies last 180.

The agent doesn't just learn. It knows when to forget.

### Skills Merge

Without deduplication, you'd end up with 10 different "avoid low TVL pools" warnings.

When a new skill is about to be created, it's compared against existing skills. If two or more are 70%+ similar, they merge into a single "evolved" skill. Old skills get archived - not deleted - creating an audit trail.

This is how knowledge evolves instead of just piling up.

### Skills Get Pruned

Bad advice is worse than no advice.

Every skill tracks how many times it's been applied and how often those applications succeeded. Skills below 30% effectiveness get excluded from future decisions.

The system actively prunes ineffective guidance.

---

## The Judge

Most learning systems have the pieces but fail to close the loop.

Claudefi has a separate judge agent that evaluates every closed position. It doesn't just ask "did this make money?" - it asks "was this a good decision given the information available?"

The judge scores decisions on six dimensions:
- Timing
- Sizing
- Selection
- Risk management
- Market read
- Execution

Those insights get synthesized and injected into the next decision cycle. We track judge accuracy too - currently around 78% of predictions match outcomes.

This is the critical missing piece. Without it, judge insights get stored but never used.

---

## Cross-Domain Intelligence

The agent doesn't silo knowledge by domain.

Every 10 cycles (5 hours), it analyzes patterns across all four domains. When a pattern succeeds in multiple markets - say, momentum trading works in both perps and spot - it becomes a "general skill" that loads into all decisions.

Requirements for a general skill:
- Appears in 2+ domains
- >55% win rate
- At least 10 samples

This is true cross-pollination of trading wisdom. What works in prediction markets might inform liquidity provision. What fails in perps might warn about spot entries.

---

## Risk Infrastructure

This isn't a demo. The risk management is production-quality.

**Global Drawdown Limit** - Portfolio down 15% from peak? No new positions until recovery. 1-hour cooldown prevents panic thrashing.

**Domain Drawdown Limit** - Domain down 20%? Position sizes cut by 50%.

**Position Cap** - Maximum 3 positions per domain. Concentration kills.

**Confidence Threshold** - Decisions below 60% confidence don't execute.

**Human Approval** - Trades over $500 require manual confirmation.

**Perps Liquidation Monitor** - Checks every 2 minutes with four margin tiers:
- >50%: Safe
- 25-50%: Warning
- 15-25%: Auto-reduce 25%
- <15%: Emergency close

The hooks system makes all of this configurable. Add your own guardrails. Remove the ones you don't want. The infrastructure is there.

---

## The Numbers

**API Costs:**
- Decision making: ~$7.20/day
- Judge evaluation: ~$3.84/day
- Skill generation: ~$1.92/day
- **Total: ~$13/day**

That's less than most signal services. Except this one learns, improves, and you own it completely.

**Cycle Timing:**
- Main loop: every 30 minutes
- Cross-domain analysis: every 5 hours
- Position monitoring: every 5 minutes
- Perps liquidation check: every 2 minutes

---

## Sovereignty

Everything runs locally on your machine.

- Your API keys never leave your computer
- Your wallet keys never touch any server
- There's no cloud, no backend, no "connect wallet"

You clone the repo, add keys to .env, run it. Complete sovereignty over your agent.

---

## Safety First

**Paper trading is ON by default.**

When you first run claudefi, it trades with fake money. Watch it think. Read its reasoning. See what skills it creates. Understand what you're running.

Only when you're ready - and you fully accept the risks - do you flip `PAPER_TRADING=false`.

This is experimental software. AI makes mistakes. Markets are unpredictable. You can lose money. I'm being direct because I want you to take this seriously.

---

## Open Source

100% open source. MIT licensed.

- No token required
- No premium tier
- No waitlist
- No "enterprise sales"

Every line of code. Every prompt. Every skill template. All of it. Free. Forever.

Why? Because the agent era should be open. Because the best skills will come from the community. Because someone reading this will make claudefi better than I ever could.

---

## What's Next

The skills marketplace is coming.

Open source. Free. Community-driven.

You share what works. Others share back. Everyone's agent gets smarter. Your win teaches my agent. My loss warns yours.

Imagine every hard lesson from every trader, available to every agent. Collective intelligence for trading.

That's what we're building toward.

---

## Getting Started

5 minutes:

```bash
git clone https://github.com/claudefi/claudefi
cd claudefi && npm install
cp .env.example .env
npm run db:setup
npm run ralph
```

The agent boots, connects to markets, starts the loop. Paper mode is on. Watch it think.

**Requirements:**
- Anthropic API key (for Claude)
- Supabase account (free tier works)
- Node 18+

That's it for paper trading.

---

18 months of building agents led here.

Claude Agent SDK made it real. Skills make it learn. Open source means we all learn together.

Built for the trenches.

**github.com/claudefi/claudefi**

**@claudefi**
