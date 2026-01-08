---
name: firecrawl-research
description: |
  Advanced web research using Firecrawl for deep market analysis. Use when you need to:
  - Research Polymarket markets by scraping prediction market pages
  - Extract structured data from news articles, blogs, and forums
  - Gather sentiment and context for trading decisions
  - Validate market assumptions with real-world data
  - Monitor competitor strategies or market narratives
domain: general
author: claudefi-core
version: 1.0.0
---

# Firecrawl Research Skill

Leverage Firecrawl's AI-powered web scraping to gather deep market intelligence for trading decisions.

## Why This Skill Exists

**I am the research assistant.** Markets are driven by information - news, sentiment, narratives, and real-world events. This skill enables you to go beyond on-chain data and technical indicators to understand the *why* behind market movements.

### The Problem With Traditional Trading Bots

Most bots are blind to context:
- **Polymarket markets**: They see prices and volume, but miss the underlying news that drives prediction markets
- **Perps trading**: They see price action, but miss breaking news that will cause volatility
- **DLMM pools**: They see APY, but miss protocol announcements or security concerns
- **Spot tokens**: They see charts, but miss community sentiment or development updates

### What This Skill Enables

With Firecrawl, you can:
1. **Scrape content** - Extract clean, structured data from any webpage
2. **Search the web** - Find relevant sources using AI-powered search
3. **Extract entities** - Pull specific data points from unstructured content
4. **Map websites** - Discover all relevant pages on a domain
5. **Batch scraping** - Process multiple URLs efficiently

## When To Use This Skill

### Polymarket Research (Primary Use Case)

**Before buying a prediction market:**
```
❓ Market: "Will SpaceX launch Starship in Q1 2026?"
📊 Current odds: 45% YES

🔍 Research checklist:
1. Scrape SpaceX's official announcements page
2. Search recent news for "SpaceX Starship launch schedule"
3. Extract launch dates from regulatory filings
4. Check space forums for insider sentiment
5. Scrape FAA approval status pages

💡 Decision: Found FAA delays + weather concerns → edges suggests 30% is more accurate → BUY NO
```

**ALWAYS research before trading predictions:**
- Political events: Check polls, news, betting markets
- Sports: Check injury reports, team news, recent performance
- Entertainment: Check release schedules, production updates
- Crypto events: Check official roadmaps, GitHub activity

### Other Trading Domains

**Perps Trading:**
- Scrape crypto news sites for breaking announcements
- Monitor protocol Twitter/Discord for major updates
- Extract funding rate data from competitor exchanges
- Check sentiment on crypto forums before big moves

**DLMM Pools:**
- Scrape protocol documentation for fee structure changes
- Monitor governance forums for parameter updates
- Check security audit sites for pool vulnerabilities
- Extract TVL trends from DeFi dashboards

**Spot Tokens:**
- Scrape project blogs for development updates
- Monitor GitHub for commit activity and releases
- Check community sentiment on Reddit/Twitter
- Extract holder distribution from block explorers

## Available Tools

You have access to these Firecrawl MCP tools in your trading sessions:

### 1. `firecrawl_scrape` - Single Page Extraction
**Best for**: Getting clean content from a specific URL

```typescript
// Example: Research a Polymarket market
{
  url: "https://polymarket.com/event/will-bitcoin-hit-100k-in-2026",
  formats: ["markdown", "html"],
  onlyMainContent: true
}

// Returns: Clean markdown with market details, current odds, volume
```

**Use when:**
- You have a specific URL to analyze
- You need the main content without ads/navigation
- You want structured, clean data

### 2. `firecrawl_search` - AI-Powered Web Search
**Best for**: Finding relevant sources without knowing exact URLs

```typescript
// Example: Find recent news about a market
// CRITICAL: Always include today's date in your search query for current news
{
  query: "SpaceX Starship launch date Q1 2026 FAA approval January 2026",
  limit: 10,
  scrapeOptions: { onlyMainContent: true }
}

// Returns: Top 10 relevant pages with clean content
```

