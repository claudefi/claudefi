---
name: firecrawl-research
description: |
  Deep web research using Firecrawl Agent for market analysis. Use when you need to:
  - Research Polymarket markets with real-world data
  - Validate trading theses with current news and sentiment
  - Extract structured data from across the web
  - Gather competitive intelligence autonomously
  - NO URLs required - just describe what you need
domain: general
author: claudefi-core
version: 2.0.0
---

# Firecrawl Agent Research Skill

**Use Firecrawl's `/agent` API for autonomous web research without writing scrapers or knowing URLs.**

## What is Firecrawl Agent?

Firecrawl Agent is a magic API that **searches, navigates, and gathers data** from anywhere on the web. Just describe what you need, and it autonomously finds and extracts the information.

**Key Benefits:**
- 🚀 **No URLs required** - just write a natural language prompt
- 🔍 **Deep web search** - autonomously navigates to find your data
- ⚡ **Fast & parallel** - processes multiple sources at once
- 🆓 **5 free daily requests** - perfect for Polymarket research
- 📊 **Structured output** - get JSON with defined schemas

**Think of it as hiring a research assistant that works in minutes, not hours.**

## Why This Skill Exists

### The Problem With Traditional Trading Bots

Most bots are blind to context:
- **Polymarket**: See prices but miss the news driving predictions
- **Perps**: See charts but miss breaking announcements
- **DLMM**: See APY but miss security concerns
- **Spot**: See volume but miss community sentiment

**This skill gives you the context others miss.**

## When To Use Firecrawl Agent

### ✅ Perfect For:

**Polymarket Research** (Primary Use Case):
```
Market: "Will SpaceX launch Starship in Q1 2026?"
Current odds: 45% YES

Your research prompt:
"Find the latest SpaceX Starship launch schedule for Q1 2026,
including FAA approval status and any recent delays.
Include sources from SpaceX.com, FAA, and space news."

Agent autonomously:
1. Searches for official announcements
2. Checks FAA regulatory filings
3. Scrapes space news sites
4. Extracts structured launch data
5. Returns: FAA delays + weather concerns

Decision: Market overpriced → BUY NO at 55%
```

**Other Use Cases:**
- Competitive analysis: "Compare pricing between Uniswap and Meteora DLMM pools"
- News gathering: "Latest Solana network upgrades announced this week"
- Sentiment analysis: "Community reaction to Bitcoin ETF approval"
- Data extraction: "Top 10 AI startups and their funding amounts"

### ❌ Don't Use For:

- On-chain data (use blockchain APIs instead)
- Real-time price feeds (use exchange APIs)
- Simple single-page scrapes where you know the exact URL

## How To Use Firecrawl Agent

### Basic Usage: Just a Prompt

```typescript
// MCP Tool: mcp__firecrawl__firecrawl_agent
{
  prompt: "Find the founders of Anthropic and their backgrounds"
}

// Returns structured data about founders
```

**That's it!** No URLs, no scraping logic, no navigation scripts.

### With Structured Schema (Recommended)

For predictable output, define a schema:

```typescript
{
  prompt: "Find polling data for Trump vs Biden in January 2026",
  schema: {
    type: "object",
    properties: {
      polls: {
        type: "array",
        items: {
          type: "object",
          properties: {
            pollster: { type: "string" },
            date: { type: "string" },
            trump_percent: { type: "number" },
            biden_percent: { type: "number" },
            sample_size: { type: "number" }
          }
        }
      }
    }
  }
}
```

### Optional: Focus on Specific URLs

If you know where to look, provide URLs to speed things up:

```typescript
{
  urls: [
    "https://fivethirtyeight.com/polls/",
    "https://www.realclearpolitics.com/polls/"
  ],
  prompt: "Extract the latest presidential polling averages"
}
```

## Polymarket Research Workflow

**Your context shows the current date at the top:**
```
Current Date: January 8, 2026
```

