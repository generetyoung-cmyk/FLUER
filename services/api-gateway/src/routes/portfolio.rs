use axum::{extract::{Path, State}, response::Json, http::StatusCode};
use std::sync::Arc;
use crate::state::AppState;

pub async fn get_portfolio(
    path: Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    crate::routes::discovery::get_portfolio(path, State(state)).await
}

pub async fn get_positions(
    path: Path<String>,
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    crate::routes::discovery::get_positions(path, State(state)).await
}