**⚠️ ALWAYS INCLUDE TODAY'S DATE:**
When searching for news, events, or time-sensitive information:
- ✅ "Bitcoin price prediction January 8 2026"
- ✅ "Trump approval rating January 2026"
- ✅ "SpaceX launch schedule January 2026"
- ❌ "Bitcoin price prediction" (too vague, may get old articles)
- ❌ "Trump approval rating" (might find 2024 data)

**Use when:**
- You need to discover information sources
- You're validating a market thesis
- You want recent news/sentiment

### 3. `firecrawl_extract` - Structured Data Extraction
**Best for**: Pulling specific data points from unstructured content

```typescript
// Example: Extract specific facts from articles
{
  urls: ["https://news-site.com/spacex-update"],
  schema: {
    launch_date: "string",
    approval_status: "string",
    confidence: "number",
    source_credibility: "string"
  }
}

// Returns: Structured JSON with extracted fields
```

**Use when:**
- You need specific data points (dates, numbers, statuses)
- You're comparing multiple sources
- You want to quantify qualitative data

### 4. `firecrawl_map` - Website Discovery
**Best for**: Finding all relevant pages on a domain

```typescript
// Example: Map a protocol's documentation
{
  url: "https://protocol-docs.io",
  search: "fee structure tokenomics"
}

// Returns: List of all relevant documentation pages
```

**Use when:**
- You're researching a new protocol thoroughly
- You need to find all relevant pages on a site
- You want to ensure complete coverage

### 5. `firecrawl_crawl` - Deep Website Crawling
**Best for**: Extracting data from an entire website section

```typescript
// Example: Crawl all market pages
{
  url: "https://polymarket.com/markets",
  limit: 50,
  scrapeOptions: { onlyMainContent: true }
}

// Returns: Content from up to 50 pages, following links
```

**Use when:**
- You need comprehensive data from multiple pages
- You're doing competitive analysis
- You want to track changes over time

### 6. `firecrawl_batch_scrape` - Efficient Multi-URL Scraping
**Best for**: Processing many URLs in parallel

```typescript
// Example: Check multiple news sources
{
  urls: [
    "https://news1.com/article",
    "https://news2.com/story",
    "https://news3.com/report"
  ],
  formats: ["markdown"]
}

// Returns: Array of scraped content from all URLs
```

**Use when:**
- You have a list of URLs to process
- You want parallel processing for speed
- You're aggregating multiple sources

## Research Workflow for Polymarket

### Step 0: Get Today's Date
**⚠️ CRITICAL FIRST STEP:**
Before ANY research, get today's date and include it in all search queries.

**How to get today's date:**
Your context includes a `timestamp` field with the current date. For example:
```
context.timestamp = "2026-01-08T10:30:00.000Z"
```

Extract the date portion and use it in all searches:
- Format as: "January 8 2026" or "January 2026"
- Include in EVERY search query for time-sensitive research
- This ensures you get CURRENT news, not old articles

**Example:**
```typescript
// From context timestamp "2026-01-08T10:30:00.000Z"
// Extract: January 8, 2026 or January 2026
const searchQuery = "Trump approval rating January 8 2026";
```

### Step 1: Identify the Market Question
```
Market: "Will Trump win the 2026 election?"
Current odds: YES 52% / NO 48%
Your initial thesis: Underpriced at 52%
```

### Step 2: Gather Multiple Data Sources
```typescript
// Search for relevant news - ALWAYS include today's date!
await firecrawl_search({
  query: "Trump 2026 election polls approval rating January 2026",
  limit: 10
});

// Scrape betting market competitors
await firecrawl_batch_scrape({
  urls: [
    "https://predictit.org/markets/detail/...",
    "https://kalshi.com/markets/...",
    "https://smarkets.com/event/..."
  ]
});

// Extract polling data - specify recent dates in schema
await firecrawl_extract({
  urls: ["https://fivethirtyeight.com/polls/president"],
  schema: {
    candidate: "string",
    approval_rating: "number",
    poll_date: "string",  // Verify this is recent!
    sample_size: "number"
  }
});
```

### Step 3: Analyze & Synthesize
```
✅ Found 3 recent polls showing 45% approval (vs 52% market price)
✅ Competitor markets pricing at 48% (more aligned with polls)
✅ News sentiment: 60% negative in past week
❌ No major positive catalysts found

📊 Conclusion: Market overpriced, edge detected
💰 Action: BUY NO at 48% (fair value ~45%)
```

