use axum::{
    body::Body,
    extract::{ConnectInfo, State},
    http::{Request, StatusCode},
    middleware::Next,
    response::{Json, Response},
};
use redis::AsyncCommands;
use std::{net::SocketAddr, sync::Arc};
use crate::state::AppState;

/// Rate limits per tier (requests per minute)
pub const RATE_LIMIT_DEFAULT:  u64 = 120;  // 2 req/s for unauthenticated
pub const RATE_LIMIT_STAKER:   u64 = 600;  // 10 req/s for Bronze+ stakers
pub const RATE_LIMIT_GOLD:     u64 = 1800; // 30 req/s for Gold stakers
pub const RATE_LIMIT_DIAMOND:  u64 = 6000; // 100 req/s for Diamond stakers
pub const RATE_LIMIT_WINDOW_S: u64 = 60;   // 1 minute sliding window

/// Rate limiting middleware using Redis sliding window counter
pub async fn rate_limit_middleware(
    State(state): State<Arc<AppState>>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let ip = addr.ip().to_string();

    // Get rate limit for this IP (authenticated wallets get higher limits)
    let wallet = request
        .extensions()
        .get::<crate::middleware::auth::AuthenticatedWallet>()
        .map(|w| w.0.clone());

    let (limit, key_suffix) = if let Some(ref w) = wallet {
        // Authenticated — look up staking tier from Redis cache
        let tier = get_staker_tier(&state, w).await;
        match tier.as_deref() {
            Some("Diamond") => (RATE_LIMIT_DIAMOND, format!("wallet:{}", w)),
            Some("Gold")    => (RATE_LIMIT_GOLD, format!("wallet:{}", w)),
            Some("Silver") | Some("Bronze") => (RATE_LIMIT_STAKER, format!("wallet:{}", w)),
            _ => (RATE_LIMIT_STAKER, format!("wallet:{}", w)),
        }
    } else {
        (RATE_LIMIT_DEFAULT, format!("ip:{}", ip))
    };

    let redis_key = format!("fluer:ratelimit:{}", key_suffix);

    match check_rate_limit(&state, &redis_key, limit).await {
        Ok(true) => {
            // Under limit — proceed
            let response = next.run(request).await;
            Ok(response)
        }
        Ok(false) => {
            // Over limit
            Err(StatusCode::TOO_MANY_REQUESTS)
        }
        Err(_) => {
            // Redis error — fail open (don't block users if Redis is down)
            Ok(next.run(request).await)
        }
    }
}

/// Sliding window rate limit check using Redis INCR + EXPIRE
async fn check_rate_limit(
    state: &AppState,
    key: &str,
    limit: u64,
) -> Result<bool, redis::RedisError> {
    let mut conn = state.redis.clone();

    let count: u64 = conn.incr(key, 1u64).await?;

    if count == 1 {
        // First request in window — set expiry
        conn.expire(key, RATE_LIMIT_WINDOW_S as i64).await?;
    }

    Ok(count <= limit)
}

/// Look up staker tier from Redis (set by price aggregator when stakes change)
async fn get_staker_tier(state: &AppState, wallet: &str) -> Option<String> {
    let mut conn = state.redis.clone();
    let key = format!("fluer:staker_tier:{}", wallet);
    conn.get(key).await.ok()
}
