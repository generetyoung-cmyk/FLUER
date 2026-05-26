-- FLUER Protocol — Migration 002
-- Indexer state tracking and additional support tables

-- ── INDEXER CURSORS ───────────────────────────────────────────
-- Tracks the last processed transaction signature for each program
-- Prevents re-indexing on restart
CREATE TABLE IF NOT EXISTS indexer_cursors (
    program_id        TEXT PRIMARY KEY,
    last_signature    TEXT NOT NULL,
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── CURVE TRADES ─────────────────────────────────────────────
-- Raw bonding curve buy/sell events (from on-chain CurveTradeEvent)
CREATE TABLE IF NOT EXISTS curve_trades (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint            TEXT NOT NULL REFERENCES token_listings(mint) ON DELETE CASCADE,
    side            TEXT NOT NULL CHECK (side IN ('Buy', 'Sell')),
    sol_amount      BIGINT NOT NULL,          -- lamports
    token_amount    BIGINT NOT NULL,          -- base units (6 decimals)
    price_usd       DOUBLE PRECISION,
    trader          TEXT NOT NULL,
    tx_sig          TEXT,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('curve_trades', 'timestamp', if_not_exists => TRUE);
SELECT add_retention_policy('curve_trades', INTERVAL '30 days', if_not_exists => true);
CREATE INDEX IF NOT EXISTS idx_curve_trades_mint ON curve_trades(mint, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_curve_trades_trader ON curve_trades(trader, timestamp DESC);

-- ── CREATOR PROFILES ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS creator_profiles (
    wallet                  TEXT PRIMARY KEY,
    tokens_created          INT NOT NULL DEFAULT 0,
    tokens_graduated        INT NOT NULL DEFAULT 0,
    tier                    TEXT NOT NULL DEFAULT 'Bronze',
    pending_rewards_lamports BIGINT NOT NULL DEFAULT 0,
    total_claimed_lamports  BIGINT NOT NULL DEFAULT 0,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_updated            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── STAKING POSITIONS (mirror of on-chain, for API reads) ────
CREATE TABLE IF NOT EXISTS staking_positions (
    wallet              TEXT PRIMARY KEY,
    staked_amount       BIGINT NOT NULL DEFAULT 0,       -- $FLUER units (6 dec)
    pending_rewards     BIGINT NOT NULL DEFAULT 0,
    tier                TEXT NOT NULL DEFAULT 'None',
    last_action_at      TIMESTAMPTZ,
    last_synced_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_staking_tier ON staking_positions(tier);
CREATE INDEX IF NOT EXISTS idx_staking_amount ON staking_positions(staked_amount DESC);

-- ── LAUNCHPAD CONFIGS ─────────────────────────────────────────
-- Mirrors on-chain LaunchpadConfig for quick reads
CREATE TABLE IF NOT EXISTS launchpad_config (
    id                              INT PRIMARY KEY DEFAULT 1,
    platform_fee_bps                SMALLINT NOT NULL DEFAULT 100,
    creation_fee_fluer              BIGINT NOT NULL DEFAULT 50000000,
    graduation_sol_threshold        BIGINT NOT NULL DEFAULT 85000000000,
    total_tokens_created            BIGINT NOT NULL DEFAULT 0,
    total_volume_lamports           BIGINT NOT NULL DEFAULT 0,
    total_graduated                 BIGINT NOT NULL DEFAULT 0,
    last_synced_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO launchpad_config DEFAULT VALUES ON CONFLICT DO NOTHING;

-- ── NOTIFICATIONS (for creator rewards, graduation alerts) ───
CREATE TABLE IF NOT EXISTS notifications (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet          TEXT NOT NULL,
    type            TEXT NOT NULL,       -- 'GraduationAlert' | 'RewardAvailable' | 'MarketOpen'
    title           TEXT NOT NULL,
    body            TEXT,
    data            JSONB,
    read            BOOLEAN NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_wallet ON notifications(wallet, read, created_at DESC);

-- ── FULL TEXT SEARCH VIEWS ────────────────────────────────────
CREATE OR REPLACE VIEW token_search_view AS
SELECT
    mint,
    name,
    symbol,
    description,
    image_url,
    price_usd,
    change_24h,
    volume_24h_usd,
    market_cap_usd,
    holder_count,
    graduated,
    category,
    created_at,
    to_tsvector('english',
        coalesce(name, '') || ' ' ||
        coalesce(symbol, '') || ' ' ||
        coalesce(description, '')
    ) AS search_vector
FROM token_listings;

-- ── CONTINUOUS AGGREGATES (TimescaleDB) ──────────────────────
-- 1-minute candles auto-refreshed from raw token_candles
-- These power the lower resolution candles without re-querying raw data

-- Hourly candles for perp markets
CREATE MATERIALIZED VIEW IF NOT EXISTS market_candles_1h
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 hour', timestamp) AS bucket,
    market_id,
    FIRST(open, timestamp) AS open,
    MAX(high) AS high,
    MIN(low) AS low,
    LAST(close, timestamp) AS close,
    SUM(volume_usd) AS volume
FROM market_candles
GROUP BY bucket, market_id
WITH NO DATA;

SELECT add_continuous_aggregate_policy('market_candles_1h',
    start_offset => INTERVAL '3 days',
    end_offset   => INTERVAL '1 minute',
    schedule_interval => INTERVAL '5 minutes',
    if_not_exists => true
);

-- Daily candles for token price charts
CREATE MATERIALIZED VIEW IF NOT EXISTS token_candles_1d
WITH (timescaledb.continuous) AS
SELECT
    time_bucket('1 day', timestamp) AS bucket,
    mint,
    FIRST(open, timestamp) AS open,
    MAX(high) AS high,
    MIN(low) AS low,
    LAST(close, timestamp) AS close,
    SUM(volume_sol) AS volume
FROM token_candles
GROUP BY bucket, mint
WITH NO DATA;

SELECT add_continuous_aggregate_policy('token_candles_1d',
    start_offset => INTERVAL '90 days',
    end_offset   => INTERVAL '1 hour',
    schedule_interval => INTERVAL '1 hour',
    if_not_exists => true
);
