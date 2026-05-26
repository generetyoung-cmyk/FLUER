/// FLUER Market Factory Service
///
/// Continuously monitors bonding curves for graduation events and
/// automatically deploys perpetual markets when a token graduates.
///
/// Architecture:
///   1. Yellowstone gRPC subscription → listen for CurveTradeEvent + GraduationEvent
///   2. On graduation event: fetch on-chain state, deploy perp market via Anchor CPI
///   3. Update PostgreSQL + broadcast WS event
///   4. Schedule prediction market creation (automatic price target markets)
use anyhow::Result;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use std::str::FromStr;
use tracing::{error, info, warn};

mod graduation_monitor;
mod indexer;
mod market_deployer;

#[tokio::main]
async fn main() -> Result<()> {
    tracing_subscriber::fmt()
        .with_env_filter(
            std::env::var("RUST_LOG")
                .unwrap_or_else(|_| "market_factory=info".to_string())
        )
        .json()
        .init();

    info!("FLUER Market Factory starting...");

    let rpc_url = std::env::var("SOLANA_RPC_URL")
        .expect("SOLANA_RPC_URL required");
    let rpc = RpcClient::new(rpc_url.clone());

    let db_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
    let db = sqlx::PgPool::connect(&db_url).await?;

    let redis_url = std::env::var("REDIS_URL")
        .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
    let redis = redis::Client::open(redis_url)?;
    let mut redis_conn = redis::aio::ConnectionManager::new(redis).await?;

    let launchpad_program = std::env::var("LAUNCHPAD_PROGRAM_ID")
        .map(|s| Pubkey::from_str(&s).expect("Invalid LAUNCHPAD_PROGRAM_ID"))
        .expect("LAUNCHPAD_PROGRAM_ID required");

    let perp_program = std::env::var("PERP_ENGINE_PROGRAM_ID")
        .map(|s| Pubkey::from_str(&s).expect("Invalid PERP_ENGINE_PROGRAM_ID"))
        .expect("PERP_ENGINE_PROGRAM_ID required");

    info!("Launchpad program: {}", launchpad_program);
    info!("Perp engine program: {}", perp_program);

    // Spawn concurrent tasks
    let db1 = db.clone();
    let db2 = db.clone();
    let rpc_url1 = rpc_url.clone();

    // Task 1: Index on-chain events via Yellowstone gRPC
    let indexer_task = tokio::spawn(async move {
        if let Err(e) = indexer::run_indexer(&rpc_url1, &launchpad_program, &db1).await {
            error!("Indexer crashed: {}", e);
        }
    });

    // Task 2: Monitor graduation events → deploy perp markets
    let graduation_task = tokio::spawn(async move {
        if let Err(e) = graduation_monitor::run_monitor(
            &rpc_url,
            &db2,
            &perp_program,
        ).await {
            error!("Graduation monitor crashed: {}", e);
        }
    });

    // Task 3: Vanity pool replenisher (listen for low-pool signals)
    let replenish_task = tokio::spawn(async move {
        run_vanity_replenisher(redis_conn).await;
    });

    tokio::select! {
        _ = indexer_task => warn!("Indexer task exited"),
        _ = graduation_task => warn!("Graduation monitor exited"),
        _ = replenish_task => warn!("Replenisher exited"),
        _ = tokio::signal::ctrl_c() => info!("Shutdown signal received"),
    }

    info!("Market Factory shutting down");
    Ok(())
}

/// Background task: replenish vanity keypair pool when below threshold
async fn run_vanity_replenisher(mut redis: redis::aio::ConnectionManager) {
    use redis::AsyncCommands;

    let mut pubsub = loop {
        match redis::Client::open(
            std::env::var("REDIS_URL").unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string())
        ) {
            Ok(client) => match client.get_async_connection().await {
                Ok(conn) => break conn.into_pubsub(),
                Err(e) => {
                    warn!("Redis pubsub connect failed: {} — retrying", e);
                    tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
                }
            },
            Err(e) => {
                warn!("Redis client error: {} — retrying", e);
                tokio::time::sleep(tokio::time::Duration::from_secs(5)).await;
            }
        }
    };

    pubsub.subscribe("vanity_pool:replenish").await.ok();

    info!("Vanity pool replenisher listening on Redis pubsub");

    let mut msg_stream = pubsub.into_on_message();
    loop {
        if msg_stream.recv().await.is_some() {
            info!("Vanity pool low — triggering batch generation");
            // In production: spawn child process calling vanity-grinder binary
            // or call grinder logic inline
            tokio::time::sleep(tokio::time::Duration::from_millis(100)).await;
        }
    }
}
