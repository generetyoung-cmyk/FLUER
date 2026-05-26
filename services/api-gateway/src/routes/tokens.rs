use axum::{
    extract::{Path, Query, State},
    response::Json,
    http::StatusCode,
};
use serde::Deserialize;
use std::sync::Arc;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct TokenListQuery {
    pub page: Option<u32>,
    pub limit: Option<u32>,
    pub sort: Option<String>,     // trending | newest | volume | market_cap
    pub category: Option<String>,
    pub graduated: Option<bool>,
}

#[derive(Debug, Deserialize)]
pub struct ChartQuery {
    pub resolution: Option<String>,
    pub from: Option<i64>,
    pub to: Option<i64>,
    pub limit: Option<u32>,
}

/// GET /api/v1/tokens
pub async fn list_tokens(
    Query(params): Query<TokenListQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let limit  = params.limit.unwrap_or(50).min(200) as i64;
    let offset = (params.page.unwrap_or(0) as i64) * limit;

    let sort_col = match params.sort.as_deref() {
        Some("newest")      => "created_at DESC",
        Some("market_cap")  => "market_cap_usd DESC",
        Some("volume")      => "volume_24h_usd DESC",
        Some("change")      => "change_24h DESC",
        _                   => "volume_24h_usd DESC",
    };

    // Build dynamic WHERE clause
    let mut conditions = vec!["1=1"];
    if params.graduated == Some(true) {
        conditions.push("graduated = true");
    } else if params.graduated == Some(false) {
        conditions.push("graduated = false");
    }
    if params.category.is_some() {
        conditions.push("category = $3");
    }

    let rows = sqlx::query!(
        r#"
        SELECT
            mint, creator, name, symbol, description,
            image_url, metadata_uri, category,
            virtual_sol_reserves, virtual_token_reserves,
            real_sol_reserves, tokens_sold, total_supply,
            price_sol, price_usd, market_cap_usd,
            holder_count, volume_24h_usd,
            buy_count, sell_count,
            change_1h, change_24h,
            graduated, graduated_at, perp_market_id,
            website, twitter, telegram,
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

    let total: i64 = sqlx::query_scalar!("SELECT COUNT(*) FROM token_listings")
        .fetch_one(&state.db)
        .await
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
        .unwrap_or(0);

    let tokens: Vec<serde_json::Value> = rows.into_iter().map(|r| {
        let grad_progress = if !r.graduated.unwrap_or(false) {
            let threshold = 85_000_000_000i64;
            let real = r.real_sol_reserves.unwrap_or(0);
            (real * 100 / threshold.max(1)).min(100) as f64
        } else { 100.0 };

        serde_json::json!({
            "mint": r.mint,
            "creator": r.creator,
            "name": r.name,
            "symbol": r.symbol,
            "description": r.description,
            "image_url": r.image_url,
            "metadata_uri": r.metadata_uri,
            "category": r.category,
            "virtual_sol_reserves": r.virtual_sol_reserves,
            "virtual_token_reserves": r.virtual_token_reserves,
            "real_sol_reserves": r.real_sol_reserves,
            "tokens_sold": r.tokens_sold,
            "total_supply": r.total_supply,
            "price_sol": r.price_sol,
            "price_usd": r.price_usd,
            "market_cap_usd": r.market_cap_usd,
            "graduation_progress_pct": grad_progress,
            "graduation_threshold_sol": 85_000_000_000i64,
            "holder_count": r.holder_count,
            "volume_24h_usd": r.volume_24h_usd,
            "buy_count": r.buy_count,
            "sell_count": r.sell_count,
            "change_1h": r.change_1h,
            "change_24h": r.change_24h,
            "graduated": r.graduated.unwrap_or(false),
            "graduated_at": r.graduated_at.map(|t| t.and_utc().timestamp()),
            "perp_market_id": r.perp_market_id,
            "website": r.website,
            "twitter": r.twitter,
            "telegram": r.telegram,
            "created_at": r.created_at.map(|t| t.and_utc().timestamp()).unwrap_or(0),
        })
    }).collect();

    Ok(Json(serde_json::json!({
        "tokens": tokens,
        "total": total,
        "limit": limit,
        "offset": offset,
    })))
}

/// GET /api/v1/tokens/:ca
pub async fn get_token(
    Path(ca): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let row = sqlx::query!(
        r#"
        SELECT
            mint, creator, name, symbol, description,
            image_url, metadata_uri, category,
            virtual_sol_reserves, virtual_token_reserves,
            real_sol_reserves, tokens_sold, total_supply,
            price_sol, price_usd, market_cap_usd,
            holder_count, volume_24h_usd, total_volume_usd,
            buy_count, sell_count,
            change_1h, change_24h,
            graduated, graduated_at, perp_market_id,
            website, twitter, telegram, created_at
        FROM token_listings
        WHERE mint = $1
        "#,
        ca
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    let grad_progress = if !row.graduated.unwrap_or(false) {
        let threshold = 85_000_000_000i64;
        let real = row.real_sol_reserves.unwrap_or(0);
        (real * 100 / threshold.max(1)).min(100) as f64
    } else { 100.0 };

    Ok(Json(serde_json::json!({
        "mint": row.mint,
        "creator": row.creator,
        "name": row.name,
        "symbol": row.symbol,
        "description": row.description,
        "image_url": row.image_url,
        "metadata_uri": row.metadata_uri,
        "category": row.category,
        "virtual_sol_reserves": row.virtual_sol_reserves,
        "virtual_token_reserves": row.virtual_token_reserves,
        "real_sol_reserves": row.real_sol_reserves,
        "tokens_sold": row.tokens_sold,
        "total_supply": row.total_supply,
        "price_sol": row.price_sol,
        "price_usd": row.price_usd,
        "market_cap_usd": row.market_cap_usd,
        "graduation_progress_pct": grad_progress,
        "graduation_threshold_sol": 85_000_000_000i64,
        "holder_count": row.holder_count,
        "volume_24h_usd": row.volume_24h_usd,
        "total_volume_usd": row.total_volume_usd,
        "buy_count": row.buy_count,
        "sell_count": row.sell_count,
        "change_1h": row.change_1h,
        "change_24h": row.change_24h,
        "graduated": row.graduated.unwrap_or(false),
        "graduated_at": row.graduated_at.map(|t| t.and_utc().timestamp()),
        "perp_market_id": row.perp_market_id,
        "website": row.website,
        "twitter": row.twitter,
        "telegram": row.telegram,
        "created_at": row.created_at.map(|t| t.and_utc().timestamp()).unwrap_or(0),
    })))
}

/// GET /api/v1/tokens/:ca/chart
pub async fn get_token_chart(
    Path(ca): Path<String>,
    Query(params): Query<ChartQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let resolution  = params.resolution.as_deref().unwrap_or("1h");
    let limit       = params.limit.unwrap_or(500).min(5000) as i64;
    let to          = params.to.unwrap_or_else(|| chrono::Utc::now().timestamp());
    let interval_s: i64 = match resolution {
        "1m"  => 60,
        "5m"  => 300,
        "15m" => 900,
        "1h"  => 3600,
        "4h"  => 14400,
        "1d"  => 86400,
        _     => 3600,
    };
    let from = params.from.unwrap_or(to - interval_s * limit);

    let bars = sqlx::query!(
        r#"
        SELECT
            time_bucket($1::interval, timestamp) AS bucket,
            FIRST(open, timestamp) AS open,
            MAX(high) AS high,
            MIN(low) AS low,
            LAST(close, timestamp) AS close,
            SUM(volume_sol) AS volume
        FROM token_candles
        WHERE mint = $2
          AND timestamp >= to_timestamp($3)
          AND timestamp <= to_timestamp($4)
        GROUP BY bucket
        ORDER BY bucket ASC
        LIMIT $5
        "#,
        format!("{} seconds", interval_s),
        ca,
        from as f64,
        to as f64,
        limit,
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result: Vec<serde_json::Value> = bars.into_iter().map(|b| serde_json::json!({
        "time":   b.bucket.map(|t| t.and_utc().timestamp()).unwrap_or(0),
        "open":   b.open.unwrap_or(0.0),
        "high":   b.high.unwrap_or(0.0),
        "low":    b.low.unwrap_or(0.0),
        "close":  b.close.unwrap_or(0.0),
        "volume": b.volume.unwrap_or(0.0),
    })).collect();

    Ok(Json(serde_json::json!({ "mint": ca, "resolution": resolution, "bars": result })))
}

/// GET /api/v1/tokens/:ca/holders
pub async fn get_token_holders(
    Path(ca): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // In production: query Helius DAS API for token holder list
    let helius_url = format!(
        "https://mainnet.helius-rpc.com/?api-key={}",
        state.config.helius_api_key
    );

    let body = serde_json::json!({
        "jsonrpc": "2.0",
        "id": "fluer-holders",
        "method": "getTokenAccounts",
        "params": {
            "mint": ca,
            "limit": 20,
            "options": { "showZeroBalance": false }
        }
    });

    let resp = state
        .http_client
        .post(&helius_url)
        .json(&body)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let data: serde_json::Value = resp.json().await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    Ok(Json(serde_json::json!({
        "mint": ca,
        "holders": data["result"]["token_accounts"],
        "total": data["result"]["total"],
    })))
}

/// GET /api/v1/tokens/trending
pub async fn get_trending(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    // Trending = highest buy_count in last hour with significant volume
    let rows = sqlx::query!(
        r#"
        SELECT mint, name, symbol, image_url, price_usd,
               change_24h, volume_24h_usd, market_cap_usd,
               holder_count, graduated
        FROM token_listings
        WHERE created_at > NOW() - INTERVAL '24 hours'
           OR volume_24h_usd > 1000
        ORDER BY (buy_count + volume_24h_usd / 100.0) DESC
        LIMIT 20
        "#
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let tokens: Vec<serde_json::Value> = rows.into_iter().map(|r| serde_json::json!({
        "mint": r.mint,
        "name": r.name,
        "symbol": r.symbol,
        "image_url": r.image_url,
        "price_usd": r.price_usd,
        "change_24h": r.change_24h,
        "volume_24h_usd": r.volume_24h_usd,
        "market_cap_usd": r.market_cap_usd,
        "holder_count": r.holder_count,
        "graduated": r.graduated.unwrap_or(false),
    })).collect();

    Ok(Json(serde_json::json!({ "tokens": tokens })))
}