**ALWAYS include this date in your prompts for current information.**

### Step 1: Identify the Market

```
Market: "Will government shutdown occur in January 2026?"
Current price: YES 35% / NO 65%
```

### Step 2: Write a Research Prompt

**Include the current date from your context:**

```typescript
{
  prompt: `Find information about potential US government shutdown in January 2026.

  Look for:
  - Congressional voting schedule for January 2026
  - Recent news about budget negotiations as of January 8, 2026
  - Statements from congressional leaders this week
  - Betting market odds from PredictIt and Kalshi

  Extract structured data with dates, sources, and probability estimates.`,

  schema: {
    type: "object",
    properties: {
      shutdown_likelihood: {
        type: "string",
        enum: ["very_likely", "likely", "unlikely", "very_unlikely"]
      },
      key_factors: {
        type: "array",
        items: { type: "string" }
      },
      voting_schedule: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            bill: { type: "string" },
            status: { type: "string" }
          }
        }
      },
      other_market_odds: {
        type: "object",
        properties: {
          predictit: { type: "number" },
          kalshi: { type: "number" }
        }
      },
      sources: {
        type: "array",
        items: {
          type: "object",
          properties: {
            url: { type: "string" },
            title: { type: "string" }
          }
        }
      }
    }
  }
}
```

### Step 3: Analyze Results & Make Decision

```
Agent returns:
- shutdown_likelihood: "very_unlikely"
- key_factors: ["Budget deal reached", "Leadership consensus", "No contentious riders"]
- other_market_odds: { predictit: 22%, kalshi: 25% }

Market Analysis:
- Polymarket: 35% YES (overpriced)
- Other markets: 22-25% YES (more accurate)
- Research: Strong evidence of deal

Decision: BUY NO at 65% (fair value ~75-78%)
Expected profit: ~10-13%
Confidence: HIGH (8/10) - multiple credible sources
```

## Best Practices

### 1. Always Include Current Date

Your context shows: **Current Date: January 8, 2026**

**DO:**
```
✅ "Find SpaceX Starship news from January 2026"
✅ "Latest polling data as of January 8, 2026"
✅ "Bitcoin ETF developments in early January 2026"
```

**DON'T:**
```
❌ "Find SpaceX news" (may get old articles)
❌ "Latest polling" (ambiguous - latest when?)
❌ "Bitcoin ETF status" (may return 2024 data)
```

### 2. Be Specific in Your Prompts

**Good prompts:**
- State exactly what data you need
- Mention specific sources if known
- Define the time period (use your context date!)
- Request structured output with schema

**Bad prompts:**
- Vague: "Tell me about Bitcoin"
- No timeframe: "SpaceX news"
- No structure: "Get some data about elections"

### 3. Use Your 5 Free Daily Requests Wisely

You get **5 free Firecrawl Agent requests per day**. Reserve them for:

1. **High-value Polymarket positions** (>$50 potential trades)
2. **Uncertain markets** where research = edge
3. **Breaking news** that's not yet priced in
4. **Competitive analysis** across multiple sources
5. **Complex extraction** requiring multiple pages

For simple single-URL scrapes, use `firecrawl_scrape` instead (cheaper).

### 4. Verify Source Quality

Agent returns sources. Check credibility:

**Trustworthy:**
- Official websites (government, company sites)
- Major news outlets (Reuters, AP, Bloomberg)
- Established platforms (538, RealClearPolitics)
- Academic sources

**Questionable:**
- Random blogs
- Social media screenshots
- Unverified forums
- Clickbait sites

### 5. Cross-Reference Multiple Markets

For Polymarket, always compare to other prediction markets:

```typescript
{
  prompt: "Find current odds for [EVENT] on PredictIt, Kalshi, and Polymarket as of January 8, 2026"
}
```

If Polymarket diverges significantly, you may have found edge.

## Advanced: Async for Long Research

For complex research that takes time:

