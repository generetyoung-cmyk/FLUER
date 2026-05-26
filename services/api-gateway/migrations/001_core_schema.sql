-- FLUER Protocol — PostgreSQL Schema
-- Migration 001: Core tables
-- TimescaleDB hypertables for time-series OHLCV and trades

-- Enable TimescaleDB (must be installed on server)
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── PERP MARKETS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS perp_markets (
    id                      TEXT PRIMARY KEY,               -- "{base_mint}-PERP"
    base_mint               TEXT NOT NULL UNIQUE,
    symbol                  TEXT NOT NULL,                  -- e.g. "BONK-PERP"
    name                    TEXT NOT NULL,
    tier                    SMALLINT NOT NULL DEFAULT 1,    -- 1, 2, or 3
    mark_price              DOUBLE PRECISION NOT NULL DEFAULT 0,
    index_price             DOUBLE PRECISION NOT NULL DEFAULT 0,
    change_24h              DOUBLE PRECISION NOT NULL DEFAULT 0,
    volume_24h              DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_volume_all_time   DOUBLE PRECISION NOT NULL DEFAULT 0,
    trade_count             BIGINT NOT NULL DEFAULT 0,
    long_open_interest      DOUBLE PRECISION NOT NULL DEFAULT 0,
    short_open_interest     DOUBLE PRECISION NOT NULL DEFAULT 0,
    base_asset_reserve      DOUBLE PRECISION NOT NULL DEFAULT 0,
    quote_asset_reserve     DOUBLE PRECISION NOT NULL DEFAULT 0,
    funding_rate_hourly     DOUBLE PRECISION NOT NULL DEFAULT 0,
    last_funding_time       TIMESTAMPTZ,
    taker_fee_bps           SMALLINT NOT NULL DEFAULT 10,
    maintenance_margin_bps  SMALLINT NOT NULL DEFAULT 625,
    insurance_fund_balance  DOUBLE PRECISION NOT NULL DEFAULT 0,
    liquidation_count       BIGINT NOT NULL DEFAULT 0,
    oracle                  TEXT,                           -- Pyth price feed address
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    active                  BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_perp_markets_volume ON perp_markets(volume_24h DESC);
CREATE INDEX IF NOT EXISTS idx_perp_markets_active ON perp_markets(active) WHERE active = true;

-- ── MARKET CANDLES (TimescaleDB hypertable) ───────────────────
CREATE TABLE IF NOT EXISTS market_candles (
    timestamp       TIMESTAMPTZ NOT NULL,
    market_id       TEXT NOT NULL REFERENCES perp_markets(id) ON DELETE CASCADE,
    open            DOUBLE PRECISION NOT NULL,
    high            DOUBLE PRECISION NOT NULL,
    low             DOUBLE PRECISION NOT NULL,
    close           DOUBLE PRECISION NOT NULL,
    volume_usd      DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (market_id, timestamp)
);

SELECT create_hypertable('market_candles', 'timestamp', if_not_exists => TRUE);
SELECT add_retention_policy('market_candles', INTERVAL '90 days', if_not_exists => true);
CREATE INDEX IF NOT EXISTS idx_market_candles_market_time ON market_candles(market_id, timestamp DESC);

-- ── PERP TRADES ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS perp_trades (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id   TEXT NOT NULL,
    side        TEXT NOT NULL CHECK (side IN ('Long', 'Short')),
    size_usd    DOUBLE PRECISION NOT NULL,
    price       DOUBLE PRECISION NOT NULL,
    trader      TEXT NOT NULL,
    tx_sig      TEXT,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('perp_trades', 'timestamp', if_not_exists => TRUE);
SELECT add_retention_policy('perp_trades', INTERVAL '30 days', if_not_exists => true);
CREATE INDEX IF NOT EXISTS idx_perp_trades_market ON perp_trades(market_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_perp_trades_trader ON perp_trades(trader, timestamp DESC);

-- ── FUNDING HISTORY ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS funding_history (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    market_id   TEXT NOT NULL,
    rate_hourly DOUBLE PRECISION NOT NULL,
    mark_price  DOUBLE PRECISION NOT NULL,
    index_price DOUBLE PRECISION NOT NULL,
    timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('funding_history', 'timestamp', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS idx_funding_market ON funding_history(market_id, timestamp DESC);

-- ── TOKEN LISTINGS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_listings (
    mint                    TEXT PRIMARY KEY,
    creator                 TEXT NOT NULL,
    name                    TEXT NOT NULL,
    symbol                  TEXT NOT NULL,
    description             TEXT,
    image_url               TEXT,
    metadata_uri            TEXT,
    category                TEXT NOT NULL DEFAULT 'Meme',
    virtual_sol_reserves    BIGINT NOT NULL DEFAULT 30000000000,
    virtual_token_reserves  BIGINT NOT NULL DEFAULT 1073000191000000,
    real_sol_reserves       BIGINT NOT NULL DEFAULT 0,
    tokens_sold             BIGINT NOT NULL DEFAULT 0,
    total_supply            BIGINT NOT NULL DEFAULT 1000000000000000,
    price_sol               DOUBLE PRECISION NOT NULL DEFAULT 0,
    price_usd               DOUBLE PRECISION NOT NULL DEFAULT 0,
    market_cap_usd          DOUBLE PRECISION NOT NULL DEFAULT 0,
    holder_count            INT NOT NULL DEFAULT 1,
    volume_24h_usd          DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_volume_usd        DOUBLE PRECISION NOT NULL DEFAULT 0,
    buy_count               BIGINT NOT NULL DEFAULT 0,
    sell_count              BIGINT NOT NULL DEFAULT 0,
    change_1h               DOUBLE PRECISION NOT NULL DEFAULT 0,
    change_24h              DOUBLE PRECISION NOT NULL DEFAULT 0,
    graduated               BOOLEAN NOT NULL DEFAULT false,
    graduated_at            TIMESTAMPTZ,
    perp_market_id          TEXT,
    website                 TEXT,
    twitter                 TEXT,
    telegram                TEXT,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_price_update       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tokens_creator ON token_listings(creator);
CREATE INDEX IF NOT EXISTS idx_tokens_volume ON token_listings(volume_24h_usd DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_created ON token_listings(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_tokens_graduated ON token_listings(graduated);
CREATE INDEX IF NOT EXISTS idx_tokens_category ON token_listings(category);
-- Full text search on name + symbol
CREATE INDEX IF NOT EXISTS idx_tokens_search ON token_listings USING gin(
    to_tsvector('english', coalesce(name,'') || ' ' || coalesce(symbol,''))
);

-- ── TOKEN CURVE CANDLES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS token_candles (
    timestamp   TIMESTAMPTZ NOT NULL,
    mint        TEXT NOT NULL,
    open        DOUBLE PRECISION NOT NULL,
    high        DOUBLE PRECISION NOT NULL,
    low         DOUBLE PRECISION NOT NULL,
    close       DOUBLE PRECISION NOT NULL,
    volume_sol  DOUBLE PRECISION NOT NULL DEFAULT 0,
    PRIMARY KEY (mint, timestamp)
);

SELECT create_hypertable('token_candles', 'timestamp', if_not_exists => TRUE);
SELECT add_retention_policy('token_candles', INTERVAL '90 days', if_not_exists => true);
CREATE INDEX IF NOT EXISTS idx_token_candles_mint_time ON token_candles(mint, timestamp DESC);

-- ── PREDICTION MARKETS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS prediction_markets (
    id                      TEXT PRIMARY KEY,
    token_mint              TEXT NOT NULL,
    token_name              TEXT NOT NULL,
    token_symbol            TEXT NOT NULL,
    token_image             TEXT,
    type                    TEXT NOT NULL,
    title                   TEXT NOT NULL,
    description             TEXT,
    status                  TEXT NOT NULL DEFAULT 'Active',
    outcome                 TEXT NOT NULL DEFAULT 'Pending',
    yes_probability         DOUBLE PRECISION NOT NULL DEFAULT 50,
    no_probability          DOUBLE PRECISION NOT NULL DEFAULT 50,
    yes_pool_usd            DOUBLE PRECISION NOT NULL DEFAULT 0,
    no_pool_usd             DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_volume_usd        DOUBLE PRECISION NOT NULL DEFAULT 0,
    resolution_timestamp    BIGINT NOT NULL,
    creator                 TEXT NOT NULL,
    price_target            DOUBLE PRECISION,
    holder_target           INT,
    volume_target           DOUBLE PRECISION,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    resolved_at             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_predictions_token ON prediction_markets(token_mint);
CREATE INDEX IF NOT EXISTS idx_predictions_status ON prediction_markets(status);
CREATE INDEX IF NOT EXISTS idx_predictions_created ON prediction_markets(created_at DESC);

-- ── POSITIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS positions (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    trader                  TEXT NOT NULL,
    market_id               TEXT NOT NULL REFERENCES perp_markets(id),
    base_mint               TEXT NOT NULL,
    side                    TEXT NOT NULL CHECK (side IN ('Long', 'Short')),
    base_amount             DOUBLE PRECISION NOT NULL,
    notional_usdc           DOUBLE PRECISION NOT NULL,
    collateral_usdc         DOUBLE PRECISION NOT NULL,
    leverage                SMALLINT NOT NULL,
    entry_price             DOUBLE PRECISION NOT NULL,
    mark_price              DOUBLE PRECISION NOT NULL DEFAULT 0,
    liquidation_price       DOUBLE PRECISION NOT NULL,
    unrealized_pnl          DOUBLE PRECISION NOT NULL DEFAULT 0,
    unrealized_pnl_pct      DOUBLE PRECISION NOT NULL DEFAULT 0,
    funding_pnl             DOUBLE PRECISION NOT NULL DEFAULT 0,
    margin_ratio            DOUBLE PRECISION NOT NULL DEFAULT 0,
    opened_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    closed_at               TIMESTAMPTZ,
    close_price             DOUBLE PRECISION,
    realized_pnl            DOUBLE PRECISION,
    tx_sig_open             TEXT,
    tx_sig_close            TEXT
);

CREATE INDEX IF NOT EXISTS idx_positions_trader ON positions(trader, closed_at NULLS FIRST);
CREATE INDEX IF NOT EXISTS idx_positions_market ON positions(market_id, closed_at NULLS FIRST);

-- ── PROTOCOL STATS (rolling) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS protocol_stats_snapshots (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    total_volume_24h        DOUBLE PRECISION NOT NULL DEFAULT 0,
    active_markets          INT NOT NULL DEFAULT 0,
    total_oi                DOUBLE PRECISION NOT NULL DEFAULT 0,
    active_predictions      INT NOT NULL DEFAULT 0,
    total_tokens_launched   BIGINT NOT NULL DEFAULT 0,
    total_graduated         BIGINT NOT NULL DEFAULT 0,
    total_fees_collected    DOUBLE PRECISION NOT NULL DEFAULT 0,
    timestamp               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

SELECT create_hypertable('protocol_stats_snapshots', 'timestamp', if_not_exists => TRUE);

-- ── VANITY POOL (managed by backend) ──────────────────────────
-- Note: Private keys stored encrypted in Redis, not here
CREATE TABLE IF NOT EXISTS vanity_keypair_pool (
    pubkey          TEXT PRIMARY KEY,
    status          TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'consumed')),
    reserved_at     TIMESTAMPTZ,
    consumed_at     TIMESTAMPTZ,
    consumed_by_mint TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vanity_available ON vanity_keypair_pool(status) WHERE status = 'available';