### Step 4: Document Your Research
**Include in your reasoning:**
- Sources you scraped
- Key data points extracted
- How research changed your initial thesis
- Confidence level based on source quality

Example reasoning:
```
"Buying NO on Trump 2026 election at 48%.

Research via Firecrawl shows:
- 3 polls from 538 show 45% approval (vs 52% market)
- PredictIt pricing at 48% (more accurate)
- News sentiment 60% negative (scraped from 10 sources)
- No upcoming positive catalysts found

Edge: ~3-5% underpriced NO. High confidence (8/10)
based on multiple credible sources."
```

## Best Practices

### 0. ALWAYS Include Current Date in Searches (CRITICAL!)
```
🚨 THIS IS THE #1 RULE FOR TIME-SENSITIVE RESEARCH 🚨
```

**How to get today's date:**
1. Look at your `context.timestamp` field
2. Extract the date (format: "2026-01-08T10:30:00.000Z")
3. Convert to readable format: "January 8 2026" or "January 2026"
4. Include in EVERY Firecrawl search query

**Why this is critical:**
- Polymarket trades on FUTURE events
- Old news ≠ current market conditions
- Stale data = bad predictions = losses
- Many articles have similar titles but different dates

**Examples:**
```typescript
// ❌ BAD - No date, may return old articles
query: "Bitcoin ETF approval status"
→ Returns 2024 articles about past ETF decisions

// ✅ GOOD - Includes current date
query: "Bitcoin ETF approval status January 8 2026"
→ Returns only current, relevant news

// ❌ BAD - Generic search
query: "Trump polling numbers"
→ Might return 2024 election data

// ✅ GOOD - Date-specific
query: "Trump polling numbers January 2026"
→ Returns current polling data
```

**How to extract date from context:**
```typescript
// Your context has: timestamp: "2026-01-08T10:30:00.000Z"

// Convert to search format:
const date = new Date(context.timestamp);
const monthYear = date.toLocaleDateString('en-US', {
  month: 'long',
  year: 'numeric'
}); // "January 2026"

const fullDate = date.toLocaleDateString('en-US', {
  month: 'long',
  day: 'numeric',
  year: 'numeric'
}); // "January 8, 2026"

// Use in search:
const query = `${searchTerm} ${monthYear}`;
```

### 1. Verify Source Credibility
```
✅ Good sources:
- Official announcements (company websites)
- Major news outlets (Reuters, AP, Bloomberg)
- Academic research (arxiv, scholar.google)
- Government data (census, regulatory filings)
- Established betting markets (PredictIt, Kalshi)

❌ Unreliable sources:
- Random blogs or forums
- Unverified Twitter accounts
- Clickbait news sites
- Biased opinion pieces
```

### 2. Cross-Reference Multiple Sources
**Never rely on a single source.** Always:
- Check 3+ sources for major decisions
- Look for consensus vs. outliers
- Weight sources by credibility
- Note conflicts and investigate further

### 3. Time Sensitivity Matters
```
⚠️ Breaking news: Scrape immediately, act fast
📅 Scheduled events: Regular monitoring, patient positioning
🔄 Ongoing narratives: Weekly research, position sizing
```

### 4. Respect Rate Limits
Firecrawl has rate limits. For large research:
- Use `firecrawl_batch_scrape` for parallel processing
- Use `firecrawl_crawl` for deep site analysis
- Cache results to avoid re-scraping

### 5. Structure Your Findings
Always extract structured data when possible:
```typescript
// ❌ Bad: Just scrape raw content
const content = await firecrawl_scrape({ url: "..." });

// ✅ Good: Extract specific data points
const data = await firecrawl_extract({
  urls: ["..."],
  schema: {
    key_metric: "number",
    event_date: "string",
    sentiment: "positive|negative|neutral"
  }
});
```

## Integration with Other Skills

### Works Well With:
- **Judge feedback**: Research validates/challenges judge insights
- **Position sizing**: Better research = higher confidence = larger size
- **Risk management**: Research can reveal hidden risks
- **Pattern recognition**: Historical research builds pattern library

