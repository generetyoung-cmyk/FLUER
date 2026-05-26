use axum::{
    extract::{Path, Query, State},
    response::Json,
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct MarketListQuery {
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub sort: Option<String>,      // volume, oi, newest, funding
    pub category: Option<String>,  // meme, defi, ai, gaming, rwa
    pub tier: Option<u8>,
}

#[derive(Debug, Deserialize)]
pub struct CandleQuery {
    pub resolution: Option<String>, // 1m, 5m, 15m, 1h, 4h, 1d
    pub from: Option<i64>,
    pub to: Option<i64>,
    pub limit: Option<u32>,
}

#[derive(Debug, Serialize)]
pub struct MarketSummary {
    pub id: String,
    pub base_mint: String,
    pub symbol: String,
    pub name: String,
    pub mark_price: f64,
    pub index_price: f64,
    pub change_24h: f64,
    pub volume_24h: f64,
    pub open_interest: f64,
    pub funding_rate_hourly: f64,
    pub next_funding_in: i64,
    pub long_oi_pct: f64,
    pub short_oi_pct: f64,
    pub tier: u8,
    pub created_at: i64,
    pub active: bool,
}

#[derive(Debug, Serialize)]
pub struct MarketDetail {
    #[serde(flatten)]
    pub summary: MarketSummary,
    pub base_asset_reserve: f64,
    pub quote_asset_reserve: f64,
    pub max_leverage: u8,
    pub taker_fee_bps: u16,
    pub maintenance_margin_bps: u16,
    pub insurance_fund_balance: f64,
    pub total_volume_all_time: f64,
    pub trade_count: u64,
    pub liquidation_count: u64,
}

#[derive(Debug, Serialize)]
pub struct CandleBar {
    pub time: i64,
    pub open: f64,
    pub high: f64,
    pub low: f64,
    pub close: f64,
    pub volume: f64,
}

#[derive(Debug, Serialize)]
pub struct RecentTrade {
    pub id: String,
    pub side: String,
    pub size_usd: f64,
    pub price: f64,
    pub trader: String,
    pub timestamp: i64,
}

#[derive(Debug, Serialize)]
pub struct OrderbookDepth {
    pub mark_price: f64,
    pub total_long_oi: f64,
    pub total_short_oi: f64,
    /// Simulated vAMM depth levels (price, cumulative_size)
    pub bids: Vec<(f64, f64)>,
    pub asks: Vec<(f64, f64)>,
}

/// GET /api/v1/markets
pub async fn list_markets(
    Query(params): Query<MarketListQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let limit = params.limit.unwrap_or(50).min(200) as i64;
    let page = params.page.unwrap_or(0) as i64;
    let offset = page * limit;
    let sort_col = match params.sort.as_deref() {
        Some("oi") => "open_interest DESC",
        Some("newest") => "created_at DESC",
        Some("funding") => "ABS(funding_rate_hourly) DESC",
        _ => "volume_24h DESC",
    };

    // Fetch from PostgreSQL with real-time price from Redis cache
    let rows = sqlx::query!(
        r#"
        SELECT
            id, base_mint, symbol, name, tier,
            mark_price, index_price,
            change_24h, volume_24h,
            long_open_interest, short_open_interest,
            funding_rate_hourly, last_funding_time,
            taker_fee_bps, created_at, active
        FROM perp_markets
        WHERE active = true
        ORDER BY volume_24h DESC
        LIMIT $1 OFFSET $2
        "#,
        limit,
        offset
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total: i64 = sqlx::query_scalar!("SELECT COUNT(*) FROM perp_markets WHERE active = true")
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or(0);

    let markets: Vec<serde_json::Value> = rows
        .into_iter()
        .map(|row| {
            let oi_total = row.long_open_interest.unwrap_or(0.0)
                + row.short_open_interest.unwrap_or(0.0);
            serde_json::json!({
                "id": row.id,
                "base_mint": row.base_mint,
                "symbol": row.symbol,
                "name": row.name,
                "tier": row.tier,
                "mark_price": row.mark_price,
                "index_price": row.index_price,
                "change_24h": row.change_24h,
                "volume_24h": row.volume_24h,
                "long_oi": row.long_open_interest,
                "short_oi": row.short_open_interest,
                "funding_rate_hourly": row.funding_rate_hourly,
                "long_oi_pct": if oi_total > 0.0 {
                    row.long_open_interest.unwrap_or(0.0) / oi_total * 100.0
                } else { 50.0 },
                "short_oi_pct": if oi_total > 0.0 {
                    row.short_open_interest.unwrap_or(0.0) / oi_total * 100.0
                } else { 50.0 },
                "created_at": row.created_at.map(|t| t.and_utc().timestamp()).unwrap_or(0),
                "active": row.active,
            })
        })
        .collect();

    Ok(Json(serde_json::json!({
        "markets": markets,
        "total": total,
        "page": page,
        "limit": limit,
    })))
}

/// GET /api/v1/markets/:market_id
pub async fn get_market(
    Path(market_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let row = sqlx::query!(
        r#"
        SELECT
            id, base_mint, symbol, name, tier,
            mark_price, index_price, change_24h,
            volume_24h, total_volume_all_time, trade_count,
            long_open_interest, short_open_interest,
            base_asset_reserve, quote_asset_reserve,
            funding_rate_hourly, last_funding_time,
            taker_fee_bps, maintenance_margin_bps,
            insurance_fund_balance, liquidation_count,
            created_at, active
        FROM perp_markets
        WHERE id = $1
        "#,
        market_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(serde_json::json!({
        "id": row.id,
        "base_mint": row.base_mint,
        "symbol": row.symbol,
        "name": row.name,
        "tier": row.tier,
        "mark_price": row.mark_price,
        "index_price": row.index_price,
        "change_24h": row.change_24h,
        "volume_24h": row.volume_24h,
        "total_volume": row.total_volume_all_time,
        "trade_count": row.trade_count,
        "long_oi": row.long_open_interest,
        "short_oi": row.short_open_interest,
        "base_reserve": row.base_asset_reserve,
        "quote_reserve": row.quote_asset_reserve,
        "funding_rate_hourly": row.funding_rate_hourly,
        "last_funding_time": row.last_funding_time.map(|t| t.and_utc().timestamp()),
        "next_funding_in": {
            let last = row.last_funding_time
                .map(|t| t.and_utc().timestamp())
                .unwrap_or(0);
            let next = last + 3600;
            let now = chrono::Utc::now().timestamp();
            (next - now).max(0)
        },
        "taker_fee_bps": row.taker_fee_bps,
        "maintenance_margin_bps": row.maintenance_margin_bps,
        "insurance_fund": row.insurance_fund_balance,
        "liquidations": row.liquidation_count,
        "created_at": row.created_at.map(|t| t.and_utc().timestamp()),
        "active": row.active,
    })))
}

/// GET /api/v1/markets/:market_id/candles
pub async fn get_candles(
    Path(market_id): Path<String>,
    Query(params): Query<CandleQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let resolution = params.resolution.as_deref().unwrap_or("1h");
    let limit = params.limit.unwrap_or(500).min(5000) as i64;
    let to = params.to.unwrap_or_else(|| chrono::Utc::now().timestamp());
    let interval_seconds: i64 = match resolution {
        "1m" => 60,
        "5m" => 300,
        "15m" => 900,
        "1h" => 3600,
        "4h" => 14400,
        "1d" => 86400,
        "1w" => 604800,
        _ => 3600,
    };
    let from = params.from.unwrap_or_else(|| to - interval_seconds * limit);

    let candles = sqlx::query!(
        r#"
        SELECT
            time_bucket($1::interval, timestamp) AS bucket,
            FIRST(open, timestamp) AS open,
            MAX(high) AS high,
            MIN(low) AS low,
            LAST(close, timestamp) AS close,
            SUM(volume_usd) AS volume
        FROM market_candles
        WHERE market_id = $2
          AND timestamp >= to_timestamp($3)
          AND timestamp <= to_timestamp($4)
        GROUP BY bucket
        ORDER BY bucket ASC
        LIMIT $5
        "#,
        format!("{} seconds", interval_seconds),
        market_id,
        from as f64,
        to as f64,
        limit
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let bars: Vec<serde_json::Value> = candles
        .into_iter()
        .map(|c| serde_json::json!({
            "time": c.bucket.map(|t| t.and_utc().timestamp()).unwrap_or(0),
            "open": c.open.unwrap_or(0.0),
            "high": c.high.unwrap_or(0.0),
            "low": c.low.unwrap_or(0.0),
            "close": c.close.unwrap_or(0.0),
            "volume": c.volume.unwrap_or(0.0),
        }))
        .collect();

    Ok(Json(serde_json::json!({
        "market_id": market_id,
        "resolution": resolution,
        "bars": bars,
    })))
}

/// GET /api/v1/markets/:market_id/trades
pub async fn get_recent_trades(
    Path(market_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let trades = sqlx::query!(
        r#"
        SELECT id, side, size_usd, price, trader, timestamp
        FROM perp_trades
        WHERE market_id = $1
        ORDER BY timestamp DESC
        LIMIT 50
        "#,
        market_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result: Vec<serde_json::Value> = trades
        .into_iter()
        .map(|t| serde_json::json!({
            "id": t.id,
            "side": t.side,
            "size_usd": t.size_usd,
            "price": t.price,
            "trader": t.trader,
            "timestamp": t.timestamp.map(|ts| ts.and_utc().timestamp()).unwrap_or(0),
        }))
        .collect();

    Ok(Json(serde_json::json!({ "trades": result })))
}

/// GET /api/v1/markets/:market_id/funding-history
pub async fn get_funding_history(
    Path(market_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let history = sqlx::query!(
        r#"
        SELECT rate_hourly, timestamp
        FROM funding_history
        WHERE market_id = $1
        ORDER BY timestamp DESC
        LIMIT 168
        "#,
        market_id
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result: Vec<serde_json::Value> = history
        .into_iter()
        .map(|h| serde_json::json!({
            "rate": h.rate_hourly,
            "timestamp": h.timestamp.map(|t| t.and_utc().timestamp()).unwrap_or(0),
        }))
        .collect();

    Ok(Json(serde_json::json!({ "history": result })))
}

/// GET /api/v1/markets/:market_id/orderbook
/// Returns simulated vAMM depth levels
pub async fn get_orderbook_depth(
    Path(market_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let market = sqlx::query!(
        "SELECT mark_price, base_asset_reserve, quote_asset_reserve,
                long_open_interest, short_open_interest
         FROM perp_markets WHERE id = $1",
        market_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let mark = market.mark_price.unwrap_or(0.0);
    let base = market.base_asset_reserve.unwrap_or(0.0);
    let quote = market.quote_asset_reserve.unwrap_or(0.0);

    // Simulate depth levels using vAMM price impact formula
    // For a given size, compute the effective price (slippage)
    let depth_levels = [100.0, 500.0, 1_000.0, 5_000.0, 10_000.0, 25_000.0, 50_000.0];
    let k = base * quote;

    let asks: Vec<serde_json::Value> = depth_levels.iter().map(|&size| {
        // new_quote = quote + size; new_base = k / new_quote
        let new_quote = quote + size;
        let new_base = if new_quote > 0.0 { k / new_quote } else { base };
        let effective_price = if (base - new_base).abs() > 1e-10 {
            size / (base - new_base)
        } else { mark };
        serde_json::json!([effective_price, size])
    }).collect();

    let bids: Vec<serde_json::Value> = depth_levels.iter().map(|&size| {
        // Sell: new_base = base + base_amount; new_quote = k / new_base
        let base_in = if mark > 0.0 { size / mark } else { 0.0 };
        let new_base = base + base_in;
        let new_quote = if new_base > 0.0 { k / new_base } else { quote };
        let sol_out = quote - new_quote;
        let effective_price = if base_in > 1e-10 { sol_out / base_in } else { mark };
        serde_json::json!([effective_price, size])
    }).collect();

    Ok(Json(serde_json::json!({
        "market_id": market_id,
        "mark_price": mark,
        "long_oi": market.long_open_interest,
        "short_oi": market.short_open_interest,
        "asks": asks,
        "bids": bids,
    })))
}
