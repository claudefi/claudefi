# Creating Custom Skills

Custom skills extend claudefi's capabilities with reusable prompts and workflows.

## Skill Structure

A skill is a markdown file in `.claude/skills/user/`:

```markdown
# Skill Name

Brief description of what this skill does.

## Trigger

/command-name

## Arguments

- `arg1` - Description (required)
- `arg2` - Description (optional, default: value)

## Instructions

Detailed instructions for Claude when this skill is invoked.

## Examples

Example usage and expected behavior.
```

## Creating Your First Skill

### 1. Create the File

```bash
mkdir -p .claude/skills/user
touch .claude/skills/user/analyze-pool.md
```

### 2. Write the Skill

```markdown
# Analyze Pool

Deep analysis of a Meteora DLMM pool for potential LP entry.

## Trigger

/analyze-pool

## Arguments

- `address` - Pool address to analyze (required)

## Instructions

When the user invokes /analyze-pool:

1. Fetch pool data using the Meteora API
2. Calculate key metrics:
   - TVL and TVL trend (7d)
   - Volume and volume trend (7d)
   - Fee APR (actual, not projected)
   - Bin step and price range
3. Check for red flags:
   - TVL < $50k
   - Declining volume
   - Single-sided liquidity
   - Whale concentration
4. Provide recommendation:
   - Entry: Yes/No/Wait
   - Suggested position size
   - Recommended bin range
   - Risk level (Low/Medium/High)

## Output Format

## Pool Analysis: {pool_name}

### Metrics
- TVL: $X (↑/↓ Y% 7d)
- Volume 24h: $X
- Fee APR: X%
- Bin Step: X

### Risk Assessment
[Analysis...]

### Recommendation
[Entry recommendation with reasoning]
```

### 3. Use the Skill

```bash
# In Claude Code
/analyze-pool 7qbRF...
```

## Skill Types

### Analysis Skills

Deep-dive on specific data:

```markdown
# Token Analysis

Analyze a token for spot trading.

## Trigger

/analyze-token

## Instructions

1. Fetch token data from Jupiter
2. Check holder distribution
3. Analyze price history
4. Assess liquidity depth
5. Provide buy/pass recommendation
```

### Workflow Skills

Multi-step processes:

```markdown
# Morning Routine

Daily market prep workflow.

## Trigger

/morning

## Instructions

1. Fetch overnight price changes
2. Check funding rates
3. Review open positions
4. Identify top opportunities
5. Generate daily brief
```

### Alert Skills

Monitoring and notifications:

```markdown
# Price Alert

Set a price alert.

## Trigger

/alert

## Arguments

- `asset` - Asset to monitor
- `price` - Target price
- `direction` - above/below

## Instructions

1. Confirm alert parameters
2. Add to monitoring list
3. Send Telegram when triggered
```

### Research Skills

Web search and analysis:

```markdown
# Market Research

Research a market topic.

## Trigger

/research

## Arguments

- `topic` - Topic to research

## Instructions

1. Web search for recent news
2. Find relevant data sources
3. Synthesize findings
4. Provide actionable summary
```

## Best Practices

### Be Specific

```markdown
# Good
When calculating APR, use actual fee data from the last 7 days,
not projected or annualized estimates.

# Bad
Calculate the APR.
```

### Include Examples

```markdown
## Examples

**User:** /analyze-pool 7qbRF...

**Response:**
## Pool Analysis: SOL-USDC

### Metrics
- TVL: $2.4M (↑12% 7d)
- Volume 24h: $850k
...
```

### Define Output Format

```markdown
## Output Format

Always structure the response as:
1. Summary (1-2 sentences)
2. Key Metrics (bullet points)
3. Analysis (2-3 paragraphs)
4. Recommendation (action + reasoning)
```

### Handle Edge Cases

```markdown
## Edge Cases

If the pool doesn't exist:
- Return "Pool not found: {address}"

If data is stale (>1 hour old):
- Warn user about data freshness
- Proceed with available data
```

## Advanced Features

### Tool Integration

Reference available tools:

```markdown
## Instructions

Use these tools:
- `fetch_pools` - Get pool data
- `get_positions` - Check existing positions
- `web_search` - Research market context
```

### Conditional Logic

```markdown
## Instructions

If TVL > $1M:
  - Full analysis with all metrics
  - Historical comparison

If TVL < $1M:
  - Basic analysis only
  - Add low-liquidity warning
```

### Multi-Domain Skills

```markdown
## Instructions

1. Check DLMM positions for the token
2. Check Perps funding rates
3. Check Spot holdings
4. Aggregate exposure across domains
```

## Sharing Skills

### Export

```bash
# Copy skill to share
cp .claude/skills/user/my-skill.md ~/Desktop/my-skill.md
```

### Import

```bash
# Add community skill
cp ~/Downloads/cool-skill.md .claude/skills/user/
```

### Community Skills

Share your skills with the community via GitHub:

1. Fork the claudefi repo
2. Add your skill to `skills/your-skill-name/`
3. Follow the [SKILL.md format](https://github.com/anthropics/skills)
4. Open a pull request

See [skills/CONTRIBUTING.md](https://github.com/claudefi/claudefi/tree/main/skills/CONTRIBUTING.md) for guidelines.

### Paid Skills *(Coming Soon)*

Monetize your trading strategies:

| Feature | Description |
|---------|-------------|
| **Premium Skills** | Sell your best strategies to other traders |
| **Revenue Sharing** | Earn from skill purchases and usage |
| **Creator Dashboard** | Track downloads, earnings, and feedback |

**Interested in being an early creator?** Open an issue on GitHub to discuss.

### Skills Marketplace

Coming soon: Install skills directly from the marketplace.

```bash
# Future feature
claudefi skills install @author/skill-name
```

## Debugging Skills

### Test Invocation

```bash
# Test in Claude Code
/my-skill test-argument
```

### Check Loading

```bash
# List loaded skills
ls -la .claude/skills/user/
```

### View Logs

Skills usage is logged in the database for debugging.

## Related Documentation

- [Skills Overview](./overview.md) - System introduction
- [Reflections](./generation.md) - Auto-generated skills
- [Hooks System](../hooks/overview.md) - Event middleware
