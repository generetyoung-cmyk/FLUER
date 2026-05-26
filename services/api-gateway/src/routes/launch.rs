use axum::{
    extract::{Multipart, State},
    response::Json,
    http::StatusCode,
};
use serde::{Deserialize, Serialize};
use std::sync::Arc;
use crate::state::AppState;

#[derive(Debug, Deserialize)]
pub struct PrepareLaunchRequest {
    /// Token name WITHOUT the " · FLUER" suffix — added server-side
    pub name: String,
    /// Symbol — max 8 alphanumeric chars
    pub symbol: String,
    /// Description — max 500 chars
    pub description: String,
    /// Token category
    pub category: String,
    /// Creator wallet public key
    pub creator_wallet: String,
    /// Optional initial dev buy in SOL
    pub initial_buy_sol: Option<f64>,
    /// Social links
    pub website: Option<String>,
    pub twitter: Option<String>,
    pub telegram: Option<String>,
    /// Anti-snipe enabled
    pub anti_snipe: Option<bool>,
    /// IPFS image CID (uploaded separately via /upload-metadata)
    pub image_cid: String,
    /// Use PumpPortal (Phase 1) or custom program (Phase 2)
    pub use_pumpportal: Option<bool>,
}

#[derive(Debug, Serialize)]
pub struct PrepareLaunchResponse {
    /// Full token name with " · FLUER" suffix
    pub full_name: String,
    /// IPFS metadata URI (uploaded by server)
    pub metadata_uri: String,
    /// Vanity keypair public key (ending in 'flur')
    pub mint_pubkey: String,
    /// Serialized unsigned transaction (base64) — user must sign
    pub transaction_base64: String,
    /// Estimated fees breakdown
    pub fees: FeeBreakdown,
    /// Creation fee in FLUER tokens
    pub fluer_fee: u64,
}

#[derive(Debug, Serialize)]
pub struct FeeBreakdown {
    pub network_fee_sol: f64,
    pub protocol_fee_fluer: u64,
    pub estimated_total_sol: f64,
}

