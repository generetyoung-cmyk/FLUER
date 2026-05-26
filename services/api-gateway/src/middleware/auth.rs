use axum::{
    body::Body,
    extract::State,
    http::{Request, StatusCode},
    middleware::Next,
    response::Response,
};
use std::sync::Arc;
use crate::state::AppState;

/// Optional authentication middleware using SIWS (Sign-In With Solana).
///
/// Checks the Authorization header for a JWT signed by the user's wallet.
/// Attaches wallet public key to request extensions on success.
/// Routes that don't require auth still pass through — gating is per-route.
pub async fn auth_middleware(
    State(_state): State<Arc<AppState>>,
    mut request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    // Extract Authorization header
    let auth_header = request
        .headers()
        .get("Authorization")
        .and_then(|h| h.to_str().ok())
        .and_then(|h| h.strip_prefix("Bearer "));

    if let Some(token) = auth_header {
        // In production: verify JWT signed by wallet private key
        // JWT payload: { wallet: "...", exp: ..., iat: ... }
        // Verification: verify signature against wallet pubkey
        match verify_siws_token(token) {
            Ok(wallet) => {
                request.extensions_mut().insert(AuthenticatedWallet(wallet));
            }
            Err(_) => {
                // Invalid token — still pass through but no wallet extension
                // Protected endpoints will reject if extension missing
            }
        }
    }

    Ok(next.run(request).await)
}

/// Authenticated wallet public key (injected by auth middleware)
#[derive(Clone, Debug)]
pub struct AuthenticatedWallet(pub String);

/// Verify a SIWS JWT token and return the wallet address
fn verify_siws_token(token: &str) -> Result<String, &'static str> {
    // Production implementation:
    // 1. Parse JWT header + payload (base64url decode)
    // 2. Extract wallet pubkey from payload
    // 3. Verify signature using ed25519 (Solana native)
    // 4. Check expiry (exp claim)
    // 5. Return wallet address on success
    //
    // Libraries: jsonwebtoken + ed25519-dalek

    // Stub implementation for development
    if token.is_empty() {
        return Err("Empty token");
    }

    // In development: accept any non-empty token and extract fake wallet
    // Replace with real JWT verification before mainnet
    Err("SIWS verification not implemented — use development mode")
}
