use anyhow::Result;
use redis::aio::ConnectionManager;
use sqlx::PgPool;
use std::sync::Arc;
use tokio::sync::broadcast;
use tracing::info;

/// Shared application state across all request handlers
pub struct AppState {
    pub db: PgPool,
    pub redis: ConnectionManager,
    pub ws_broadcast: broadcast::Sender<WsEvent>,
    pub http_client: reqwest::Client,
    pub config: AppConfig,
}

#[derive(Clone, Debug)]
pub struct AppConfig {
    pub solana_rpc_url: String,
    pub solana_ws_url: String,
    pub helius_api_key: String,
    pub pyth_endpoint: String,
    pub pinata_jwt: String,
    pub launchpad_program_id: String,
    pub perp_engine_program_id: String,
    pub prediction_program_id: String,
    pub fluer_mint: String,
    pub pumpportal_api_key: String,
    pub gecko_terminal_base_url: String,
}

impl AppConfig {
    pub fn from_env() -> Self {
        Self {
            solana_rpc_url: std::env::var("SOLANA_RPC_URL")
                .unwrap_or_else(|_| "https://api.mainnet-beta.solana.com".to_string()),
            solana_ws_url: std::env::var("SOLANA_WS_URL")
                .unwrap_or_else(|_| "wss://api.mainnet-beta.solana.com".to_string()),
            helius_api_key: std::env::var("HELIUS_API_KEY")
                .expect("HELIUS_API_KEY required"),
            pyth_endpoint: std::env::var("PYTH_ENDPOINT")
                .unwrap_or_else(|_| "https://hermes.pyth.network".to_string()),
            pinata_jwt: std::env::var("PINATA_JWT")
                .expect("PINATA_JWT required"),
            launchpad_program_id: std::env::var("LAUNCHPAD_PROGRAM_ID")
                .expect("LAUNCHPAD_PROGRAM_ID required"),
            perp_engine_program_id: std::env::var("PERP_ENGINE_PROGRAM_ID")
                .expect("PERP_ENGINE_PROGRAM_ID required"),
            prediction_program_id: std::env::var("PREDICTION_PROGRAM_ID")
                .expect("PREDICTION_PROGRAM_ID required"),
            fluer_mint: std::env::var("FLUER_MINT")
                .expect("FLUER_MINT required"),
            pumpportal_api_key: std::env::var("PUMPPORTAL_API_KEY")
                .unwrap_or_default(),
            gecko_terminal_base_url: "https://api.geckoterminal.com/api/v2".to_string(),
        }
    }
}

/// Events broadcast over WebSocket to all connected clients
#[derive(Clone, Debug, serde::Serialize)]
#[serde(tag = "type", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum WsEvent {
    /// Real-time price update for a market
    PriceUpdate {
        market_id: String,
        price: f64,
        change_24h: f64,
        volume_24h: f64,
        timestamp: i64,
    },
    /// New trade executed on a perpetual market
    Trade {
        market_id: String,
        side: String,
        size_usd: f64,
        price: f64,
        timestamp: i64,
    },
    /// Funding rate updated
    FundingRate {
        market_id: String,
        rate_hourly: f64,
        timestamp: i64,
    },
    /// New token launched on FLUER launchpad
    TokenLaunched {
        mint: String,
        name: String,
        symbol: String,
        creator: String,
        timestamp: i64,
    },
    /// Token graduated from bonding curve
    TokenGraduated {
        mint: String,
        name: String,
        symbol: String,
        perp_market_id: Option<String>,
        timestamp: i64,
    },
    /// New bonding curve buy/sell
    CurveTrade {
        mint: String,
        side: String,
        sol_amount: f64,
        token_amount: f64,
        price_usd: f64,
        trader: String,
        timestamp: i64,
    },
    /// New prediction market created
    PredictionCreated {
        market_id: String,
        token_mint: String,
        title: String,
        timestamp: i64,
    },
    /// Prediction market resolved
    PredictionResolved {
        market_id: String,
        outcome: String,
        timestamp: i64,
    },
    /// Liquidation event
    Liquidation {
        market_id: String,
        trader: String,
        side: String,
        size_usd: f64,
        timestamp: i64,
    },
    /// Protocol stats update (every 30s)
    ProtocolStats {
        total_volume_24h: f64,
        active_markets: u32,
        total_oi: f64,
        active_predictions: u32,
        timestamp: i64,
    },
}

impl AppState {
    pub async fn new() -> Result<Self> {
        let config = AppConfig::from_env();

        // PostgreSQL connection pool
        let database_url = std::env::var("DATABASE_URL").expect("DATABASE_URL required");
        info!("Connecting to PostgreSQL...");
        let db = PgPool::connect(&database_url).await?;

        // Run migrations on startup
        sqlx::migrate!("./migrations").run(&db).await?;
        info!("Database migrations applied");

        // Redis connection
        let redis_url = std::env::var("REDIS_URL")
            .unwrap_or_else(|_| "redis://127.0.0.1:6379".to_string());
        info!("Connecting to Redis at {}...", redis_url);
        let redis_client = redis::Client::open(redis_url)?;
        let redis = ConnectionManager::new(redis_client).await?;
        info!("Redis connected");

        // WebSocket broadcast channel — 4096 message buffer
        let (ws_broadcast, _) = broadcast::channel(4096);

        // HTTP client with connection pooling and timeouts
        let http_client = reqwest::Client::builder()
            .timeout(std::time::Duration::from_secs(10))
            .connect_timeout(std::time::Duration::from_secs(5))
            .pool_max_idle_per_host(20)
            .user_agent("FLUER-Protocol/1.0")
            .build()?;

        info!("AppState initialized — FLUER Protocol API ready");

        Ok(Self {
            db,
            redis,
            ws_broadcast,
            http_client,
            config,
        })
    }

    pub async fn redis_ping(&self) -> Result<()> {
        let mut conn = self.redis.clone();
        redis::cmd("PING")
            .query_async::<String>(&mut conn)
            .await?;
        Ok(())
    }

    pub async fn db_ping(&self) -> Result<()> {
        sqlx::query("SELECT 1").fetch_one(&self.db).await?;
        Ok(())
    }
}
