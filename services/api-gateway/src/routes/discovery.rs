use axum::{
    extract::{Path, Query, State},
    response::Json,
    http::StatusCode,
};
use serde::Deserialize;
use std::sync::Arc;
use crate::state::AppState;

// ── DISCOVERY ─────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct DiscoverQuery {
    pub tab:      Option<String>,
    pub category: Option<String>,
    pub sort:     Option<String>,
    pub page:     Option<u32>,
    pub limit:    Option<u32>,
}

pub async fn discover(
    Query(params): Query<DiscoverQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let limit  = params.limit.unwrap_or(50).min(100) as i64;
    let offset = (params.page.unwrap_or(0) as i64) * limit;
    let tab    = params.tab.as_deref().unwrap_or("trending");

    let (order_by, extra_where) = match tab {
        "new"         => ("created_at DESC", "created_at > NOW() - INTERVAL '24 hours'"),
        "graduated"   => ("graduated_at DESC", "graduated = true"),
        "high_volume" => ("volume_24h_usd DESC", "volume_24h_usd > 100"),
        _             => ("volume_24h_usd DESC", "1=1"),   // trending
    };

    let rows = sqlx::query!(
        r#"
        SELECT mint, name, symbol, image_url, price_usd,
               change_24h, volume_24h_usd, market_cap_usd,
               holder_count, real_sol_reserves, graduated, category,
               created_at
        FROM token_listings
        ORDER BY volume_24h_usd DESC
        LIMIT $1 OFFSET $2
        "#,
        limit,
        offset
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let tokens: Vec<serde_json::Value> = rows.into_iter().map(|r| {
        let threshold = 85_000_000_000i64;
        let real = r.real_sol_reserves.unwrap_or(0);
        let progress = (real * 100 / threshold.max(1)).min(100) as f64;

        serde_json::json!({
            "mint":                 r.mint,
            "name":                 r.name,
            "symbol":               r.symbol,
            "image_url":            r.image_url,
            "price_usd":            r.price_usd,
            "change_24h":           r.change_24h,
            "volume_24h_usd":       r.volume_24h_usd,
            "market_cap_usd":       r.market_cap_usd,
            "holder_count":         r.holder_count,
            "real_sol_reserves":    r.real_sol_reserves,
            "graduation_progress_pct": progress,
            "graduated":            r.graduated.unwrap_or(false),
            "category":             r.category,
            "created_at":           r.created_at.map(|t| t.and_utc().timestamp()).unwrap_or(0),
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "tokens": tokens,
        "markets": [],   // Perp markets returned separately via /markets
        "total": tokens.len(),
        "tab": tab,
    })))
}

// ── SEARCH ────────────────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct SearchQuery {
    pub q: String,
}

