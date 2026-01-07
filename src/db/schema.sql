-- Claudefi Database Schema
-- Self-contained schema for autonomous DeFi trading

-- =============================================================================
-- AGENT CONFIGURATION
-- =============================================================================

-- Agent configuration and balances
CREATE TABLE IF NOT EXISTS agent_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'claudefi',

  -- Domain balances (paper trading starts with $2500 each)
  dlmm_balance NUMERIC NOT NULL DEFAULT 2500,
  perps_balance NUMERIC NOT NULL DEFAULT 2500,
  polymarket_balance NUMERIC NOT NULL DEFAULT 2500,
  spot_balance NUMERIC NOT NULL DEFAULT 2500,

  -- Settings
  paper_trading BOOLEAN NOT NULL DEFAULT true,
  active_domains TEXT[] DEFAULT ARRAY['dlmm', 'perps', 'polymarket', 'spot'],
  cycle_interval_ms INTEGER DEFAULT 1800000, -- 30 minutes

  -- Risk parameters
  max_position_pct NUMERIC DEFAULT 0.20, -- Max 20% per position
  max_positions_per_domain INTEGER DEFAULT 3,
  confidence_threshold NUMERIC DEFAULT 0.60,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- POSITIONS
-- =============================================================================

-- DLMM liquidity positions
CREATE TABLE IF NOT EXISTS dlmm_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pool_address TEXT NOT NULL,
  pool_name TEXT,

  entry_value_usd NUMERIC NOT NULL,
  current_value_usd NUMERIC NOT NULL,
  fees_earned NUMERIC DEFAULT 0,

  strategy TEXT, -- 'spot', 'curve', 'bid-ask'
  entry_price NUMERIC,
  apr_at_entry NUMERIC,

  status TEXT NOT NULL DEFAULT 'open', -- 'open', 'closed'
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  realized_pnl NUMERIC,

  metadata JSONB DEFAULT '{}'::jsonb
);

-- Perps positions
CREATE TABLE IF NOT EXISTS perps_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  symbol TEXT NOT NULL,
  side TEXT NOT NULL, -- 'LONG' or 'SHORT'

  size_usd NUMERIC NOT NULL,
  leverage INTEGER NOT NULL,
  margin_used NUMERIC NOT NULL,

  entry_price NUMERIC NOT NULL,
  current_price NUMERIC,
  liquidation_price NUMERIC,
  unrealized_pnl NUMERIC DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  exit_price NUMERIC,
  realized_pnl NUMERIC,

  order_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- Polymarket positions
CREATE TABLE IF NOT EXISTS polymarket_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  condition_id TEXT NOT NULL,
  market_question TEXT,

  outcome TEXT NOT NULL, -- 'YES' or 'NO'
  shares NUMERIC NOT NULL,
  entry_price NUMERIC NOT NULL,
  current_price NUMERIC,

  entry_value_usd NUMERIC NOT NULL,
  current_value_usd NUMERIC,

  estimated_prob NUMERIC, -- Agent's probability estimate
  expected_value NUMERIC, -- Calculated EV

  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  exit_price NUMERIC,
  realized_pnl NUMERIC,

  metadata JSONB DEFAULT '{}'::jsonb
);

-- Spot token positions
CREATE TABLE IF NOT EXISTS spot_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token_mint TEXT NOT NULL,
  token_symbol TEXT,
  token_name TEXT,

  amount NUMERIC NOT NULL, -- Token amount
  entry_price NUMERIC NOT NULL,
  current_price NUMERIC,

  entry_value_usd NUMERIC NOT NULL,
  current_value_usd NUMERIC,

  status TEXT NOT NULL DEFAULT 'open',
  opened_at TIMESTAMPTZ DEFAULT now(),
  closed_at TIMESTAMPTZ,
  exit_price NUMERIC,
  realized_pnl NUMERIC,

  price_impact NUMERIC,
  order_id TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

