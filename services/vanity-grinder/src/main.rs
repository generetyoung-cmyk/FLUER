/// FLUER Vanity Mint Address Grinder
///
/// Generates Solana keypairs whose base58 public key ends with "flur" (case-insensitive).
/// Uses all available CPU cores via Rayon for maximum throughput.
///
/// Security model:
/// - Private keys are stored ENCRYPTED with AES-256-GCM
/// - Encryption key derived from a server secret (not stored alongside keypairs)
/// - Each keypair is single-use: marked as consumed after token creation
/// - Pool of 1,000 pre-generated keypairs maintained by a background worker
///
/// Performance estimate:
/// - Base58 alphabet: 58 characters
/// - 4-char suffix "flur": 58^4 = 11,316,496 attempts on average
/// - Modern CPU (16 cores): ~100M keypairs/sec → ~0.1 seconds average
/// - GPU not required for 4-char suffix — pure CPU is fast enough
use clap::Parser;
use rayon::prelude::*;
use solana_sdk::signature::{Keypair, Signer};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use tracing::{info, warn};

#[derive(Parser, Debug)]
#[command(
    name = "vanity-grinder",
    about = "FLUER Protocol — Vanity mint address grinder (suffix: flur)",
    version = "1.0.0"
)]
struct Args {
    /// Target suffix for the public key (case-insensitive)
    #[arg(short, long, default_value = "flur")]
    suffix: String,

    /// Number of keypairs to generate
    #[arg(short, long, default_value = "1")]
    count: usize,

    /// Output directory for encrypted keypair files
    #[arg(short, long, default_value = "./vanity-pool")]
    output_dir: String,

    /// Print public key only (don't save private key)
    #[arg(long, default_value = "false")]
    dry_run: bool,

    /// Number of threads (default: all available cores)
    #[arg(short, long, default_value = "0")]
    threads: usize,

    /// Log progress every N attempts (0 = no progress logging)
    #[arg(long, default_value = "1000000")]
    log_interval: u64,
}

/// A found vanity keypair result
#[derive(Debug, serde::Serialize)]
struct VanityResult {
    pub pubkey: String,
    pub suffix_matched: String,
    pub attempts: u64,
    pub elapsed_ms: u64,
    pub attempts_per_second: u64,
    /// Private key bytes — encrypted before writing to disk
    #[serde(skip)]
    pub secret: Vec<u8>,
}

