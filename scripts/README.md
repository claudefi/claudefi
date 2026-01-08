# Claudefi Scripts

Utility scripts for managing test data, balances, and cleanup.

## Cleanup Test Data

Cleans up all test-related data (positions, decisions, idempotency records) and resets balances.

```bash
# Clean up data from today onwards
tsx scripts/cleanup-test-data.ts

# Clean up data from a specific date
tsx scripts/cleanup-test-data.ts --date=2026-01-08

# Clean up data from specific date range (custom logic required)
tsx scripts/cleanup-test-data.ts --date=2026-01-01
```

**What it does:**
- ✅ Closes all positions opened on/after cutoff date
- ✅ Deletes all decisions made on/after cutoff date
- ✅ Resets domain balances to $500
- ✅ Clears idempotency records from cutoff date
- ✅ Works with both Prisma (SQLite) and Supabase

**When to use:**
- After running stress tests
- After development testing sessions
- When you want a clean slate
- Before production deployment

## Reset Balances

Quickly resets all domain balances without touching positions or decisions.

```bash
# Reset to default $500 per domain
tsx scripts/reset-balances.ts

# Reset to custom amount
tsx scripts/reset-balances.ts --amount=1000
```

**What it does:**
- ✅ Resets balances for all 4 domains (dlmm, perps, polymarket, spot)
- ✅ Shows before/after comparison
- ✅ Works with both Prisma and Supabase

**When to use:**
- After paper trading sessions
- When balances get out of sync
- Testing with different starting capital

## Manual Cleanup (SQL)

If you prefer direct database access:

### Prisma (SQLite)

```bash
npx prisma studio
```

Then run queries in the Prisma Studio UI, or use `sqlite3`:

```sql
-- Delete test decisions
DELETE FROM Decision WHERE created_at >= '2026-01-08';

-- Close test positions
UPDATE Position
SET status = 'closed', closed_at = datetime('now')
WHERE opened_at >= '2026-01-08';

-- Reset domain balances
UPDATE DomainBalance SET balance = 500.0;

-- Clear idempotency records
DELETE FROM IdempotencyRecord WHERE created_at >= '2026-01-08';
```

### Supabase

Use the Supabase dashboard SQL editor:

```sql
-- Delete test decisions
DELETE FROM decisions WHERE created_at >= '2026-01-08';

-- Close test positions
UPDATE positions
SET status = 'closed', closed_at = NOW()
WHERE opened_at >= '2026-01-08';

-- Reset domain balances
UPDATE domain_balances SET balance = 500.0;

-- Clear idempotency records
DELETE FROM idempotency_records WHERE created_at >= '2026-01-08';
```

## Safety Notes

⚠️ **Always review data before cleanup:**

```bash
# Check current portfolio state
npx tsx -e "
import { getPortfolio } from './src/data/provider.js';
const p = await getPortfolio();
console.log('Portfolio:', p);
"

# Check open positions
npx tsx -e "
import { getOpenPositions } from './src/data/provider.js';
const domains = ['dlmm', 'perps', 'polymarket', 'spot'];
for (const d of domains) {
  const positions = await getOpenPositions(d);
  console.log(d + ':', positions.length, 'positions');
}
"
```

⚠️ **Backup before cleanup (Prisma):**

```bash
# Backup SQLite database
cp prisma/dev.db prisma/dev.db.backup-$(date +%Y%m%d)
```

⚠️ **Backup before cleanup (Supabase):**

Use Supabase dashboard → Database → Backups

## Quick Reference

| Task | Command |
|------|---------|
| Full cleanup | `tsx scripts/cleanup-test-data.ts` |
| Reset balances only | `tsx scripts/reset-balances.ts` |
| Custom reset amount | `tsx scripts/reset-balances.ts --amount=1000` |
| Cleanup from date | `tsx scripts/cleanup-test-data.ts --date=2026-01-08` |
| View portfolio | `tsx -e "import {getPortfolio} from './src/data/provider.js'; console.log(await getPortfolio())"` |
| View DB in UI | `npx prisma studio` |

## After Stress Tests

Recommended cleanup workflow after running `npm run test:stress`:

```bash
# 1. Review test results
cat stress-test-results.json
open stress-test-report.html

# 2. Check final state
tsx -e "import {getPortfolio} from './src/data/provider.js'; console.log(await getPortfolio())"

# 3. Clean up test data
tsx scripts/cleanup-test-data.ts

# 4. Verify cleanup
tsx -e "import {getPortfolio} from './src/data/provider.js'; console.log(await getPortfolio())"
```

## Troubleshooting

**Problem:** Cleanup script hangs

**Solution:** Check for database locks. If using SQLite, ensure no other processes are accessing the DB:

```bash
lsof | grep dev.db
# Kill any processes accessing the database
```

**Problem:** Balances not resetting

**Solution:** Verify DATA_PROVIDER is set correctly:

```bash
echo $DATA_PROVIDER
# Should be 'prisma' or 'supabase'
```

**Problem:** Permissions error (Supabase)

**Solution:** Ensure SUPABASE_SERVICE_ROLE_KEY is set (not anon key):

```bash
echo $SUPABASE_SERVICE_ROLE_KEY
# Should be service_role key with admin access
```