-- =============================================================================
-- DECISIONS & HISTORY
-- =============================================================================

-- All trading decisions
CREATE TABLE IF NOT EXISTS agent_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL, -- 'dlmm', 'perps', 'polymarket', 'spot'

  action TEXT NOT NULL, -- 'buy', 'sell', 'hold', 'add_liquidity', etc.
  target TEXT, -- Symbol, address, or condition_id
  amount_usd NUMERIC,

  reasoning TEXT,
  confidence NUMERIC,

  outcome TEXT, -- 'profit', 'loss', 'pending'
  realized_pnl NUMERIC,
  pnl_percent NUMERIC,

  position_id UUID, -- Reference to position if applicable

  market_conditions JSONB, -- Snapshot of market state
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Performance snapshots (for tracking over time)
CREATE TABLE IF NOT EXISTS performance_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  domain TEXT NOT NULL,

  total_value_usd NUMERIC NOT NULL,
  cash_balance NUMERIC NOT NULL,
  positions_value NUMERIC NOT NULL,
  num_positions INTEGER DEFAULT 0,

  -- Performance metrics
  daily_pnl NUMERIC,
  daily_pnl_percent NUMERIC,
  total_pnl NUMERIC,
  total_pnl_percent NUMERIC,

  timestamp TIMESTAMPTZ DEFAULT now()
);

-- =============================================================================
-- INDEXES
-- =============================================================================

-- Positions indexes
CREATE INDEX IF NOT EXISTS idx_dlmm_positions_status ON dlmm_positions(status);
CREATE INDEX IF NOT EXISTS idx_perps_positions_status ON perps_positions(status);
CREATE INDEX IF NOT EXISTS idx_polymarket_positions_status ON polymarket_positions(status);
CREATE INDEX IF NOT EXISTS idx_spot_positions_status ON spot_positions(status);

-- Decisions indexes
CREATE INDEX IF NOT EXISTS idx_decisions_domain ON agent_decisions(domain);
CREATE INDEX IF NOT EXISTS idx_decisions_created_at ON agent_decisions(created_at);
CREATE INDEX IF NOT EXISTS idx_decisions_outcome ON agent_decisions(outcome);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_performance_domain_time ON performance_snapshots(domain, timestamp);

-- =============================================================================
-- FUNCTIONS
-- =============================================================================

-- Update timestamp trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply trigger to agent_config
DROP TRIGGER IF EXISTS update_agent_config_updated_at ON agent_config;
CREATE TRIGGER update_agent_config_updated_at
  BEFORE UPDATE ON agent_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =============================================================================
-- INITIAL DATA
-- =============================================================================

-- Create default agent config if not exists
INSERT INTO agent_config (name)
SELECT 'claudefi'
WHERE NOT EXISTS (SELECT 1 FROM agent_config);

-- =============================================================================
-- VIEWS
-- =============================================================================

-- Portfolio overview view
CREATE OR REPLACE VIEW portfolio_overview AS
SELECT
  ac.name,
  ac.paper_trading,
  ac.dlmm_balance,
  ac.perps_balance,
  ac.polymarket_balance,
  ac.spot_balance,
  (ac.dlmm_balance + ac.perps_balance + ac.polymarket_balance + ac.spot_balance) as total_cash,
  (SELECT COUNT(*) FROM dlmm_positions WHERE status = 'open') as dlmm_positions,
  (SELECT COUNT(*) FROM perps_positions WHERE status = 'open') as perps_positions,
  (SELECT COUNT(*) FROM polymarket_positions WHERE status = 'open') as polymarket_positions,
  (SELECT COUNT(*) FROM spot_positions WHERE status = 'open') as spot_positions,
  (SELECT COALESCE(SUM(current_value_usd), 0) FROM dlmm_positions WHERE status = 'open') as dlmm_value,
  (SELECT COALESCE(SUM(margin_used + unrealized_pnl), 0) FROM perps_positions WHERE status = 'open') as perps_value,
  (SELECT COALESCE(SUM(current_value_usd), 0) FROM polymarket_positions WHERE status = 'open') as polymarket_value,
  (SELECT COALESCE(SUM(current_value_usd), 0) FROM spot_positions WHERE status = 'open') as spot_value
