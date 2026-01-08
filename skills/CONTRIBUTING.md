# Contributing Community Skills

Thank you for contributing to Claudefi's skill ecosystem!

## Skill Structure

Skills must follow the [Claude Code skill format](https://code.claude.com/docs/en/skills):

```
your-skill-name/
├── SKILL.md            # Required: Main skill prompt
├── scripts/            # Optional: Helper scripts
│   └── helper.sh
├── references/         # Optional: Reference docs
│   └── api-docs.md
└── assets/             # Optional: Data files, images
    └── config.json
```

## SKILL.md Format

```markdown
# Skill Name

One-line description of what this skill does.

## When to Use

Describe when Claude should use this skill.

## How It Works

Step-by-step instructions for Claude.

## Commands

- `/skill-name action` - What this does
- `/skill-name --help` - Show help

## Configuration

Any required environment variables or setup.
```

## Submission Process

### Option 1: Pull Request (Recommended)

1. Fork this repository
2. Create your skill in `community-skills/your-skill-name/`
3. Test your skill locally
4. Open a pull request with:
   - Clear description of what the skill does
   - Example usage
   - Any dependencies or requirements

### Option 2: Issue Submission

1. Open an issue with the `skill-submission` label
2. Include:
   - Skill name and description
   - Your SKILL.md content
   - Any additional files (scripts, references)

## Review Criteria

Skills are reviewed for:

1. **Usefulness** - Does it solve a real trading problem?
2. **Safety** - No harmful or risky operations
3. **Quality** - Clear instructions, good documentation
4. **Originality** - Not duplicating existing skills

## Guidelines

### Do

- Focus on one specific capability per skill
- Include clear examples and use cases
- Document any API keys or configuration needed
- Test your skill before submitting

### Don't

- Include sensitive data or credentials
- Create skills that bypass safety measures
- Submit skills that could lead to significant losses
- Copy skills from other projects without attribution

## Skill Ideas

Looking for inspiration? Here are some ideas:

- **News sentiment analysis** - Analyze crypto news for trading signals
- **On-chain analytics** - Whale tracking, smart money flows
- **Technical indicators** - Custom indicator combinations
- **Cross-exchange arbitrage** - Identify arbitrage opportunities
- **Portfolio rebalancing** - Automated rebalancing strategies
- **Risk analytics** - VaR calculations, drawdown analysis

## Questions?

Open an issue or start a discussion. We're happy to help!
