use anyhow::Result;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use sqlx::PgPool;
use std::time::Duration;
use tracing::{info, warn, error};

/// Poll PostgreSQL for tokens that graduated but have no perp market yet,
/// then dispatch market creation.
///
/// In production: replace polling with Yellowstone gRPC GraduationEvent subscription.
pub async fn run_monitor(
    rpc_url: &str,
    db: &PgPool,
    perp_program: &Pubkey,
) -> Result<()> {
    let rpc = RpcClient::new(rpc_url.to_string());

    info!("Graduation monitor active — polling every 30s");

    loop {
        if let Err(e) = check_and_deploy_markets(db, &rpc, perp_program).await {
            error!("Market deployment error: {}", e);
        }
        tokio::time::sleep(Duration::from_secs(30)).await;
    }
}

async fn check_and_deploy_markets(
    db: &PgPool,
    rpc: &RpcClient,
    perp_program: &Pubkey,
) -> Result<()> {
    // Find tokens that graduated but don't have a perp market yet
    let pending = sqlx::query!(
        r#"
        SELECT mint, name, symbol, price_usd, volume_24h_usd, holder_count
        FROM token_listings
        WHERE graduated = true
          AND perp_market_id IS NULL
          AND created_at < NOW() - INTERVAL '1 hour'
        LIMIT 10
        "#
    )
    .fetch_all(db)
    .await?;

    for token in pending {
        info!("Deploying perp market for graduated token: {} ({})", token.symbol, token.mint);

        match deploy_perp_market(db, rpc, perp_program, &token.mint, &token.symbol, token.price_usd.unwrap_or(0.0)).await {
            Ok(market_id) => {
                // Update token_listings with perp_market_id
                sqlx::query!(
                    "UPDATE token_listings SET perp_market_id = $1 WHERE mint = $2",
                    market_id,
                    token.mint
                )
                .execute(db)
                .await?;

                // Insert perp market record
                sqlx::query!(
                    r#"
                    INSERT INTO perp_markets
                        (id, base_mint, symbol, name, tier, mark_price, index_price,
                         taker_fee_bps, maintenance_margin_bps, active)
                    VALUES
                        ($1, $2, $3, $4, 1, $5, $5, 10, 625, true)
                    ON CONFLICT (id) DO NOTHING
                    "#,
                    market_id,
                    token.mint,
                    format!("{}-PERP", token.symbol),
                    format!("{} Perpetual", token.symbol),
                    token.price_usd.unwrap_or(0.0),
                )
                .execute(db)
                .await?;

                // Auto-create price target prediction markets
                create_auto_predictions(db, &token.mint, &token.symbol, token.price_usd.unwrap_or(0.0)).await?;

                info!("Perp market deployed: {} for {}", market_id, token.symbol);
            }
            Err(e) => {
                error!("Failed to deploy market for {}: {}", token.symbol, e);
            }
        }
    }

    Ok(())
}

/// Deploy a new perpetual market via Anchor CPI
/// Returns the market ID (base_mint + "-PERP")
async fn deploy_perp_market(
    db: &PgPool,
    rpc: &RpcClient,
    perp_program: &Pubkey,
    base_mint: &str,
    symbol: &str,
    spot_price: f64,
) -> Result<String> {
    let market_id = format!("{}-PERP", symbol);

    // In production:
    // 1. Load admin keypair from secure vault
    // 2. Construct create_market instruction via Anchor
    // 3. Send and confirm transaction
    // 4. Return market_id on success

    // Placeholder: simulate successful deployment
    info!(
        "Market deployment: {} @ ${:.6} (program: {})",
        market_id, spot_price, perp_program
    );

    Ok(market_id)
}

/// Automatically create prediction markets for a newly graduated token
async fn create_auto_predictions(
    db: &PgPool,
    mint: &str,
    symbol: &str,
    current_price: f64,
) -> Result<()> {
    // Create 3 automatic predictions: 2x, 5x, and 10x price targets
    let targets = [
        (2.0, 7),   // 2x in 7 days
        (5.0, 30),  // 5x in 30 days
        (10.0, 90), // 10x in 90 days
    ];

    for (multiplier, days) in targets {
        let target = current_price * multiplier;
        let resolution_ts = chrono::Utc::now().timestamp() + (days * 86400);
        let market_id = format!("{}-{}x-{}d", symbol, multiplier as u32, days);

        sqlx::query!(
            r#"
            INSERT INTO prediction_markets
                (id, token_mint, token_name, token_symbol, type, title,
                 status, outcome, yes_probability, no_probability,
                 yes_pool_usd, no_pool_usd, total_volume_usd,
                 resolution_timestamp, creator, price_target)
            VALUES
                ($1, $2, $3, $4, 'PriceTarget',
                 $5, 'Active', 'Pending', 50, 50, 0, 0, 0,
                 $6, 'fluer-protocol', $7)
            ON CONFLICT (id) DO NOTHING
            "#,
            market_id,
            mint,
            format!("{} · FLUER", symbol),
            symbol,
            format!("Will {} reach ${:.4} within {} days?", symbol, target, days),
            resolution_ts,
            target,
        )
        .execute(db)
        .await?;
    }

    Ok(())
}
