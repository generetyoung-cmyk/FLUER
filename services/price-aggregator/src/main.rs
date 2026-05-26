/// FLUER Price Aggregator Service
///
/// Aggregates prices from multiple sources:
///   1. Pyth Network hermes REST API (for SOL, established tokens)
///   2. GeckoTerminal API (for graduated tokens on Raydium)
///   3. On-chain bonding curve reserves (for pre-graduation tokens)
///
/// Updates perp market mark prices, index prices, and funding rates every second.
use anyhow::Result;
use tracing::{error, info, warn};

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "price_aggregator=info".to_string())
        )
        .json()
        .init();

    info!("FLUER Price Aggregator starting...");

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let db = sqlx::PgPool::connect(&db_url).await?;

    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let redis = redis::Client::open(redis_url)?;
    let redis_conn = redis::aio::ConnectionManager::new(redis).await?;

    let http = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()?;

    let pyth_url = std::env::var("PYTH_ENDPOINT")
        .unwrap_or_else(|_| "https://hermes.pyth.network".to_string());

    info!("Price aggregator running");

    // Run price update loop
    let mut interval = tokio::time::interval(std::time::Duration::from_secs(1));
    let mut funding_interval = tokio::time::interval(std::time::Duration::from_secs(3600)); // 1 hour

    loop {
        tokio::select! {
            _ = interval.tick() => {
                if let Err(e) = update_prices(&db, &redis_conn, &http, &pyth_url).await {
                    error!("Price update error: {}", e);
                }
            }
            _ = funding_interval.tick() => {
                if let Err(e) = settle_funding(&db, &redis_conn).await {
                    error!("Funding settlement error: {}", e);
                }
            }
        }
    }
}

/// Fetch all active perp markets and update their prices
async fn update_prices(
    db: &sqlx::PgPool,
    redis: &redis::aio::ConnectionManager,
    http: &reqwest::Client,
    pyth_url: &str,
) -> Result<()> {
    use redis::AsyncCommands;
    let mut conn = redis.clone();

    // Fetch active markets with their oracle addresses
    let markets = sqlx::query!(
        "SELECT id, base_mint, symbol, oracle, mark_price FROM perp_markets WHERE active = true"
    )
    .fetch_all(db)
    .await?;

    if markets.is_empty() {
        return Ok(());
    }

    // Collect Pyth feed IDs for batch fetch
    let pyth_ids: Vec<String> = markets
        .iter()
        .filter_map(|m| m.oracle.clone())
        .collect();

    let pyth_prices = if !pyth_ids.is_empty() {
        fetch_pyth_prices(http, pyth_url, &pyth_ids).await
            .unwrap_or_default()
    } else {
        std::collections::HashMap::new()
    };

    // Update each market
    for market in &markets {
        let new_price = if let Some(oracle) = &market.oracle {
            pyth_prices.get(oracle).copied()
        } else {
            // Fallback: fetch from GeckoTerminal for graduated token
            fetch_gecko_price(http, &market.base_mint).await.ok()
        };

        if let Some(price) = new_price {
            let old_price = market.mark_price.unwrap_or(0.0);
            let change_24h = calculate_24h_change(db, &market.id, price).await?;

            // Update DB
            sqlx::query!(
                r#"
                UPDATE perp_markets
                SET mark_price = $1, index_price = $2, change_24h = $3
                WHERE id = $4
                "#,
                price, price, change_24h, market.id
            )
            .execute(db)
            .await?;

            // Publish to Redis for WebSocket broadcasting
            let event = serde_json::json!({
                "type": "PRICE_UPDATE",
                "market_id": market.id,
                "price": price,
                "change_24h": change_24h,
                "volume_24h": 0.0,
                "timestamp": chrono::Utc::now().timestamp(),
            });

            let _: () = conn
                .publish("fluer:prices", event.to_string())
                .await
                .unwrap_or(());

            // Also cache in Redis (1 minute TTL)
            let key = format!("fluer:price:{}", market.id);
            let _: () = conn
                .set_ex(&key, price.to_string(), 60)
                .await
                .unwrap_or(());
        }
    }

    Ok(())
}

