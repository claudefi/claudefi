# Contributing to claudefi

thanks for wanting to contribute. here's how to help.

## ways to contribute

### 1. share skills

skills are the highest-impact contribution. they teach the agent new strategies.

```bash
# create a new skill
claudefi skill create my-strategy

# test it
claudefi skill test my-strategy

# submit it
# open a PR with your skill in .claude/skills/
```

good skills are:
- **specific** - one clear strategy, not general advice
- **actionable** - tells the agent what to do, not just what to think about
- **tested** - you've run it and it works

### 2. fix bugs

1. check [issues](https://github.com/claudefi/claudefi/issues)
2. comment that you're working on it
3. fork, fix, PR

### 3. add features

bigger features need discussion first:
1. open an issue describing what you want to build
2. wait for feedback
3. implement

### 4. improve docs

docs live in `/docs`. run locally with:

```bash
npm run docs:dev
```

## development setup

```bash
# clone
git clone https://github.com/claudefi/claudefi
cd claudefi

# install (bun or npm)
bun install
# or
npm install

# setup env
cp .env.example .env
# add your ANTHROPIC_API_KEY

# run tests
npm test

# run a single cycle
npm run cycle

# start the full loop
npm run ralph
```

## code style

- typescript everywhere
- lowercase for user-facing text
- short functions, clear names
- no unnecessary abstractions

## commit messages

```
fix: handle rate limits in hyperliquid client
feat: add momentum detection to spot domain
docs: update memory system explanation
```

## pull requests

1. one feature/fix per PR
2. include tests if applicable
3. update docs if behavior changes
4. wait for CI to pass

## questions?

- [discord](https://discord.gg/nzW8srS9)
- [issues](https://github.com/claudefi/claudefi/issues)

## license

by contributing, you agree that your contributions will be licensed under MIT.
