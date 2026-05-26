/// FLUER Protocol — API Gateway Service
///
/// Production-grade Rust/Axum HTTP + WebSocket server serving:
///   - REST API for market data, token listings, positions
///   - WebSocket hub for real-time price/trade/event streaming
///   - Rate limiting by $FLUER stake tier
///   - Wallet-based auth (SIWS — Sign-In With Solana)
use anyhow::Result;
use axum::{
    extract::{Path, Query, State, WebSocketUpgrade},
    extract::ws::{Message, WebSocket},
    http::{HeaderValue, Method, StatusCode},
    middleware,
    response::{IntoResponse, Json},
    routing::{get, post},
    Router,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use tokio::sync::broadcast;
use tower_http::cors::{Any, CorsLayer};
use tower_http::compression::CompressionLayer;
use tower_http::trace::TraceLayer;
use tracing::{error, info};

mod routes;
mod middleware as mw;
mod state;
mod websocket;

use state::AppState;

#[tokio::main]
async fn main() -> Result<()> {
    // Initialize structured logging
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "fluer_api=info,tower_http=debug".to_string()),
        )
        .with_target(true)
        .json()
        .init();

    info!("FLUER Protocol API Gateway starting...");

    // Initialize shared application state
    let state = Arc::new(AppState::new().await?);

    // CORS configuration — allow all origins in dev, restrict in production
    let cors = CorsLayer::new()
        .allow_origin(
            std::env::var("FRONTEND_URL")
                .unwrap_or_else(|_| "https://fluer.io".to_string())
                .parse::<HeaderValue>()
                .unwrap_or(HeaderValue::from_static("https://fluer.io")),
        )
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers(Any);

    // Build router
    let app = Router::new()
        // ── Health ──────────────────────────────────────────────
        .route("/health", get(health_check))
        .route("/version", get(version_info))

        // ── Markets ─────────────────────────────────────────────
        .route("/api/v1/markets", get(routes::markets::list_markets))
        .route("/api/v1/markets/:market_id", get(routes::markets::get_market))
        .route("/api/v1/markets/:market_id/candles", get(routes::markets::get_candles))
        .route("/api/v1/markets/:market_id/trades", get(routes::markets::get_recent_trades))
        .route("/api/v1/markets/:market_id/funding-history", get(routes::markets::get_funding_history))
        .route("/api/v1/markets/:market_id/orderbook", get(routes::markets::get_orderbook_depth))

        // ── Tokens / Launchpad ───────────────────────────────────
        .route("/api/v1/tokens", get(routes::tokens::list_tokens))
        .route("/api/v1/tokens/:ca", get(routes::tokens::get_token))
        .route("/api/v1/tokens/:ca/chart", get(routes::tokens::get_token_chart))
        .route("/api/v1/tokens/:ca/holders", get(routes::tokens::get_token_holders))
        .route("/api/v1/tokens/trending", get(routes::tokens::get_trending))

        // ── Launch ──────────────────────────────────────────────
        .route("/api/v1/launch/prepare", post(routes::launch::prepare_launch))
        .route("/api/v1/launch/upload-metadata", post(routes::launch::upload_metadata))
        .route("/api/v1/launch/vanity-keypair", post(routes::launch::get_vanity_keypair))
        .route("/api/v1/launch/estimate-fee", get(routes::launch::estimate_fee))

        // ── Predictions ─────────────────────────────────────────
        .route("/api/v1/predictions", get(routes::predictions::list_predictions))
        .route("/api/v1/predictions/:market_id", get(routes::predictions::get_prediction))
        .route("/api/v1/predictions/token/:ca", get(routes::predictions::get_predictions_for_token))

        // ── Portfolio / Positions ────────────────────────────────
        .route("/api/v1/portfolio/:wallet", get(routes::portfolio::get_portfolio))
        .route("/api/v1/positions/:wallet", get(routes::portfolio::get_positions))

        // ── Discovery ───────────────────────────────────────────
        .route("/api/v1/discover", get(routes::discovery::discover))
        .route("/api/v1/search", get(routes::discovery::search))

        // ── WebSocket ────────────────────────────────────────────
        .route("/ws", get(websocket::ws_handler))

        // ── Stats ────────────────────────────────────────────────
        .route("/api/v1/stats/protocol", get(routes::stats::protocol_stats))

        .layer(cors)
        .layer(CompressionLayer::new())
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let bind_addr = std::env::var("BIND_ADDR").unwrap_or_else(|_| "0.0.0.0:8080".to_string());
    let listener = tokio::net::TcpListener::bind(&bind_addr).await?;

    info!("FLUER API Gateway listening on {}", bind_addr);
    axum::serve(listener, app).await?;

    Ok(())
}

async fn health_check(State(state): State<Arc<AppState>>) -> impl IntoResponse {
    #[derive(Serialize)]
    struct HealthResponse {
        status: &'static str,
        version: &'static str,
        timestamp: i64,
        redis: bool,
        database: bool,
    }

    let redis_ok = state.redis_ping().await.is_ok();
    let db_ok = state.db_ping().await.is_ok();

    let status = if redis_ok && db_ok { "healthy" } else { "degraded" };
    let http_status = if redis_ok && db_ok {
        StatusCode::OK
    } else {
        StatusCode::SERVICE_UNAVAILABLE
    };

    let response = HealthResponse {
        status,
        version: env!("CARGO_PKG_VERSION"),
        timestamp: chrono::Utc::now().timestamp(),
        redis: redis_ok,
        database: db_ok,
    };

    (http_status, Json(response))
}

async fn version_info() -> impl IntoResponse {
    #[derive(Serialize)]
    struct VersionInfo {
        name: &'static str,
        version: &'static str,
        protocol: &'static str,
        chain: &'static str,
        network: String,
    }

    Json(VersionInfo {
        name: "FLUER Protocol API",
        version: env!("CARGO_PKG_VERSION"),
        protocol: "FLUER v1.0",
        chain: "Solana",
        network: std::env::var("SOLANA_CLUSTER").unwrap_or_else(|_| "mainnet-beta".to_string()),
    })
}