/// POST /api/v1/launch/upload-metadata
/// Upload token image to Pinata IPFS, returns CID
pub async fn upload_metadata(
    State(state): State<Arc<AppState>>,
    mut multipart: Multipart,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let mut image_bytes: Option<Vec<u8>> = None;
    let mut content_type = "image/png".to_string();

    while let Some(field) = multipart.next_field().await.map_err(|_| StatusCode::BAD_REQUEST)? {
        let name = field.name().unwrap_or("").to_string();
        if name == "image" {
            content_type = field
                .content_type()
                .unwrap_or("image/png")
                .to_string();
            let bytes = field.bytes().await.map_err(|_| StatusCode::BAD_REQUEST)?;
            // Max 2MB
            if bytes.len() > 2 * 1024 * 1024 {
                return Err(StatusCode::PAYLOAD_TOO_LARGE);
            }
            image_bytes = Some(bytes.to_vec());
        }
    }

    let image_data = image_bytes.ok_or(StatusCode::BAD_REQUEST)?;

    // Upload to Pinata IPFS
    let pinata_url = "https://api.pinata.cloud/pinning/pinFileToIPFS";
    let form = reqwest::multipart::Form::new()
        .part(
            "file",
            reqwest::multipart::Part::bytes(image_data)
                .file_name("token-image.png")
                .mime_str(&content_type)
                .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?,
        )
        .text("pinataMetadata", r#"{"name":"fluer-token-image"}"#);

    let resp = state
        .http_client
        .post(pinata_url)
        .header(
            "Authorization",
            format!("Bearer {}", state.config.pinata_jwt),
        )
        .multipart(form)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    if !resp.status().is_success() {
        return Err(StatusCode::BAD_GATEWAY);
    }

    let pinata_resp: serde_json::Value =
        resp.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;

    let cid = pinata_resp["IpfsHash"]
        .as_str()
        .ok_or(StatusCode::BAD_GATEWAY)?
        .to_string();

    Ok(Json(serde_json::json!({
        "cid": cid,
        "url": format!("https://ipfs.io/ipfs/{}", cid),
        "gateway_url": format!("https://gateway.pinata.cloud/ipfs/{}", cid),
    })))
}

/// POST /api/v1/launch/prepare
/// Core launch preparation: build metadata JSON → upload to IPFS → fetch vanity keypair → build tx
pub async fn prepare_launch(
    State(state): State<Arc<AppState>>,
    Json(req): Json<PrepareLaunchRequest>,
) -> Result<Json<PrepareLaunchResponse>, StatusCode> {
    // Validate inputs
    if req.name.len() > 24 {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    if req.symbol.len() > 8 || !req.symbol.chars().all(|c| c.is_ascii_alphanumeric()) {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }
    if req.description.len() > 500 {
        return Err(StatusCode::UNPROCESSABLE_ENTITY);
    }

    // Enforce " · FLUER" suffix
    let full_name = format!("{} \u{00B7} FLUER", req.name);

    // Build metadata JSON
    let metadata = serde_json::json!({
        "name": full_name,
        "symbol": req.symbol.to_uppercase(),
        "description": format!(
            "Launched on FLUER Protocol — fluer.io\n\n{}",
            req.description
        ),
        "image": format!("https://ipfs.io/ipfs/{}", req.image_cid),
        "website": req.website.unwrap_or_default(),
        "twitter": req.twitter.unwrap_or_default(),
        "telegram": req.telegram.unwrap_or_default(),
        "createdOn": "https://fluer.io",
        "fluer_protocol": true,
    });

    // Upload metadata JSON to Pinata
    let pinata_url = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
    let pinata_body = serde_json::json!({
        "pinataContent": metadata,
        "pinataMetadata": {
            "name": format!("fluer-{}-metadata", req.symbol.to_lowercase())
        }
    });

    let meta_resp = state
        .http_client
        .post(pinata_url)
        .header("Authorization", format!("Bearer {}", state.config.pinata_jwt))
        .json(&pinata_body)
        .send()
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?;

    let meta_data: serde_json::Value =
        meta_resp.json().await.map_err(|_| StatusCode::BAD_GATEWAY)?;
    let metadata_cid = meta_data["IpfsHash"]
        .as_str()
        .ok_or(StatusCode::BAD_GATEWAY)?
        .to_string();
    let metadata_uri = format!("https://ipfs.io/ipfs/{}", metadata_cid);

    // Claim a pre-generated vanity keypair from the pool
    let vanity_pubkey = claim_vanity_keypair_from_pool(&state).await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    // Build transaction via PumpPortal (Phase 1) or custom program (Phase 2)
    let use_pumpportal = req.use_pumpportal.unwrap_or(true);
    let initial_buy = req.initial_buy_sol.unwrap_or(0.0);

    let transaction_base64 = if use_pumpportal {
        build_pumpportal_transaction(
            &state,
            &req.creator_wallet,
            &full_name,
            &req.symbol,
            &metadata_uri,
            &vanity_pubkey,
            initial_buy,
        )
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?
    } else {
        build_native_transaction(
            &state,
            &req.creator_wallet,
            &full_name,
            &req.symbol,
            &metadata_uri,
            &vanity_pubkey,
        )
        .await
        .map_err(|_| StatusCode::BAD_GATEWAY)?
    };

    Ok(Json(PrepareLaunchResponse {
        full_name,
        metadata_uri,
        mint_pubkey: vanity_pubkey,
        transaction_base64,
        fees: FeeBreakdown {
            network_fee_sol: 0.02,
            protocol_fee_fluer: 50_000_000, // 50 FLUER (6 decimals)
            estimated_total_sol: 0.02 + initial_buy,
        },
        fluer_fee: 50_000_000,
    }))
}

/// POST /api/v1/launch/vanity-keypair
/// Return the next available vanity keypair public key from the pool
pub async fn get_vanity_keypair(
    State(state): State<Arc<AppState>>,
) -> Result<Json<serde_json::Value>, StatusCode> {
    let pubkey = claim_vanity_keypair_from_pool(&state)
        .await
        .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;

    Ok(Json(serde_json::json!({
        "pubkey": pubkey,
        "suffix": "flur",
        "status": "available",
    })))
}

/// GET /api/v1/launch/estimate-fee
pub async fn estimate_fee(
    State(_state): State<Arc<AppState>>,
) -> Json<serde_json::Value> {
    Json(serde_json::json!({
        "network_fee_sol": 0.02,
        "protocol_fee_fluer": 50,
        "protocol_fee_description": "50 FLUER — 50% burned, 50% to treasury",
        "vanity_generation": "free (server-side)",
        "ipfs_upload": "free (Pinata)",
        "pump_portal_fee_sol": 0.02,
        "total_estimated_sol": 0.02,
    }))
}

/// Internal: claim a vanity keypair from the pre-generated pool in Redis
async fn claim_vanity_keypair_from_pool(state: &AppState) -> anyhow::Result<String> {
    use redis::AsyncCommands;

    let mut conn = state.redis.clone();

    // RPOP from the vanity pool queue
    let result: Option<String> = conn.rpop("vanity_pool:flur", None).await?;

    match result {
        Some(pubkey) => {
            // Log pool size for monitoring
            let pool_size: i64 = conn.llen("vanity_pool:flur").await.unwrap_or(0);
            if pool_size < 100 {
                tracing::warn!(
                    "Vanity pool low: {} remaining — trigger background replenishment",
                    pool_size
                );
                // Publish replenishment signal
                let _: () = conn
                    .publish("vanity_pool:replenish", "low")
                    .await
                    .unwrap_or(());
            }
            Ok(pubkey)
        }
        None => {
            tracing::error!("Vanity pool empty! Token creation temporarily unavailable.");
            Err(anyhow::anyhow!("Vanity pool exhausted"))
        }
    }
}

/// Build PumpPortal unsigned transaction
async fn build_pumpportal_transaction(
    state: &AppState,
    creator_wallet: &str,
    name: &str,
    symbol: &str,
    metadata_uri: &str,
    mint_pubkey: &str,
    initial_buy_sol: f64,
) -> anyhow::Result<String> {
    let body = serde_json::json!({
        "publicKey": creator_wallet,
        "action": "create",
        "tokenMetadata": {
            "name": name,
            "symbol": symbol,
            "uri": metadata_uri
        },
        "mint": mint_pubkey,
        "denominatedInSol": "true",
        "amount": initial_buy_sol,
        "slippage": 15,
        "priorityFee": 0.00005,
        "pool": "pump"
    });

    let resp = state
        .http_client
        .post("https://pumpportal.fun/api/trade-local")
        .json(&body)
        .send()
        .await?;

    if !resp.status().is_success() {
        let err = resp.text().await.unwrap_or_default();
        return Err(anyhow::anyhow!("PumpPortal error: {}", err));
    }

    // PumpPortal returns serialized VersionedTransaction bytes
    let tx_bytes = resp.bytes().await?;
    Ok(base64::encode(&tx_bytes))
}

/// Build native FLUER launchpad transaction (Phase 2)
async fn build_native_transaction(
    state: &AppState,
    creator_wallet: &str,
    name: &str,
    symbol: &str,
    metadata_uri: &str,
    mint_pubkey: &str,
) -> anyhow::Result<String> {
    // TODO: Phase 2 — construct Anchor instruction for fluer_launchpad::create_token
    // using the @coral-xyz/anchor SDK server-side
    // For now, return a placeholder indicating Phase 2 is not yet deployed
    Err(anyhow::anyhow!("Native launch available in Phase 2"))
}
