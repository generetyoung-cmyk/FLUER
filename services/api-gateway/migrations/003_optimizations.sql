-- FLUER Protocol — Migration 003
-- Add missing indices, views, and performance optimizations

-- ── PARTIAL INDICES for common query patterns ─────────────────

-- Hot path: tokens sorted by volume (non-graduated only)
CREATE INDEX IF NOT EXISTS idx_tokens_volume_active
    ON token_listings(volume_24h_usd DESC)
    WHERE graduated = false;

-- Hot path: graduated tokens by graduation time
CREATE INDEX IF NOT EXISTS idx_tokens_graduation_time
    ON token_listings(graduated_at DESC)
    WHERE graduated = true;

-- Fast "trending" query: high buy_count in last 24h
CREATE INDEX IF NOT EXISTS idx_tokens_recent_buys
    ON token_listings(buy_count DESC, created_at DESC);

-- Active predictions sorted by volume
CREATE INDEX IF NOT EXISTS idx_predictions_active_volume
    ON prediction_markets(total_volume_usd DESC)
    WHERE status = 'Active';

-- ── PROTOCOL STATS FUNCTION ───────────────────────────────────
-- Called every 30s by price aggregator, cached in Redis

CREATE OR REPLACE FUNCTION get_protocol_stats()
RETURNS TABLE(
    total_volume_24h        DOUBLE PRECISION,
    active_markets          BIGINT,
    total_oi                DOUBLE PRECISION,
    active_predictions      BIGINT,
    total_tokens_launched   BIGINT,
    total_graduated         BIGINT
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        COALESCE((SELECT SUM(volume_24h) FROM perp_markets WHERE active = true), 0.0),
        (SELECT COUNT(*) FROM perp_markets WHERE active = true),
        COALESCE((SELECT SUM(long_open_interest + short_open_interest) FROM perp_markets WHERE active = true), 0.0),
        (SELECT COUNT(*) FROM prediction_markets WHERE status = 'Active'),
        (SELECT COUNT(*) FROM token_listings),
        (SELECT COUNT(*) FROM token_listings WHERE graduated = true);
END;
$$ LANGUAGE plpgsql STABLE;

-- ── TRIGGER: auto-update last_price_update ────────────────────
CREATE OR REPLACE FUNCTION update_token_price_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.last_price_update = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER token_price_update_trigger
    BEFORE UPDATE OF price_usd, price_sol, virtual_sol_reserves
    ON token_listings
    FOR EACH ROW
    EXECUTE FUNCTION update_token_price_timestamp();

-- ── CURVE SNAPSHOT TABLE ──────────────────────────────────────
-- Captures bonding curve state at key moments for analytics
CREATE TABLE IF NOT EXISTS curve_snapshots (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    mint            TEXT NOT NULL,
    virtual_sol     BIGINT NOT NULL,
    virtual_tokens  BIGINT NOT NULL,
    real_sol        BIGINT NOT NULL,
    price_usd       DOUBLE PRECISION,
    market_cap_usd  DOUBLE PRECISION,
    holder_count    INT,
    timestamp       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('curve_snapshots', 'timestamp', if_not_exists => TRUE);
SELECT add_retention_policy('curve_snapshots', INTERVAL '30 days', if_not_exists => true);
CREATE INDEX IF NOT EXISTS idx_curve_snapshots_mint ON curve_snapshots(mint, timestamp DESC);

-- ── LEADERBOARD VIEWS ─────────────────────────────────────────

-- Top creators by graduated tokens
CREATE OR REPLACE VIEW creator_leaderboard AS
SELECT
    creator AS wallet,
    COUNT(*) FILTER (WHERE graduated = true) AS graduated_count,
    COUNT(*) AS total_created,
    SUM(volume_24h_usd) AS total_volume_today,
    MAX(market_cap_usd) AS best_market_cap
FROM token_listings
GROUP BY creator
ORDER BY graduated_count DESC, total_volume_today DESC
LIMIT 100;

-- Top tokens by all-time volume
CREATE OR REPLACE VIEW top_tokens_all_time AS
SELECT
    mint, name, symbol, image_url,
    price_usd, market_cap_usd,
    total_volume_usd,
    holder_count, graduated,
    created_at
FROM token_listings
ORDER BY total_volume_usd DESC
LIMIT 50;

-- ── GRANT STATEMENTS ─────────────────────────────────────────
-- (Adjust for your PostgreSQL user setup)
-- GRANT SELECT ON ALL TABLES IN SCHEMA public TO fluer_readonly;
-- GRANT ALL ON ALL TABLES IN SCHEMA public TO fluer_app;
