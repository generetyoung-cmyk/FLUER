use anyhow::Result;
use solana_client::nonblocking::rpc_client::RpcClient;
use solana_sdk::{
    commitment_config::CommitmentConfig,
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::Keypair,
    signer::Signer,
    transaction::Transaction,
};
use std::str::FromStr;
use tracing::{info, warn, error};

/// Tier assignment rules based on token metrics
#[derive(Debug)]
pub enum MarketTier {
    Tier1 = 1, // New/unproven — $100K virtual depth
    Tier2 = 2, // Graduated with traction — $500K depth
    Tier3 = 3, // High-volume — $2M depth
}

impl MarketTier {
    /// Assign market tier based on graduation metrics
    pub fn from_metrics(
        real_sol_raised: u64,        // lamports
        holder_count: u32,
        volume_24h_usd: f64,
    ) -> Self {
        let sol_raised = real_sol_raised as f64 / 1e9;

        // Tier 3: Strong graduation (200+ SOL, 1000+ holders, $50K+ daily volume)
        if sol_raised >= 200.0 && holder_count >= 1_000 && volume_24h_usd >= 50_000.0 {
            return MarketTier::Tier3;
        }
        // Tier 2: Normal graduation (85-200 SOL, 200+ holders)
        if sol_raised >= 85.0 && holder_count >= 200 {
            return MarketTier::Tier2;
        }
        // Tier 1: Minimum graduation
        MarketTier::Tier1
    }
}

pub struct MarketDeployer {
    rpc: RpcClient,
    perp_program_id: Pubkey,
    admin_keypair: Keypair,
}

impl MarketDeployer {
    pub fn new(rpc_url: &str, perp_program_id: Pubkey, admin_keypair: Keypair) -> Self {
        Self {
            rpc: RpcClient::new_with_commitment(
                rpc_url.to_string(),
                CommitmentConfig::confirmed(),
            ),
            perp_program_id,
            admin_keypair,
        }
    }

    /// Deploy a new perpetual market for a graduated token
    pub async fn deploy_market(
        &self,
        base_mint: &Pubkey,
        symbol: &str,
        tier: MarketTier,
        spot_price_usd_scaled: u64, // price * 1e6
        oracle: &Pubkey,
    ) -> Result<String> {
        info!(
            "Deploying {} market: {} @ ${:.4} (tier {:?})",
            symbol,
            base_mint,
            spot_price_usd_scaled as f64 / 1e6,
            tier,
        );

        // Derive market PDA
        let (market_pda, _bump) = Pubkey::find_program_address(
            &[b"market", base_mint.as_ref()],
            &self.perp_program_id,
        );

        // Check if market already exists
        if let Ok(Some(_)) = self.rpc.get_account_with_commitment(
            &market_pda,
            CommitmentConfig::confirmed(),
        ).await.map(|r| r.value) {
            warn!("Market {} already exists — skipping", symbol);
            return Ok(format!("{}-PERP", symbol));
        }

        // Derive perp config PDA
        let (config_pda, _) = Pubkey::find_program_address(
            &[b"perp_config"],
            &self.perp_program_id,
        );

        // Build create_market instruction
        // Anchor discriminator = SHA256("global:create_market")[..8]
        let discriminator = anchor_discriminator("global:create_market");

        // Serialize CreateMarketParams
        let market_symbol_bytes = format!("{}", symbol);
        let params = serialize_create_market_params(
            *base_mint,
            &market_symbol_bytes,
            tier as u8,
            *oracle,
            spot_price_usd_scaled,
        );

        let mut instruction_data = discriminator.to_vec();
        instruction_data.extend_from_slice(&params);

        let instruction = Instruction {
            program_id: self.perp_program_id,
            accounts: vec![
                AccountMeta::new(self.admin_keypair.pubkey(), true), // authority
                AccountMeta::new_readonly(config_pda, false),         // config
                AccountMeta::new(market_pda, false),                  // market
                AccountMeta::new_readonly(solana_sdk::system_program::id(), false),
            ],
            data: instruction_data,
        };

        // Build and send transaction
        let recent_blockhash = self.rpc.get_latest_blockhash().await?;
        let tx = Transaction::new_signed_with_payer(
            &[instruction],
            Some(&self.admin_keypair.pubkey()),
            &[&self.admin_keypair],
            recent_blockhash,
        );

        let sig = self.rpc
            .send_and_confirm_transaction_with_spinner_and_commitment(
                &tx,
                CommitmentConfig::confirmed(),
            )
            .await?;

        info!("Market deployed: {} — tx: {}", symbol, sig);
        Ok(format!("{}-PERP", symbol))
    }
}