/// Fetch prices from Pyth Hermes API (batch endpoint)
async fn fetch_pyth_prices(
    http: &reqwest::Client,
    base_url: &str,
    feed_ids: &[String],
) -> Result<std::collections::HashMap<String, f64>> {
    let ids_param = feed_ids
        .iter()
        .map(|id| format!("ids[]={}", id))
        .collect::<Vec<_>>()
        .join("&");

    let url = format!("{}/v2/updates/price/latest?{}", base_url, ids_param);

    let resp: serde_json::Value = http
        .get(&url)
        .send()
        .await?
        .json()
        .await?;

    let mut prices = std::collections::HashMap::new();

    if let Some(parsed) = resp["parsed"].as_array() {
        for item in parsed {
            if let (Some(id), Some(price_obj)) = (
                item["id"].as_str(),
                item["price"].as_object(),
            ) {
                if let (Some(price_str), Some(expo)) = (
                    price_obj["price"].as_str(),
                    price_obj["expo"].as_i64(),
                ) {
                    if let Ok(price_raw) = price_str.parse::<i64>() {
                        let price = price_raw as f64 * 10f64.powi(expo as i32);
                        prices.insert(id.to_string(), price);
                    }
                }
            }
        }
    }

    Ok(prices)
}

/// Fetch price from GeckoTerminal for a Solana token mint
async fn fetch_gecko_price(http: &reqwest::Client, mint: &str) -> Result<f64> {
    let url = format!(
        "https://api.geckoterminal.com/api/v2/networks/solana/tokens/{}/pools?page=1",
        mint
    );

    let resp: serde_json::Value = http
        .get(&url)
        .header("Accept", "application/json;version=20230302")
        .send()
        .await?
        .json()
        .await?;

    // Take first pool's base_token_price_usd
    let price = resp["data"]
        .as_array()
        .and_then(|pools| pools.first())
        .and_then(|p| p["attributes"]["base_token_price_usd"].as_str())
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    Ok(price)
}

/// Calculate 24h price change percentage
async fn calculate_24h_change(
    db: &sqlx::PgPool,
    market_id: &str,
    current_price: f64,
) -> Result<f64> {
    let price_24h_ago: Option<f64> = sqlx::query_scalar!(
        r#"
        SELECT close
        FROM market_candles
        WHERE market_id = $1
          AND timestamp <= NOW() - INTERVAL '24 hours'
        ORDER BY timestamp DESC
        LIMIT 1
        "#,
        market_id
    )
    .fetch_optional(db)
    .await
    .ok()
    .flatten();

    Ok(if let Some(old) = price_24h_ago {
        if old > 0.0 {
            ((current_price - old) / old) * 100.0
        } else {
            0.0
        }
    } else {
        0.0
    })
}

/// Hourly funding rate settlement
async fn settle_funding(
    db: &sqlx::PgPool,
    redis: &redis::aio::ConnectionManager,
) -> Result<()> {
    info!("Settling funding rates...");

    let markets = sqlx::query!(
        "SELECT id, mark_price, index_price, long_open_interest, short_open_interest
         FROM perp_markets WHERE active = true"
    )
    .fetch_all(db)
    .await?;

    for market in markets {
        let mark = market.mark_price.unwrap_or(0.0);
        let index = market.index_price.unwrap_or(0.0);

        if index == 0.0 {
            continue;
        }

        // funding_rate = clamp((mark - index) / index, -0.3%, +0.3%) / 24
        let raw_rate = (mark - index) / index;
        let clamped = raw_rate.clamp(-0.003, 0.003);
        let hourly_rate = clamped / 24.0;

        // Update market funding rate
        sqlx::query!(
            r#"
            UPDATE perp_markets
            SET funding_rate_hourly = $1, last_funding_time = NOW()
            WHERE id = $2
            "#,
            hourly_rate,
            market.id
        )
        .execute(db)
        .await?;

        // Record in history
        sqlx::query!(
            r#"
            INSERT INTO funding_history (market_id, rate_hourly, mark_price, index_price)
            VALUES ($1, $2, $3, $4)
            "#,
            market.id,
            hourly_rate,
            mark,
            index,
        )
        .execute(db)
        .await?;

        // Apply funding to open positions
        apply_funding_to_positions(db, &market.id, hourly_rate).await?;
    }

    info!("Funding settlement complete");
    Ok(())
}

/// Apply funding payments to all open positions in a market
async fn apply_funding_to_positions(
    db: &sqlx::PgPool,
    market_id: &str,
    hourly_rate: f64,
) -> Result<()> {
    // Positive funding: longs pay shorts
    // Negative funding: shorts pay longs
    sqlx::query!(
        r#"
        UPDATE positions
        SET funding_pnl = funding_pnl + CASE
            WHEN side = 'Long'  THEN -(notional_usdc * $1)
            WHEN side = 'Short' THEN  (notional_usdc * $1)
            ELSE 0
        END
        WHERE market_id = $2 AND closed_at IS NULL
        "#,
        hourly_rate,
        market_id
    )
    .execute(db)
    .await?;

    Ok(())
}
