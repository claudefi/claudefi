# Terminal User Interface (TUI)

claudefi includes a rich terminal dashboard built with [Ink](https://github.com/vadimdemedes/ink) (React for the terminal).

## Starting the TUI

```bash
npm run tui
```

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────┐
│                     claudefi v1.0.0                         │
│                    Mode: PAPER | Cycle: 30m                 │
├─────────────────────────────┬───────────────────────────────┤
│     POSITIONS               │       AGENT ACTIVITY          │
│                             │                               │
│  Domain   │ Target │ P&L    │  [DLMM] Analyzing pools...   │
│  ─────────┼────────┼─────   │  [Perps] Checking exits...   │
│  dlmm     │ SOL/US │ +$45   │  [Spot] Scanning tokens...   │
│  perps    │ BTC-PE │ -$12   │  [Poly] Research complete    │
│                             │                               │
├─────────────────────────────┼───────────────────────────────┤
│      SKILLS                 │       MARKET DATA             │
│                             │                               │
│  18 active skills           │  BTC: $97,450  ▲ 2.3%       │
│  - 5 warnings               │  ETH: $3,420   ▼ 0.8%       │
│  - 8 patterns               │  SOL: $185.20  ▲ 5.1%       │
│  - 5 strategies             │                               │
│                             │                               │
├─────────────────────────────┴───────────────────────────────┤
│  [1] Positions  [2] Agents  [3] Skills  [4] Market          │
│  [c] Config  [s] Skills Browser  [?] Help  [q] Quit         │
└─────────────────────────────────────────────────────────────┘
```

## Panels

### Positions Panel

Shows all open positions across domains:

- **Domain** - DLMM, Perps, Spot, or Polymarket
- **Target** - Pool, market, or token identifier
- **Entry Value** - Initial position size
- **Current Value** - Live value with P&L
- **Status** - Open, pending exit, etc.

### Agent Activity Panel

Real-time feed of subagent actions:

- Tool calls and results
- Decision submissions
- Error messages
- Cycle status

### Skills Panel

Overview of active skills:

- Count by type (warning, pattern, strategy)
- Recently generated skills
- Effectiveness scores
- Expiring soon alerts

### Market Data Panel

Live price feeds:

- Major assets (BTC, ETH, SOL)
- 24h change percentages
- Domain-specific data (funding rates, pool APRs)

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `1` | Focus Positions panel |
| `2` | Focus Agents panel |
| `3` | Focus Skills panel |
| `4` | Focus Market panel |
| `c` | Open Config modal |
| `s` | Open Skills browser |
| `?` | Open Help modal |
| `q` | Quit TUI |
| `↑/↓` | Scroll in focused panel |
| `Enter` | Select/expand item |
| `Esc` | Close modal |

## Modals

### Config Modal

Adjust runtime settings:

```
┌─────────── Configuration ───────────┐
│                                     │
│  Trading Mode:  ○ Paper  ● Live    │
│                                     │
│  Cycle Interval: [30] minutes       │
│                                     │
│  Active Domains:                    │
│    ☑ DLMM                          │
│    ☑ Perps                         │
│    ☑ Spot                          │
│    ☐ Polymarket                    │
│                                     │
│  [Save]  [Cancel]                   │
└─────────────────────────────────────┘
```

### Skills Browser

Browse and manage skills:

```
┌─────────── Skills Browser ──────────┐
│                                     │
│  Filter: [All ▼]  Search: [______] │
│                                     │
│  warning-dlmm-low-tvl.md           │
│  pattern-perps-rsi-oversold.md     │
│  strategy-spot-momentum.md          │
│  > pattern-polymarket-edge.md  ←   │
│                                     │
│  [View]  [Archive]  [Delete]        │
└─────────────────────────────────────┘
```

### Help Modal

Quick reference for all commands and shortcuts.

## Hooks

The TUI uses custom React hooks for data:

```typescript
// Real-time portfolio data
const { positions, loading } = usePortfolio();

// Live price feeds
const { prices, lastUpdate } = usePriceTicker();

// Skills overview
const { skills, counts } = useSkills();

// Market data by domain
const { data, refresh } = useMarketData(domain);
```

## Running Alongside Ralph Loop

The TUI can run alongside the main trading loop:

```bash
# Terminal 1: Run the trading loop
npm run ralph

# Terminal 2: Run the TUI for monitoring
npm run tui
```

Both connect to the same database and show live data.

## Customization

### Theme

The TUI respects your terminal's color scheme. For best results:

- Use a terminal with 256-color support
- Dark backgrounds work best
- Recommended: iTerm2, Alacritty, or Kitty

### Panel Layout

Currently fixed layout. Future versions will support:

- Resizable panels
- Custom arrangements
- Saved layouts

## Troubleshooting

### TUI Won't Start

```bash
# Check Ink is installed
npm ls ink

# Reinstall if needed
npm install ink ink-spinner ink-table ink-select-input ink-text-input
```

### No Data Showing

```bash
# Ensure database is set up
npm run db:setup

# Check if ralph loop has run at least once
npm run ralph
# (Ctrl+C after first cycle)
```

### Colors Look Wrong

```bash
# Check terminal color support
echo $TERM
# Should be xterm-256color or similar

# Force 256 colors
export TERM=xterm-256color
npm run tui
```

## Related Documentation

- [Commands Reference](../reference/commands.md) - All npm scripts
- [Configuration](./configuration.md) - Environment setup
- [Architecture Overview](../architecture/overview.md) - System design