/// Compute Anchor instruction discriminator
fn anchor_discriminator(name: &str) -> [u8; 8] {
    use std::convert::TryInto;
    let hash = solana_sdk::hash::hashv(&[name.as_bytes()]);
    hash.to_bytes()[..8].try_into().unwrap_or([0u8; 8])
}

/// Serialize CreateMarketParams for Anchor instruction
fn serialize_create_market_params(
    base_mint: Pubkey,
    symbol: &str,
    tier: u8,
    oracle: Pubkey,
    spot_price_usd_scaled: u64,
) -> Vec<u8> {
    let mut bytes = Vec::new();

    // base_mint: Pubkey (32 bytes)
    bytes.extend_from_slice(base_mint.as_ref());

    // market_symbol: String (4-byte length prefix + bytes)
    let sym_bytes = symbol.as_bytes();
    bytes.extend_from_slice(&(sym_bytes.len() as u32).to_le_bytes());
    bytes.extend_from_slice(sym_bytes);

    // tier: u8 (MarketTier enum variant index)
    bytes.push(tier);

    // oracle: Pubkey (32 bytes)
    bytes.extend_from_slice(oracle.as_ref());

    // spot_price_usd_scaled: u64
    bytes.extend_from_slice(&spot_price_usd_scaled.to_le_bytes());

    bytes
}

/// Load admin keypair from environment (base58-encoded private key)
pub fn load_admin_keypair() -> Result<Keypair> {
    let key_str = std::env::var("ADMIN_PRIVATE_KEY")
        .map_err(|_| anyhow::anyhow!("ADMIN_PRIVATE_KEY env var required"))?;

    let key_bytes = bs58::decode(&key_str)
        .into_vec()
        .map_err(|e| anyhow::anyhow!("Invalid keypair: {}", e))?;

    Keypair::from_bytes(&key_bytes)
        .map_err(|e| anyhow::anyhow!("Failed to parse keypair: {}", e))
}

/// bs58 decode helper (inline to avoid extra dep)
mod bs58 {
    const ALPHABET: &[u8] = b"123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

    pub struct DecodeBuilder<'a>(&'a str);

    pub fn decode(input: &str) -> DecodeBuilder {
        DecodeBuilder(input)
    }

    impl<'a> DecodeBuilder<'a> {
        pub fn into_vec(self) -> Result<Vec<u8>, &'static str> {
            let input = self.0;
            let mut output = vec![0u8; input.len()];
            let mut length = 0;

            for c in input.chars() {
                let mut carry = ALPHABET
                    .iter()
                    .position(|&b| b == c as u8)
                    .ok_or("Invalid base58 character")? as u32;

                for byte in output[..length].iter_mut().rev() {
                    carry += 58 * (*byte as u32);
                    *byte = (carry % 256) as u8;
                    carry /= 256;
                }

                while carry > 0 {
                    if length >= output.len() {
                        return Err("Base58 overflow");
                    }
                    output[length] = (carry % 256) as u8;
                    length += 1;
                    carry /= 256;
                }
                length += if c == '1' { 1 } else { 0 };
            }

            output.truncate(length);
            output.reverse();
            Ok(output)
        }
    }
}
