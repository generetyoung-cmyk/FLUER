# FLUER Protocol

**Integrated Speculative Market Infrastructure for Solana**

> Launch tokens. Trade perpetuals. Predict outcomes. Every token — one protocol.

---

## Overview

FLUER is a unified on-chain protocol on Solana that covers the complete lifecycle of speculative assets:

1. **Launchpad** — Token creation with a bonding curve. Every token carries the `· FLUER` suffix and a vanity mint address ending in `flur`. Fee: 50 FLUER (50% burned, 50% to treasury).
2. **Perpetual Engine** — vAMM-based leveraged perpetuals (up to 5×) automatically deployed when a token graduates. 0.1% taker fee, hourly funding rates, Pyth oracle integration.
3. **Prediction Markets** — Binary outcome markets on price targets, holder milestones, and exchange listings. Auto-created on graduation.

---

## Architecture

```
fluer-protocol/
├── apps/
│   └── web/                    Next.js 15 + TypeScript frontend
├── programs/                   Solana Anchor smart contracts (Rust)
│   ├── fluer_launchpad/        Bonding curve token factory
│   ├── fluer_perp_engine/      vAMM perpetual markets
│   ├── fluer_prediction/       Binary prediction markets
│   └── fluer_token/            $FLUER SPL token + staking
├── services/                   Rust backend microservices
│   ├── api-gateway/            Axum REST + WebSocket API
│   ├── market-factory/         Graduation monitor + event indexer
│   ├── price-aggregator/       Pyth + GeckoTerminal price feeds
│   └── vanity-grinder/         Parallel keypair generator (suffix: flur)
└── packages/
    └── sdk/                    TypeScript SDK (@fluer/sdk)
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Smart Contracts | Rust + Anchor 0.30 |
| Frontend | Next.js 15 + TypeScript + React 19 |
| Styling | Tailwind CSS (custom FLUER design system) |
| Charts | lightweight-charts v4 |
| Backend | Rust + Axum + Tokio |
| Database | PostgreSQL 16 + TimescaleDB |
| Cache / PubSub | Redis 7 |
| Wallet | @solana/wallet-adapter (Phantom, Backpack, Solflare, OKX) |
| Price Feeds | Pyth Network Hermes + GeckoTerminal |
| IPFS | Pinata |
| RPC | Helius |

---

## Prerequisites

```bash
# Rust toolchain
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add bpfel-unknown-unknown

# Solana CLI
sh -c "$(curl -sSfL https://release.anza.xyz/stable/install)"
solana --version  # 1.18+

# Anchor CLI
cargo install --git https://github.com/coral-xyz/anchor anchor-cli --locked
anchor --version  # 0.30+

# Node.js + pnpm
node --version  # 20+
npm install -g pnpm@9

# Docker (for local services)
docker --version
```

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/fluer-protocol.git
cd fluer-protocol
pnpm install
```

### 2. Start local services

```bash
# Start PostgreSQL + TimescaleDB + Redis
docker compose up -d postgres redis

# Apply database migrations
cd services/api-gateway
DATABASE_URL=postgresql://postgres:fluerdev@localhost:5432/fluer \
  cargo sqlx migrate run
cd ../..
```

### 3. Configure environment

```bash
cp apps/web/.env.example apps/web/.env.local
cp services/api-gateway/.env.example services/api-gateway/.env
# Fill in: HELIUS_API_KEY, PINATA_JWT, program IDs after deployment
```

### 4. Generate vanity mint pool

```bash
# Generate 100 vanity keypairs (suffix: flur) into Redis
# Run once before launch; background replenisher maintains the pool
pnpm vanity:generate -- --count 100
```

### 5. Build and deploy smart contracts

```bash
cd programs

# Build
anchor build

# Deploy to devnet
anchor deploy --provider.cluster devnet

# Update program IDs in:
# - Anchor.toml
# - apps/web/.env.local
# - services/api-gateway/.env
```

### 6. Start all services

```bash
# API Gateway
cd services && cargo run --bin api-gateway

# Market Factory (separate terminal)
cargo run --bin market-factory

# Price Aggregator (separate terminal)
cargo run --bin price-aggregator

# Next.js frontend (separate terminal)
cd apps/web && pnpm dev
```

