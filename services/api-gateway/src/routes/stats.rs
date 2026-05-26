use axum::{extract::State, response::Json, http::StatusCode};
use std::sync::Arc;
use crate::state::AppState;

pub async fn protocol_stats(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    crate::routes::discovery::protocol_stats(State(state)).await
}