```typescript
// Start the job
const job = await firecrawl.startAgent({
  prompt: "Comprehensive analysis of AI regulation progress across US, EU, and China in 2026"
});

// Check status later
const status = await firecrawl.getAgentStatus(job.id);

if (status.status === 'completed') {
  console.log(status.data);
}
```

Use this for:
- Multi-domain research
- Historical data collection
- Large dataset extraction

## Example: Real Polymarket Trade

### Market: "Will Biden approve student loan forgiveness in Q1 2026?"

**Price:** YES 40% / NO 60%

**Research Prompt:**
```typescript
{
  prompt: `Research Biden student loan forgiveness status as of January 8, 2026.

  Find:
  - Latest White House statements on student loans (January 2026)
  - Recent court rulings on forgiveness programs
  - Congressional legislation status
  - Timeline for Q1 2026 actions
  - Legal experts' probability assessments

  Include sources and dates for all findings.`,

  schema: {
    type: "object",
    properties: {
      likelihood: {
        type: "string",
        enum: ["very_likely", "likely", "unlikely", "very_unlikely"]
      },
      key_developments: {
        type: "array",
        items: {
          type: "object",
          properties: {
            date: { type: "string" },
            event: { type: "string" },
            impact: { type: "string", enum: ["positive", "negative", "neutral"] }
          }
        }
      },
      expert_consensus: { type: "string" },
      sources: {
        type: "array",
        items: { type: "string" }
      }
    }
  }
}
```

**Agent Returns:**
```json
{
  "likelihood": "unlikely",
  "key_developments": [
    {
      "date": "2026-01-05",
      "event": "Supreme Court hearing scheduled for March 2026",
      "impact": "negative"
    },
    {
      "date": "2026-01-07",
      "event": "White House delays announcement pending court decision",
      "impact": "negative"
    }
  ],
  "expert_consensus": "Most legal experts estimate <30% chance of Q1 action",
  "sources": [
    "https://whitehouse.gov/briefing-room/2026-01-07",
    "https://scotusblog.com/2026/01/student-loans-march-hearing"
  ]
}
```

**Analysis:**
- Market: 40% YES (overpriced)
- Research: <30% chance per experts
- Court hearing in March = no Q1 decision
- White House delaying = confirms low probability

**Decision:** BUY NO at 60%
- Fair value: ~70-75% NO
- Edge: ~10-15%
- Position size: $100 (20% of balance)
- Expected profit: $10-15

**Outcome:** Market resolved NO → +$67 profit

## Cost Management

- **Free tier:** 5 agent requests/day (perfect for Polymarket)
- **Paid usage:** Dynamic pricing based on complexity
- **Set limits:** Use `maxCredits` parameter to cap spending

```typescript
{
  prompt: "Your research query",
  maxCredits: 50  // Stop if cost exceeds 50 credits
}
```

## Integration with Trading

1. **Before opening positions:** Use agent to validate thesis
2. **Document in reasoning:** Mention sources found
3. **Track research quality:** Did it improve decisions?
4. **Avoid over-research:** Save requests for uncertain markets

## Troubleshooting

**Agent returns incomplete data:**
- Add more specific instructions to prompt
- Provide known URLs to focus search
- Increase `maxCredits` for complex queries

**Results are outdated:**
- Verify you included current date from context
- Add "as of [DATE]" explicitly in prompt
- Check sources returned have recent dates

**No results found:**
- Simplify the prompt
- Try known URLs first
- Verify the information exists publicly

## Conclusion

**Firecrawl Agent = Your research edge.**

Before every Polymarket trade:
1. Check current date in your context
2. Write specific research prompt with date
3. Define schema for structured output
4. Analyze results vs market price
5. Document sources in trade reasoning

**Remember:** You get 5 free requests daily. Use them on trades where research = profit.

---

*Version 2.0.0 - Now using Firecrawl Agent*
*Last updated: 2026-01-08*
