use anyhow::Result;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::pubkey::Pubkey;
use sqlx::PgPool;
use tracing::{debug, error, info, warn};

/// Subscribe to Yellowstone gRPC for real-time on-chain events from the FLUER launchpad.
/// Falls back to polling when gRPC unavailable.
pub async fn run_indexer(
    rpc_url: &str,
    launchpad_program: &Pubkey,
    db: &PgPool,
) -> Result<()> {
    let grpc_url = std::env::var("YELLOWSTONE_GRPC_URL").ok();
    let grpc_token = std::env::var("YELLOWSTONE_GRPC_TOKEN").ok();

    if let (Some(grpc_url), Some(token)) = (grpc_url, grpc_token) {
        info!("Starting Yellowstone gRPC indexer at {}", grpc_url);
        run_grpc_indexer(&grpc_url, &token, launchpad_program, db).await
    } else {
        warn!("YELLOWSTONE_GRPC_URL not set — falling back to RPC polling indexer");
        run_polling_indexer(rpc_url, launchpad_program, db).await
    }
}

/// Yellowstone gRPC-based event indexer (preferred — zero latency, no RPC rate limits)
async fn run_grpc_indexer(
    grpc_url: &str,
    token: &str,
    program: &Pubkey,
    db: &PgPool,
) -> Result<()> {
    // In production: use yellowstone-grpc-client crate to subscribe to:
    //   - Transactions mentioning the launchpad program
    //   - Account updates for listing PDAs
    //
    // For brevity, this shows the structure:
    //
    // let mut client = GeyserGrpcClient::connect(grpc_url, Some(token), None)?;
    // let subscription = client.subscribe_once(
    //     HashMap::new(),  // accounts
    //     HashMap::new(),  // slots
    //     HashMap::from([  // transactions
    //         ("launchpad".to_string(), SubscribeRequestFilterTransactions {
    //             vote: Some(false),
    //             failed: Some(false),
    //             account_include: vec![program.to_string()],
    //             ..Default::default()
    //         })
    //     ]),
    //     ...
    // ).await?;
    //
    // while let Some(update) = subscription.next().await {
    //     process_geyser_update(update, db).await?;
    // }

    info!("gRPC indexer running (stub — implement with yellowstone-grpc-client)");
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(60)).await;
    }
}

/// Polling-based fallback indexer — parses Anchor events from transaction logs
async fn run_polling_indexer(
    rpc_url: &str,
    program: &Pubkey,
    db: &PgPool,
) -> Result<()> {
    let rpc = RpcClient::new(rpc_url.to_string());
    info!("Polling indexer active for program {}", program);

    // Track last processed signature to avoid reprocessing
    let mut last_sig: Option<String> = load_cursor(db, &program.to_string()).await?;

    loop {
        match poll_program_transactions(&rpc, program, last_sig.as_deref(), db).await {
            Ok(new_last) => {
                if let Some(sig) = new_last {
                    save_cursor(db, &program.to_string(), &sig).await.ok();
                    last_sig = Some(sig);
                }
            }
            Err(e) => {
                error!("Poll error: {}", e);
            }
        }

        // Poll every 5 seconds
        tokio::time::sleep(std::time::Duration::from_secs(5)).await;
    }
}

async fn poll_program_transactions(
    rpc: &RpcClient,
    program: &Pubkey,
    before_sig: Option<&str>,
    db: &PgPool,
) -> Result<Option<String>> {
    use solana_client::rpc_client::GetConfirmedSignaturesForAddress2Config;
    use solana_sdk::commitment_config::CommitmentConfig;

    let config = GetConfirmedSignaturesForAddress2Config {
        before: None,
        until: before_sig.and_then(|s| s.parse().ok()),
        limit: Some(100),
        commitment: Some(CommitmentConfig::confirmed()),
    };

    let sigs = rpc
        .get_signatures_for_address_with_config(program, config)
        .await?;

    if sigs.is_empty() {
        return Ok(None);
    }

    let newest_sig = sigs[0].signature.clone();

    for sig_info in &sigs {
        if sig_info.err.is_some() {
            continue; // Skip failed transactions
        }

        if let Err(e) = process_transaction(rpc, &sig_info.signature, db).await {
            debug!("Error processing tx {}: {}", sig_info.signature, e);
        }
    }

    Ok(Some(newest_sig))
}