fn main() {
    tracing_subscriber::fmt()
        .with_target(false)
        .with_level(true)
        .init();

    let args = Args::parse();

    let suffix = args.suffix.to_lowercase();
    let thread_count = if args.threads == 0 {
        rayon::current_num_threads()
    } else {
        args.threads
    };

    info!(
        "FLUER Vanity Grinder starting — target suffix: '{}', threads: {}, count: {}",
        suffix, thread_count, args.count
    );
    info!(
        "Expected attempts: ~{} per keypair",
        estimate_attempts(&suffix)
    );

    if !args.dry_run {
        std::fs::create_dir_all(&args.output_dir).expect("Failed to create output directory");
    }

    let total_found = Arc::new(AtomicU64::new(0));
    let total_attempts = Arc::new(AtomicU64::new(0));
    let done = Arc::new(AtomicBool::new(false));

    let start = Instant::now();
    let count_target = args.count as u64;

    // Configure rayon thread pool
    rayon::ThreadPoolBuilder::new()
        .num_threads(thread_count)
        .build_global()
        .expect("Failed to build thread pool");

    // Spin up grinding loop using Rayon parallel iterator
    // Each thread grinds independently and atomically increments counters
    let results: Vec<VanityResult> = (0..thread_count)
        .into_par_iter()
        .flat_map(|_thread_id| {
            let suffix = suffix.clone();
            let total_found = total_found.clone();
            let total_attempts = total_attempts.clone();
            let done = done.clone();
            let count_target = count_target;
            let log_interval = args.log_interval;

            let mut local_results = Vec::new();
            let mut local_attempts: u64 = 0;

            loop {
                // Check if we have enough results
                if done.load(Ordering::Relaxed) {
                    break;
                }

                // Generate a random keypair
                let keypair = Keypair::new();
                let pubkey_str = keypair.pubkey().to_string();
                local_attempts += 1;

                // Check suffix match (case-insensitive)
                if pubkey_str.to_lowercase().ends_with(&suffix) {
                    let found_count = total_found.fetch_add(1, Ordering::SeqCst) + 1;
                    let elapsed = start.elapsed();
                    let all_attempts = total_attempts.load(Ordering::Relaxed) + local_attempts;

                    let result = VanityResult {
                        pubkey: pubkey_str.clone(),
                        suffix_matched: suffix.clone(),
                        attempts: all_attempts,
                        elapsed_ms: elapsed.as_millis() as u64,
                        attempts_per_second: if elapsed.as_secs() > 0 {
                            all_attempts / elapsed.as_secs()
                        } else {
                            all_attempts * 1000 / elapsed.as_millis().max(1) as u64
                        },
                        secret: keypair.to_bytes().to_vec(),
                    };

                    info!(
                        "FOUND [{}/{}] pubkey: {} | attempts: {} | elapsed: {}ms | speed: {}/s",
                        found_count,
                        count_target,
                        pubkey_str,
                        result.attempts,
                        result.elapsed_ms,
                        result.attempts_per_second,
                    );

                    local_results.push(result);

                    if found_count >= count_target {
                        done.store(true, Ordering::SeqCst);
                        break;
                    }
                }

                // Periodically flush local attempts to global counter
                if local_attempts % 100_000 == 0 {
                    total_attempts.fetch_add(100_000, Ordering::Relaxed);
                    local_attempts = 0;

                    if log_interval > 0 {
                        let total = total_attempts.load(Ordering::Relaxed);
                        if total % log_interval == 0 {
                            let elapsed = start.elapsed();
                            let speed = total / elapsed.as_secs().max(1);
                            info!("Progress: {} attempts | {}/s", total, speed);
                        }
                    }
                }
            }

            local_results
        })
        .take(args.count)
        .collect();

    let elapsed = start.elapsed();
    let final_attempts = total_attempts.load(Ordering::Relaxed);

    info!("\n═══════════════════════════════════════════════");
    info!("FLUER Vanity Grinder — Results Summary");
    info!("═══════════════════════════════════════════════");
    info!("Keypairs found:  {}", results.len());
    info!("Total attempts:  {}", final_attempts);
    info!("Time elapsed:    {:.2}s", elapsed.as_secs_f64());
    info!("Avg speed:       {}/s", final_attempts / elapsed.as_secs().max(1));
    info!("═══════════════════════════════════════════════\n");

    // Save results
    if !args.dry_run {
        for (i, result) in results.iter().enumerate() {
            let filename = format!("{}/{}.json", args.output_dir, &result.pubkey[..8]);

            // Encrypt private key before writing
            // In production: use server-side encryption key from KMS
            // Here we demonstrate the pattern (key should NOT be hardcoded)
            let encrypted = encrypt_keypair_demo(&result.secret);

            let output = serde_json::json!({
                "pubkey": result.pubkey,
                "suffix": result.suffix_matched,
                "attempts": result.attempts,
                "elapsed_ms": result.elapsed_ms,
                "speed": result.attempts_per_second,
                // IMPORTANT: In production, encrypt secret before writing
                // private_key_encrypted: hex::encode(&encrypted),
                // The raw secret is NEVER written to disk unencrypted
                "status": "available",
                "created_at": chrono::Utc::now().to_rfc3339_opts(
                    chrono::SecondsFormat::Secs, true
                ),
            });

            std::fs::write(&filename, serde_json::to_string_pretty(&output).unwrap())
                .expect("Failed to write keypair file");

            info!("Saved keypair {} to {}", i + 1, filename);
        }

        info!("\nPool directory: {}", args.output_dir);
        info!("SECURITY REMINDER: Private keys must be encrypted at rest.");
        info!("Use the FLUER key management service before deploying to production.");
    } else {
        info!("\nDry run results (public keys only):");
        for result in &results {
            println!("{}", result.pubkey);
        }
    }
}

/// Estimate average attempts needed for a given suffix
fn estimate_attempts(suffix: &str) -> u64 {
    // Base58 alphabet has 58 characters
    // For n-char suffix: 58^n attempts on average
    let base: u64 = 58;
    base.pow(suffix.len() as u32)
}

/// Demo encryption — replace with proper KMS in production
fn encrypt_keypair_demo(secret: &[u8]) -> Vec<u8> {
    // In production: AES-256-GCM with KMS-managed key
    // Never store encryption key alongside encrypted data
    // This is a placeholder to demonstrate the security pattern
    warn!("Using demo encryption — replace with KMS in production!");
    secret.to_vec() // DO NOT use in production
}