FROM agent_config ac
LIMIT 1;

-- Recent decisions view
CREATE OR REPLACE VIEW recent_decisions AS
SELECT
  id,
  domain,
  action,
  target,
  amount_usd,
  reasoning,
  confidence,
  outcome,
  realized_pnl,
  pnl_percent,
  created_at
FROM agent_decisions
ORDER BY created_at DESC
LIMIT 100;

-- =============================================================================
-- COMMUNITY SKILLS
-- =============================================================================

-- Community skill registry (synced from GitHub)
CREATE TABLE IF NOT EXISTS community_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT UNIQUE NOT NULL,
  description TEXT NOT NULL,
  author TEXT,
  github_url TEXT,
  domain TEXT, -- 'dlmm', 'perps', 'polymarket', 'spot', 'general'
  downloads INTEGER DEFAULT 0,
  rating NUMERIC DEFAULT 0,
  version TEXT DEFAULT '1.0.0',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- User's installed skills
CREATE TABLE IF NOT EXISTS user_skills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID, -- Reference to auth.users if using Supabase auth
  skill_name TEXT NOT NULL,
  installed_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, skill_name)
);

-- Skill usage tracking (for leaderboard/analytics)
CREATE TABLE IF NOT EXISTS skill_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  skill_name TEXT NOT NULL,
  user_id UUID,
  domain TEXT,
  outcome TEXT, -- 'profitable', 'loss'
  pnl NUMERIC,
  used_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for skills
CREATE INDEX IF NOT EXISTS idx_community_skills_domain ON community_skills(domain);
CREATE INDEX IF NOT EXISTS idx_community_skills_downloads ON community_skills(downloads DESC);
CREATE INDEX IF NOT EXISTS idx_user_skills_user ON user_skills(user_id);
CREATE INDEX IF NOT EXISTS idx_skill_usage_skill ON skill_usage(skill_name);

