// ── predictions.rs ────────────────────────────────────────────
use axum::{extract::{Path, Query, State}, response::Json, http::StatusCode};
use serde::Deserialize;
use std::sync::Arc;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct PredictionListQuery {
    pub page:   Option<u32>,
    pub limit:  Option<u32>,
    pub status: Option<String>,
    pub token:  Option<String>,
}

pub async fn list_predictions(
    Query(params): Query<PredictionListQuery>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let limit  = params.limit.unwrap_or(50).min(100) as i64;
    let offset = (params.page.unwrap_or(0) as i64) * limit;
    let status = params.status.unwrap_or_else(|| "Active".to_string());

    let rows = sqlx::query!(
        r#"
        SELECT id, token_mint, token_name, token_symbol, token_image,
               type AS prediction_type, title, description,
               status, outcome,
               yes_probability, no_probability,
               yes_pool_usd, no_pool_usd, total_volume_usd,
               resolution_timestamp, creator, created_at,
               price_target, holder_target, volume_target
        FROM prediction_markets
        WHERE status = $1
        ORDER BY total_volume_usd DESC
        LIMIT $2 OFFSET $3
        "#,
        status, limit, offset
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let total: i64 = sqlx::query_scalar!(
        "SELECT COUNT(*) FROM prediction_markets WHERE status = $1", status
    )
    .fetch_one(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .unwrap_or(0);

    let predictions: Vec<serde_json::Value> = rows.into_iter().map(|r| serde_json::json!({
        "id": r.id,
        "token_mint": r.token_mint,
        "token_name": r.token_name,
        "token_symbol": r.token_symbol,
        "token_image": r.token_image,
        "type": r.prediction_type,
        "title": r.title,
        "description": r.description,
        "status": r.status,
        "outcome": r.outcome,
        "yes_probability": r.yes_probability,
        "no_probability": r.no_probability,
        "yes_pool_usd": r.yes_pool_usd,
        "no_pool_usd": r.no_pool_usd,
        "total_volume_usd": r.total_volume_usd,
        "resolution_timestamp": r.resolution_timestamp,
        "creator": r.creator,
        "created_at": r.created_at.map(|t| t.and_utc().timestamp()).unwrap_or(0),
        "price_target": r.price_target,
        "holder_target": r.holder_target,
        "volume_target": r.volume_target,
    })).collect();

    Ok(Json(serde_json::json!({
        "predictions": predictions,
        "total": total,
    })))
}

pub async fn get_prediction(
    Path(market_id): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let r = sqlx::query!(
        "SELECT * FROM prediction_markets WHERE id = $1",
        market_id
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?
    .ok_or(StatusCode::NOT_FOUND)?;

    Ok(Json(serde_json::json!({
        "id": r.id,
        "token_mint": r.token_mint,
        "token_name": r.token_name,
        "token_symbol": r.token_symbol,
        "token_image": r.token_image,
        "type": r.r#type,
        "title": r.title,
        "description": r.description,
        "status": r.status,
        "outcome": r.outcome,
        "yes_probability": r.yes_probability,
        "no_probability": r.no_probability,
        "yes_pool_usd": r.yes_pool_usd,
        "no_pool_usd": r.no_pool_usd,
        "total_volume_usd": r.total_volume_usd,
        "resolution_timestamp": r.resolution_timestamp,
        "creator": r.creator,
        "price_target": r.price_target,
    })))
}

pub async fn get_predictions_for_token(
    Path(ca): Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let rows = sqlx::query!(
        r#"
        SELECT id, type AS prediction_type, title,
               status, outcome, yes_probability, no_probability,
               yes_pool_usd, no_pool_usd, total_volume_usd,
               resolution_timestamp
        FROM prediction_markets
        WHERE token_mint = $1
        ORDER BY total_volume_usd DESC
        LIMIT 10
        "#,
        ca
    )
    .fetch_all(&state.db)
    .await
    .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;

    let result: Vec<serde_json::Value> = rows.into_iter().map(|r| serde_json::json!({
        "id": r.id,
        "type": r.prediction_type,
        "title": r.title,
        "status": r.status,
        "outcome": r.outcome,
        "yes_probability": r.yes_probability,
        "no_probability": r.no_probability,
        "yes_pool_usd": r.yes_pool_usd,
        "no_pool_usd": r.no_pool_usd,
        "total_volume_usd": r.total_volume_usd,
        "resolution_timestamp": r.resolution_timestamp,
    })).collect();

    Ok(Json(serde_json::json!({ "predictions": result })))
}