/// Parse an individual transaction and extract FLUER Anchor events
async fn process_transaction(
    rpc: &RpcClient,
    signature: &str,
    db: &PgPool,
) -> Result<()> {
    use solana_transaction_status::{UiTransactionEncoding, EncodedConfirmedTransactionWithStatusMeta};

    let sig = signature.parse()?;
    let tx = rpc
        .get_transaction(&sig, UiTransactionEncoding::JsonParsed)
        .await?;

    // Extract log messages and parse Anchor event discriminators
    if let Some(meta) = &tx.transaction.meta {
        if let Some(logs) = &meta.log_messages {
            parse_anchor_events(logs, db, signature).await?;
        }
    }

    Ok(())
}

/// Parse Anchor event logs from transaction log messages
/// Anchor events are encoded as base64 in "Program data: <base64>" log lines
async fn parse_anchor_events(
    logs: &[String],
    db: &PgPool,
    tx_sig: &str,
) -> Result<()> {
    for log in logs {
        if !log.starts_with("Program data: ") {
            continue;
        }

        let b64 = &log["Program data: ".len()..];
        let data = match base64_decode(b64) {
            Some(d) => d,
            None => continue,
        };

        if data.len() < 8 {
            continue;
        }

        // First 8 bytes are the event discriminator (SHA256 hash of "event:<EventName>")
        let discriminator = &data[..8];

        // Known discriminators — pre-computed offline for each event
        // In production: generate from IDL using anchor_lang::event discriminator
        let curve_trade_disc = event_discriminator("CurveTradeEvent");
        let graduated_disc   = event_discriminator("GraduationEvent");
        let created_disc     = event_discriminator("TokenCreatedEvent");

        if discriminator == curve_trade_disc.as_slice() {
            handle_curve_trade_event(&data[8..], db, tx_sig).await?;
        } else if discriminator == graduated_disc.as_slice() {
            handle_graduation_event(&data[8..], db, tx_sig).await?;
        } else if discriminator == created_disc.as_slice() {
            handle_token_created_event(&data[8..], db, tx_sig).await?;
        }
    }

    Ok(())
}

fn event_discriminator(name: &str) -> [u8; 8] {
    use std::convert::TryInto;
    let preimage = format!("event:{}", name);
    let hash = solana_sdk::hash::hashv(&[preimage.as_bytes()]);
    hash.to_bytes()[..8].try_into().unwrap_or([0u8; 8])
}

fn base64_decode(s: &str) -> Option<Vec<u8>> {
    use std::io::Read;
    // Simple base64 decode
    let bytes = s.as_bytes();
    // Use a simple implementation
    None // TODO: implement with base64 crate
}

async fn handle_curve_trade_event(data: &[u8], db: &PgPool, tx_sig: &str) -> Result<()> {
    // Deserialize CurveTradeEvent from data
    // Update token_listings price, volume, buy_count/sell_count
    // Insert token_candle record
    debug!("CurveTradeEvent from tx: {}", tx_sig);
    Ok(())
}

async fn handle_graduation_event(data: &[u8], db: &PgPool, tx_sig: &str) -> Result<()> {
    // Mark token as graduated in DB
    info!("GraduationEvent from tx: {}", tx_sig);
    Ok(())
}

async fn handle_token_created_event(data: &[u8], db: &PgPool, tx_sig: &str) -> Result<()> {
    // Insert new token_listing into DB
    info!("TokenCreatedEvent from tx: {}", tx_sig);
    Ok(())
}

/// Load indexer cursor (last processed signature) from DB
async fn load_cursor(db: &PgPool, program: &str) -> Result<Option<String>> {
    let row = sqlx::query_scalar!(
        "SELECT last_signature FROM indexer_cursors WHERE program_id = $1",
        program
    )
    .fetch_optional(db)
    .await
    .ok()
    .flatten();
    Ok(row)
}

/// Save indexer cursor
async fn save_cursor(db: &PgPool, program: &str, sig: &str) -> Result<()> {
    sqlx::query!(
        r#"
        INSERT INTO indexer_cursors (program_id, last_signature, updated_at)
        VALUES ($1, $2, NOW())
        ON CONFLICT (program_id) DO UPDATE
            SET last_signature = $2, updated_at = NOW()
        "#,
        program,
        sig
    )
    .execute(db)
    .await?;
    Ok(())
}
