---
layout: home

hero:
  name: claudefi
  text: autonomous defi trading agent
  tagline: self-improving trading powered by claude agent sdk
  actions:
    - theme: brand
      text: get started
      link: /getting-started/quick-start
    - theme: alt
      text: view on github
      link: https://github.com/claudefi/claudefi

features:
  - title: self-improving
    details: learns from every trade. wins become patterns, losses become warnings. skills evolve over time.
  - title: 4 trading domains
    details: dlmm liquidity provision, perpetual futures, spot memecoins, and prediction markets.
  - title: risk controls
    details: multiple layers of validation - position limits, drawdown guards, confidence thresholds.
  - title: claude agent sdk
    details: multi-turn tool conversations for complex decision-making with full context.
  - title: mcp server
    details: custom model context protocol server exposing domain-specific trading tools.
  - title: hooks system
    details: event-driven middleware for validation, logging, and custom guard rails.
---

## how it works

```
trade → outcome → analysis → skill → better future trades
           ↑                    │
           └────────────────────┘
              feedback loop
```

claudefi runs a continuous 30-minute decision cycle called the **ralph loop**:

1. **observe** - fetch live market data across all domains
2. **think** - claude analyzes opportunities with learned skills
3. **act** - execute validated decisions through hooks
4. **learn** - generate skills from outcomes

## quick start

```bash
# clone
git clone https://github.com/claudefi/claudefi
cd claudefi

# install & configure
npm install
cp .env.example .env
# add your ANTHROPIC_API_KEY

# run (paper trading)
npm run ralph
```

## trading domains

| domain | platform | strategy |
|--------|----------|----------|
| **dlmm** | meteora | concentrated liquidity provision |
| **perps** | hyperliquid | rsi-based futures trading |
| **spot** | jupiter | memecoin trend trading |
| **polymarket** | gamma api | probability edge detection |

## cost estimation

| component | per cycle | daily (48 cycles) |
|-----------|-----------|-------------------|
| decision making | ~$0.15 | ~$7.20 |
| judge evaluation | ~$0.08 | ~$3.84 |
| skill generation | ~$0.04 | ~$1.92 |
| **total** | **~$0.27** | **~$13** |

<style>
:root {
  --vp-home-hero-name-color: #fff;
  --vp-home-hero-name-background: none;
}

.VPHero {
  position: relative;
}

.VPHero::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 50%;
  background-image: url('/bg-agent.png');
  background-size: cover;
  background-position: center right;
  opacity: 0.15;
  pointer-events: none;
  z-index: 0;
}

.VPHero .container {
  position: relative;
  z-index: 1;
}

.VPHome .VPHero .name {
  font-weight: 400;
  text-transform: lowercase;
}

.VPHome .VPHero .text {
  text-transform: lowercase;
}

.VPHome .VPHero .tagline {
  text-transform: lowercase;
}

.VPFeature .title {
  text-transform: lowercase;
}
</style>