-- Function to increment skill downloads
CREATE OR REPLACE FUNCTION increment_skill_downloads(skill_name TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE community_skills
  SET downloads = downloads + 1, updated_at = now()
  WHERE name = skill_name;
END;
$$ LANGUAGE plpgsql;

-- View for popular skills
CREATE OR REPLACE VIEW popular_skills AS
SELECT
  name,
  description,
  author,
  domain,
  downloads,
  rating,
  version,
  created_at
FROM community_skills
ORDER BY downloads DESC
LIMIT 50;

-- View for skills by domain
CREATE OR REPLACE VIEW skills_by_domain AS
SELECT
  domain,
  COUNT(*) as skill_count,
  SUM(downloads) as total_downloads,
  AVG(rating) as avg_rating
FROM community_skills
GROUP BY domain
ORDER BY total_downloads DESC;

-- =============================================================================
-- RLS POLICIES (if using Supabase)
-- =============================================================================

-- Enable RLS
ALTER TABLE agent_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE dlmm_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE perps_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE polymarket_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE spot_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_snapshots ENABLE ROW LEVEL SECURITY;

-- Allow service role full access
CREATE POLICY "Service role full access" ON agent_config
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON dlmm_positions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON perps_positions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON polymarket_positions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON spot_positions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON agent_decisions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON performance_snapshots
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON community_skills
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON user_skills
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Service role full access" ON skill_usage
  FOR ALL USING (true) WITH CHECK (true);

-- Enable RLS on skill tables
ALTER TABLE community_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_skills ENABLE ROW LEVEL SECURITY;
ALTER TABLE skill_usage ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PHASE 12: LEADERBOARD VERIFICATION
-- =============================================================================

-- Add verification columns to agent_config
ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS solana_wallet_pubkey TEXT;
ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS hyperliquid_wallet TEXT;
ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS polygon_wallet TEXT;
ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS verified_trader BOOLEAN DEFAULT false;
ALTER TABLE agent_config ADD COLUMN IF NOT EXISTS wallet_verified_at TIMESTAMPTZ;

-- Add verification columns to dlmm_positions
ALTER TABLE dlmm_positions ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE dlmm_positions ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE dlmm_positions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Add verification columns to perps_positions (order_id already exists)
ALTER TABLE perps_positions ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE perps_positions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Add verification columns to polymarket_positions
ALTER TABLE polymarket_positions ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE polymarket_positions ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE polymarket_positions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Add verification columns to spot_positions (order_id already exists)
ALTER TABLE spot_positions ADD COLUMN IF NOT EXISTS tx_hash TEXT;
ALTER TABLE spot_positions ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false;
ALTER TABLE spot_positions ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Indexes for verification queries
CREATE INDEX IF NOT EXISTS idx_dlmm_positions_verified ON dlmm_positions(verified) WHERE verified = false;
CREATE INDEX IF NOT EXISTS idx_perps_positions_verified ON perps_positions(verified) WHERE verified = false;
CREATE INDEX IF NOT EXISTS idx_polymarket_positions_verified ON polymarket_positions(verified) WHERE verified = false;
CREATE INDEX IF NOT EXISTS idx_spot_positions_verified ON spot_positions(verified) WHERE verified = false;
CREATE INDEX IF NOT EXISTS idx_agent_config_verified ON agent_config(verified_trader) WHERE verified_trader = true;

-- Verified leaderboard view
CREATE OR REPLACE VIEW verified_leaderboard AS
SELECT
  ac.id,
  ac.name,
  ac.solana_wallet_pubkey,
  ac.hyperliquid_wallet,
  ac.polygon_wallet,
  ac.verified_trader,
  ac.wallet_verified_at,
  -- Cash balances
  ac.dlmm_balance,
  ac.perps_balance,
  ac.polymarket_balance,
  ac.spot_balance,
  -- Only count verified positions
  COALESCE((SELECT SUM(current_value_usd) FROM dlmm_positions dp
            WHERE dp.verified = true AND dp.status = 'open'), 0) as dlmm_positions_value,
  COALESCE((SELECT SUM(margin_used + unrealized_pnl) FROM perps_positions pp
            WHERE pp.verified = true AND pp.status = 'open'), 0) as perps_positions_value,
  COALESCE((SELECT SUM(current_value_usd) FROM polymarket_positions pmp
            WHERE pmp.verified = true AND pmp.status = 'open'), 0) as polymarket_positions_value,
  COALESCE((SELECT SUM(current_value_usd) FROM spot_positions sp
            WHERE sp.verified = true AND sp.status = 'open'), 0) as spot_positions_value,
  -- Total AUM (cash + positions)
  (ac.dlmm_balance + COALESCE((SELECT SUM(current_value_usd) FROM dlmm_positions dp
            WHERE dp.verified = true AND dp.status = 'open'), 0)) as dlmm_total_aum,
  (ac.perps_balance + COALESCE((SELECT SUM(margin_used + unrealized_pnl) FROM perps_positions pp
            WHERE pp.verified = true AND pp.status = 'open'), 0)) as perps_total_aum,
  (ac.polymarket_balance + COALESCE((SELECT SUM(current_value_usd) FROM polymarket_positions pmp
            WHERE pmp.verified = true AND pmp.status = 'open'), 0)) as polymarket_total_aum,
  (ac.spot_balance + COALESCE((SELECT SUM(current_value_usd) FROM spot_positions sp
            WHERE sp.verified = true AND sp.status = 'open'), 0)) as spot_total_aum,
  -- Grand totals
  (ac.dlmm_balance + ac.perps_balance + ac.polymarket_balance + ac.spot_balance +
   COALESCE((SELECT SUM(current_value_usd) FROM dlmm_positions dp WHERE dp.verified = true AND dp.status = 'open'), 0) +
   COALESCE((SELECT SUM(margin_used + unrealized_pnl) FROM perps_positions pp WHERE pp.verified = true AND pp.status = 'open'), 0) +
   COALESCE((SELECT SUM(current_value_usd) FROM polymarket_positions pmp WHERE pmp.verified = true AND pmp.status = 'open'), 0) +
   COALESCE((SELECT SUM(current_value_usd) FROM spot_positions sp WHERE sp.verified = true AND sp.status = 'open'), 0)
  ) as total_verified_aum,
  -- PnL calculations (starting with $10k = $2500 per domain)
  (ac.dlmm_balance + ac.perps_balance + ac.polymarket_balance + ac.spot_balance +
   COALESCE((SELECT SUM(current_value_usd) FROM dlmm_positions dp WHERE dp.verified = true AND dp.status = 'open'), 0) +
   COALESCE((SELECT SUM(margin_used + unrealized_pnl) FROM perps_positions pp WHERE pp.verified = true AND pp.status = 'open'), 0) +
   COALESCE((SELECT SUM(current_value_usd) FROM polymarket_positions pmp WHERE pmp.verified = true AND pmp.status = 'open'), 0) +
   COALESCE((SELECT SUM(current_value_usd) FROM spot_positions sp WHERE sp.verified = true AND sp.status = 'open'), 0)
   - 10000
  ) as verified_pnl,
  -- Trade counts (verified only)
  (SELECT COUNT(*) FROM dlmm_positions dp WHERE dp.verified = true) as dlmm_verified_trades,
  (SELECT COUNT(*) FROM perps_positions pp WHERE pp.verified = true) as perps_verified_trades,
  (SELECT COUNT(*) FROM polymarket_positions pmp WHERE pmp.verified = true) as polymarket_verified_trades,
  (SELECT COUNT(*) FROM spot_positions sp WHERE sp.verified = true) as spot_verified_trades,
  ac.updated_at as last_active
FROM agent_config ac
WHERE ac.verified_trader = true
ORDER BY total_verified_aum DESC;

-- Pending verification view (for background job)
CREATE OR REPLACE VIEW pending_verification AS
SELECT 'dlmm' as domain, id, tx_hash, opened_at
FROM dlmm_positions WHERE tx_hash IS NOT NULL AND verified = false
UNION ALL
SELECT 'perps' as domain, id, order_id as tx_hash, opened_at
FROM perps_positions WHERE order_id IS NOT NULL AND verified = false
UNION ALL
SELECT 'polymarket' as domain, id, tx_hash, opened_at
FROM polymarket_positions WHERE tx_hash IS NOT NULL AND verified = false
UNION ALL
SELECT 'spot' as domain, id, tx_hash, opened_at
FROM spot_positions WHERE tx_hash IS NOT NULL AND verified = false
ORDER BY opened_at ASC;

-- =============================================================================
-- TELEGRAM INTEGRATION
-- =============================================================================

-- Telegram subscribers for alerts
CREATE TABLE IF NOT EXISTS telegram_subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id TEXT UNIQUE NOT NULL,
  username TEXT,

  -- Alert preferences
  alert_types TEXT[] DEFAULT ARRAY['trade', 'daily_summary'],
  -- Options: 'trade', 'position_closed', 'daily_summary', 'error', 'all'

  is_active BOOLEAN DEFAULT true,

  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for telegram queries
CREATE INDEX IF NOT EXISTS idx_telegram_subscribers_chat_id ON telegram_subscribers(chat_id);
CREATE INDEX IF NOT EXISTS idx_telegram_subscribers_active ON telegram_subscribers(is_active) WHERE is_active = true;

-- RLS for telegram subscribers
ALTER TABLE telegram_subscribers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role full access" ON telegram_subscribers
  FOR ALL USING (true) WITH CHECK (true);