Open [http://localhost:3000](http://localhost:3000)

---

## Smart Contracts

### fluer_launchpad

Constant-product bonding curve (same formula as pump.fun, extended with FLUER-specific features):

- **Virtual reserves**: 30 SOL / 1.073B tokens at launch
- **Graduation**: ~85 SOL real SOL raised
- **Supply**: 1B tokens total, 80% on curve
- **Fees**: 1% trading fee (30% creator, 70% treasury)
- **Anti-snipe**: 30s window, max 0.1 SOL per wallet
- **Name enforcement**: All tokens end with ` · FLUER` on-chain

### fluer_perp_engine

Virtual AMM perpetuals derived from Perpetual Protocol v1 with Drift Protocol improvements:

- **Leverage**: 1× to 5×
- **Taker fee**: 0.1% / Maker rebate: 0.02%
- **Maintenance margin**: 6.25%
- **Funding**: Hourly, ±0.3% max per interval
- **Market tiers**: T1 ($100K depth) → T2 ($500K) → T3 ($2M)

### fluer_prediction

Binary AMM prediction markets using constant product pricing:
- Auto-created on token graduation (2x/5x/10x price targets)
- Creator royalty: 0.5% of winning pool
- Protocol fee: 2%
- Resolution: On-chain oracle + admin multisig

---

## Design System

FLUER uses a custom dark luxury fintech aesthetic:

| Token | Value |
|---|---|
| Background base | `#0A0A0B` |
| Background elevated | `#111114` |
| Accent (FLUER Purple) | `#7C5CFC` |
| Positive (green) | `#22C55E` |
| Negative (red) | `#EF4444` |
| Font display | Geist Sans |
| Font mono | Geist Mono |

All icons are custom SVG components — no emoji, no icon fonts.

---

## API Reference

```
GET  /api/v1/markets              List all perpetual markets
GET  /api/v1/markets/:id          Get market detail
GET  /api/v1/markets/:id/candles  OHLCV bars (1m/5m/15m/1h/4h/1d)
GET  /api/v1/tokens               List tokens (sort, filter, paginate)
GET  /api/v1/tokens/:ca           Token detail
GET  /api/v1/tokens/:ca/chart     Token price history
POST /api/v1/launch/prepare       Prepare launch transaction
POST /api/v1/launch/upload-metadata  Upload image to IPFS
GET  /api/v1/predictions          List prediction markets
GET  /api/v1/predictions/:id      Prediction detail
WS   /ws                          Real-time event stream
```

---

## WebSocket Events

```typescript
TOKEN_LAUNCHED      // New token created
TOKEN_GRADUATED     // Token reached graduation threshold
CURVE_TRADE         // Buy/sell on bonding curve
PRICE_UPDATE        // Perp market price change
TRADE               // Perp trade executed
FUNDING_RATE        // Hourly funding settled
LIQUIDATION         // Position liquidated
PREDICTION_CREATED  // New prediction market
PREDICTION_RESOLVED // Market outcome resolved
PROTOCOL_STATS      // Global stats (every 30s)
```

---

## Deployment

### Mainnet Checklist

- [ ] Anchor programs audited (zero findings)
- [ ] Admin keypair → Squads multisig (3/5)
- [ ] $FLUER token minted and distributed
- [ ] Vanity pool: minimum 500 keypairs in Redis
- [ ] Helius RPC dedicated endpoint
- [ ] Pyth oracle IDs verified for all supported tokens
- [ ] TimescaleDB production instance (16 CPU, 64GB RAM)
- [ ] Redis Cluster with persistence enabled
- [ ] API Gateway behind Cloudflare (DDoS, rate limiting)
- [ ] Frontend on Vercel or self-hosted with CDN

### Environment Security

- Private keys encrypted with AES-256-GCM, KMS-managed encryption key
- Vanity keypairs: public key stored in PostgreSQL, private key encrypted in Redis
- Admin wallet: Squads multisig — NEVER a single-key wallet
- All secrets in environment variables — zero secrets in codebase

---

## License

MIT — see [LICENSE](./LICENSE)

---

*Built on Solana. Powered by FLUER.*