pub async fn search(
    Query(params): Query<SearchQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let q = format!("%{}%", params.q.to_lowercase());

    let tokens = sqlx::query!(
        r#"
        SELECT mint, name, symbol, image_url, price_usd, change_24h, graduated
        FROM token_listings
        WHERE LOWER(name) LIKE $1 OR LOWER(symbol) LIKE $1
           OR mint = $2
        ORDER BY volume_24h_usd DESC
        LIMIT 10
        "#,
        q,
        params.q
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let markets = sqlx::query!(
        r#"
        SELECT id, symbol, name, mark_price, change_24h, volume_24h
        FROM perp_markets
        WHERE LOWER(symbol) LIKE $1 OR base_mint = $2
        LIMIT 5
        "#,
        q,
        params.q
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    Ok(Json(serde_json::json!({
        "tokens": tokens.into_iter().map(|r| serde_json::json!({
            "mint": r.mint, "name": r.name, "symbol": r.symbol,
            "image_url": r.image_url, "price_usd": r.price_usd,
            "change_24h": r.change_24h, "graduated": r.graduated,
        })).collect::<Vec<_>>(),
        "markets": markets.into_iter().map(|r| serde_json::json!({
            "id": r.id, "symbol": r.symbol, "name": r.name,
            "mark_price": r.mark_price, "change_24h": r.change_24h,
            "volume_24h": r.volume_24h,
        })).collect::<Vec<_>>(),
        "predictions": [],
    })))
}

// ── PROTOCOL STATS ────────────────────────────────────────────

pub async fn protocol_stats(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // Try Redis cache first (updated by indexer every 30s)
    use redis::AsyncCommands;
    let mut conn = state.redis.clone();

    if let Ok(cached) = conn.get::<_, String>("fluer:stats:latest").await {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(&cached) {
            return Ok(Json(v));
        }
    }

    // Fallback: compute from DB
    let volume_24h: f64 = sqlx::query_scalar!(
        "SELECT COALESCE(SUM(volume_24h), 0.0) FROM perp_markets WHERE active = true"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(Some(0.0))
    .unwrap_or(0.0);

    let active_markets: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM perp_markets WHERE active = true"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);

    let total_oi: f64 = sqlx::query_scalar!(
        "SELECT COALESCE(SUM(long_open_interest + short_open_interest), 0.0) FROM perp_markets"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(Some(0.0))
    .unwrap_or(0.0);

    let active_predictions: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM prediction_markets WHERE status = 'Active'"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);

    let total_tokens: i64 = sqlx::query_scalar!("SELECT COUNT(*) FROM token_listings")
        .fetch_one(&state.db)
        .await
        .unwrap_or(Some(0))
        .unwrap_or(0);

    let total_graduated: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM token_listings WHERE graduated = true"
    )
    .fetch_one(&state.db)
    .await
    .unwrap_or(Some(0))
    .unwrap_or(0);

    let stats = serde_json::json!({
        "total_volume_24h":     volume_24h,
        "active_markets":       active_markets,
        "total_oi":             total_oi,
        "active_predictions":   active_predictions,
        "total_tokens_launched": total_tokens,
        "total_graduated":      total_graduated,
        "total_fees_collected": 0.0,  // TODO: sum from fee events
        "timestamp":            chrono::Utc::now().timestamp(),
    });

    // Cache for 30s
    let _: () = conn
        .set_ex("fluer:stats:latest", stats.to_string(), 30)
        .await
        .unwrap_or(());

    Ok(Json(stats))
}

// ── PORTFOLIO ─────────────────────────────────────────────────

pub async fn get_portfolio(
    Path(wallet): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let positions = sqlx::query!(
        r#"
        SELECT p.id, p.market_id, m.symbol, p.side, p.base_amount,
               p.notional_usdc, p.collateral_usdc, p.leverage,
               p.entry_price, p.liquidation_price,
               p.unrealized_pnl, p.unrealized_pnl_pct,
               p.funding_pnl, p.opened_at
        FROM positions p
        JOIN perp_markets m ON m.id = p.market_id
        WHERE p.trader = $1 AND p.closed_at IS NULL
        ORDER BY p.opened_at DESC
        "#,
        wallet
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total_unrealized_pnl: f64 = positions
        .iter()
        .map(|p| p.unrealized_pnl.unwrap_or(0.0))
        .sum();

    let total_collateral: f64 = positions
        .iter()
        .map(|p| p.collateral_usdc.unwrap_or(0.0))
        .sum();

    Ok(Json(serde_json::json!({
        "wallet": wallet,
        "total_collateral_usdc": total_collateral,
        "total_unrealized_pnl": total_unrealized_pnl,
        "position_count": positions.len(),
    })))
}

pub async fn get_positions(
    Path(wallet): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let positions = sqlx::query!(
        r#"
        SELECT p.id, p.market_id, m.symbol, m.name, p.side,
               p.base_amount, p.notional_usdc, p.collateral_usdc,
               p.leverage, p.entry_price, m.mark_price AS current_price,
               p.liquidation_price, p.unrealized_pnl, p.unrealized_pnl_pct,
               p.funding_pnl, p.margin_ratio, p.opened_at
        FROM positions p
        JOIN perp_markets m ON m.id = p.market_id
        WHERE p.trader = $1 AND p.closed_at IS NULL
        ORDER BY p.opened_at DESC
        "#,
        wallet
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result: Vec<serde_json::Value> = positions.into_iter().map(|p| serde_json::json!({
        "id":               p.id,
        "market_id":        p.market_id,
        "market_symbol":    p.symbol,
        "side":             p.side,
        "base_amount":      p.base_amount,
        "notional_usdc":    p.notional_usdc,
        "collateral_usdc":  p.collateral_usdc,
        "leverage":         p.leverage,
        "entry_price":      p.entry_price,
        "mark_price":       p.current_price,
        "liquidation_price": p.liquidation_price,
        "unrealized_pnl":   p.unrealized_pnl,
        "unrealized_pnl_pct": p.unrealized_pnl_pct,
        "funding_pnl":      p.funding_pnl,
        "margin_ratio":     p.margin_ratio,
        "opened_at":        p.opened_at.map(|t| t.and_utc().timestamp()).unwrap_or(0),
    })).collect();

    Ok(Json(serde_json::json!({ "positions": result })))
}

// Alias to match router bindings
pub use self::protocol_stats as stats_handler;