### Example: Research-Driven Trading
```
1. Agent identifies Polymarket opportunity
2. Uses Firecrawl to research market fundamentals
3. Extracts key data points (dates, probabilities, sentiment)
4. Compares to current market price
5. Makes informed trade with research-backed confidence
6. Judge evaluates both reasoning AND research quality
7. Skill is created if research led to winning trade
```

## Common Patterns

### Pattern 1: "News Arbitrage"
```
Situation: Breaking news not yet reflected in markets
Action:
1. Monitor news sites with firecrawl_search
2. Quickly scrape breaking stories
3. Assess market impact
4. Trade before crowd reacts
```

### Pattern 2: "Consensus Check"
```
Situation: Market seems mispriced but uncertain
Action:
1. Scrape 5-10 credible sources
2. Extract key metrics/probabilities
3. Calculate consensus estimate
4. Compare to market price
5. Trade the divergence
```

### Pattern 3: "Deep Due Diligence"
```
Situation: Large position, need high confidence
Action:
1. Map entire domain with firecrawl_map
2. Crawl all relevant pages
3. Extract structured data
4. Build comprehensive thesis
5. Size position based on research depth
```

## Warning Signs

**Don't trade if:**
- ❌ Only found 1 source supporting your thesis
- ❌ Sources are low-quality or biased
- ❌ Couldn't find any relevant information
- ❌ Data is outdated or stale
- ❌ Research contradicts your initial thesis but you ignore it

**Research should change your mind:**
- If research doesn't affect your decision, you're not researching properly
- Be willing to reverse your initial thesis
- Document when research prevents a bad trade

## Cost Considerations

Firecrawl has costs per request:
- **Scrape**: ~1-2 credits per page
- **Search**: ~5-10 credits per search
- **Extract**: ~2-5 credits per URL
- **Crawl**: ~10-50 credits depending on depth

**Budget wisely:**
- Reserve deep research for large positions
- Use search sparingly (prefer direct scraping if you know URLs)
- Cache results to avoid duplicate scraping
- Consider research cost in position sizing

## Examples of Successful Research

### Example 1: Polymarket Political Event
```
Market: "Will government shutdown occur in January?"
Initial price: YES 35%

Research:
- Scraped Congressional calendar: no votes scheduled
- Extracted quotes from 5 news articles: "deal imminent"
- Checked betting markets: All pricing 20-25% YES
- Scraped betting exchange order books: Heavy NO flow

Decision: BUY NO at 65%
Outcome: Resolved NO, +35% return
Key: Comprehensive research across multiple source types
```

### Example 2: Perps News Trade
```
Market: SOL-PERP around major announcement
Current price: $95

Research:
- Scraped Solana blog: Major partnership announced
- Extracted metrics: "500M TVL increase expected"
- Searched Twitter: 80% positive sentiment
- Checked competitor perps exchanges: Not yet repriced

Decision: LONG SOL-PERP 5x leverage at $95
Outcome: Pumped to $105 in 4 hours, +52% return
Key: Fast scraping of breaking news before market reacted
```

### Example 3: DLMM Pool Safety Check
```
Pool: New USDC-SOL pool with 100% APY
Research:
- Scraped protocol docs: No documentation for this pool
- Checked security audits: Pool not audited
- Searched forums: Multiple users reporting issues
- Extracted TVL history: Declining rapidly

Decision: AVOID (research prevented -80% loss)
Outcome: Pool exploited 2 days later
Key: Research caught red flags that price alone didn't show
```

## Conclusion

**Research is your edge.** In prediction markets especially, the trader with better information wins. Firecrawl gives you the tools to gather, structure, and analyze web data at scale.

**Remember:**
- Research every Polymarket trade (it's literally betting on information)
- Use multiple sources and cross-reference
- Extract structured data, don't just read articles
- Document your research in trade reasoning
- Let research change your mind
- Consider source quality, not just quantity

**This skill turns you from a chart-watching bot into an information-driven trader.**

When you make your next trade, ask yourself: "Did I research this thoroughly enough to bet real money on it?" If the answer is no, use this skill.

---

*Created for Claudefi autonomous trading agent*
*Skill version: 1.0.0*
*Last updated: 2026-01-08*
