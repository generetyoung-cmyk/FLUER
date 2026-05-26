# FLUER Protocol — Project Structure

```
fluer-protocol/
├── .github/
│   └── workflows/
│       └── ci.yml                      GitHub Actions CI/CD pipeline
│
├── apps/
│   └── web/                            Next.js 15 + TypeScript frontend
│       ├── .env.example                Environment variable template
│       ├── next.config.ts              Next.js config with Turbopack
│       ├── tailwind.config.ts          FLUER design system tokens
│       ├── postcss.config.js
│       ├── tsconfig.json
│       └── src/
│           ├── app/                    Next.js App Router pages
│           │   ├── layout.tsx          Root layout (fonts, providers, toaster)
│           │   ├── page.tsx            / — Discovery / home feed
│           │   ├── loading.tsx         Global loading state
│           │   ├── error.tsx           Global error boundary
│           │   ├── not-found.tsx       404 page
│           │   ├── launch/
│           │   │   └── page.tsx        /launch — Token creation wizard
│           │   ├── trade/
│           │   │   ├── page.tsx        /trade — Perp markets overview
│           │   │   └── [market]/
│           │   │       └── page.tsx    /trade/:id — Full trading terminal
│           │   ├── predict/
│           │   │   └── page.tsx        /predict — Prediction markets
│           │   └── token/
│           │       └── [ca]/
│           │           └── page.tsx    /token/:ca — Token detail page
│           │
│           ├── components/
│           │   ├── layout/
│           │   │   └── Header.tsx      Global header + nav + wallet
│           │   ├── wallet/
│           │   │   ├── WalletContextProvider.tsx   Solana wallet adapter setup
│           │   │   └── WalletButton.tsx             Connect button + dropdown
│           │   ├── discovery/
│           │   │   ├── MarketTable.tsx    Token list with live prices
│           │   │   ├── LiveFeed.tsx       Real-time global event stream
│           │   │   ├── ProtocolStatsBanner.tsx
│           │   │   └── TokenPageClient.tsx  Token detail client component
│           │   ├── trade/
│           │   │   ├── TradingChart.tsx    lightweight-charts v4 chart
│           │   │   ├── OrderPanel.tsx      Leverage trading form
│           │   │   ├── MarketInfoBar.tsx   Live market stats bar
│           │   │   ├── PositionsPanel.tsx  Open positions + history
│           │   │   ├── RecentTrades.tsx    Live trade tape
│           │   │   ├── MarketsOverview.tsx All perp markets grid
│           │   │   └── TradeTerminal.tsx   Full terminal layout
│           │   ├── launch/
│           │   │   ├── LaunchWizard.tsx    Multi-step token creation
│           │   │   └── LaunchFeed.tsx      Recent launches sidebar
│           │   ├── predict/
│           │   │   └── PredictionFeed.tsx  Prediction market cards
│           │   └── ui/
│           │       ├── Skeleton.tsx
│           │       └── icons/
│           │           ├── FluerLogo.tsx   FLUER crystal SVG logo
│           │           ├── WalletIcons.tsx Phantom, Backpack, Solflare, OKX SVGs
│           │           └── NavIcons.tsx    All navigation SVG icons
│           │
│           └── lib/
│               ├── constants.ts        RPC, program IDs, design constants
│               ├── types.ts            All shared TypeScript types
│               ├── utils.ts            Formatting, math, class helpers
│               ├── api/
│               │   ├── fluer.ts        FLUER backend REST client
│               │   ├── gecko.ts        GeckoTerminal API (real-time prices)
│               │   ├── helius.ts       Helius DAS API (metadata, holders)
│               │   └── pumpportal.ts   PumpPortal Phase 1 launchpad
│               ├── hooks/
│               │   ├── useWebSocket.ts      Auto-reconnect WS hook
│               │   ├── useMarkets.ts        Markets + real-time price injection
│               │   ├── usePosition.ts       Position open/close
│               │   ├── usePriceData.ts      SOL price from Pyth Hermes
│               │   └── usePumpPortalFeed.ts Phase 1 live feed bridge
│               └── store/
│                   ├── QueryProvider.tsx    TanStack Query setup
│                   ├── useAppStore.ts       Global Zustand store
│                   └── useTradeStore.ts     Trade form + position state
│
├── programs/                           Solana Anchor smart contracts
│   ├── Anchor.toml
│   ├── Cargo.toml
│   ├── tests/
│   │   └── launchpad.test.ts          Integration test suite
│   ├── fluer_launchpad/               Bonding curve token factory
│   │   └── src/
│   │       ├── lib.rs                 Program entry + instruction dispatching
│   │       ├── errors.rs              Custom error codes
│   │       ├── state/mod.rs           LaunchpadConfig, TokenListing, CreatorProfile
│   │       ├── math/bonding_curve.rs  Constant-product AMM math (tested)
│   │       └── instructions/
│   │           ├── initialize.rs      Admin initialization
│   │           ├── create_token.rs    Token creation + fee burn
│   │           └── curve_trade.rs     Buy/sell on curve + auto-graduation
│   ├── fluer_perp_engine/             vAMM perpetual markets
│   │   └── src/
│   │       ├── lib.rs                 Program + create_market + open/close position
│   │       ├── state/mod.rs           PerpMarket, Position, InsuranceFund
│   │       └── math/vamm.rs           vAMM math, funding, liquidation prices
│   ├── fluer_prediction/              Binary prediction markets
│   │   └── src/
│   │       ├── lib.rs                 Initialize + create/bet/resolve/claim
│   │       ├── errors.rs
│   │       ├── state/mod.rs           PredictionMarket, PredictionPosition
│   │       └── instructions/mod.rs    All prediction market instructions
│   └── fluer_token/                   $FLUER SPL token + staking
│       └── src/
│           └── lib.rs                 Stake/unstake with tier rewards
│
├── services/                          Rust backend microservices
│   ├── Cargo.toml                     Workspace
│   ├── api-gateway/                   Axum REST + WebSocket server
│   │   ├── Cargo.toml
│   │   ├── Dockerfile
│   │   ├── .env.example
│   │   ├── migrations/
│   │   │   ├── 001_core_schema.sql    Core tables (TimescaleDB hypertables)
│   │   │   ├── 002_support_tables.sql Support tables + cursor tracking
│   │   │   └── 003_optimizations.sql  Indices, views, continuous aggregates
│   │   └── src/
│   │       ├── main.rs                Axum server + router setup
│   │       ├── state.rs               AppState (DB, Redis, WS broadcast, config)
│   │       ├── websocket.rs           WS hub with subscription management
│   │       ├── middleware/
│   │       │   ├── auth.rs            SIWS (Sign-In With Solana) JWT auth
│   │       │   └── rate_limit.rs      Redis sliding window rate limiting
│   │       └── routes/
│   │           ├── markets.rs         GET /api/v1/markets + candles + trades
│   │           ├── tokens.rs          GET /api/v1/tokens + chart + holders
│   │           ├── launch.rs          POST /api/v1/launch/* (IPFS + PumpPortal)
│   │           ├── predictions.rs     GET /api/v1/predictions
│   │           ├── discovery.rs       GET /api/v1/discover + search + stats
│   │           ├── stats.rs           GET /api/v1/stats/protocol
│   │           └── portfolio.rs       GET /api/v1/portfolio/:wallet
│   ├── market-factory/                Graduation monitor + event indexer
│   │   └── src/
│   │       ├── main.rs                Orchestrates all factory tasks
│   │       ├── indexer.rs             Yellowstone gRPC / RPC polling
│   │       ├── graduation_monitor.rs  Auto-deploys perp markets
│   │       └── market_deployer.rs     Anchor instruction builder
│   ├── price-aggregator/              Pyth + GeckoTerminal price feeds
│   │   └── src/
│   │       └── main.rs                1s price loop + hourly funding
│   └── vanity-grinder/                Parallel keypair grinder
│       └── src/
│           └── main.rs                Rayon multi-thread 'flur' suffix grinder
│
├── packages/
│   ├── sdk/                           TypeScript SDK (@fluer/sdk)
│   │   ├── package.json
│   │   ├── tsconfig.json
│   │   └── src/
│   │       ├── index.ts               Main exports
│   │       ├── launchpad.ts           Bonding curve math + account parser
│   │       └── perp.ts                vAMM math + PDA helpers
│   └── idl/                           Anchor IDL files
│       ├── fluer_launchpad.json
│       ├── fluer_perp_engine.json
│       └── fluer_prediction.json
│
├── scripts/
│   └── deploy-mainnet.sh              Mainnet deployment automation
│
├── .github/workflows/ci.yml           CI: TypeScript, Rust, Anchor, Docker
├── .gitignore
├── docker-compose.yml                 Local dev: PostgreSQL + Redis + services
├── Makefile                           All dev/build/deploy commands
├── package.json                       Root workspace (pnpm)
├── pnpm-workspace.yaml
├── turbo.json                         Turbo monorepo pipeline
├── vercel.json                        Frontend deployment config
└── README.md                          Full setup + architecture docs
```

## Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Launchpad Phase 1 | PumpPortal API | Fast time-to-market, zero program risk, pump.fun liquidity |
| Launchpad Phase 2 | Native Anchor program | Full on-chain control, FLUER suffix enforcement, creator rewards |
| AMM model | Constant product (x*y=k) | Battle-tested, identical to pump.fun, familiar to users |
| Perp model | vAMM (virtual AMM) | No liquidity needed at launch, auto-calibrated to token price |
| Oracle | Pyth Network Hermes | Sub-second latency, on-chain verifiable, SOL-native |
| Candle DB | TimescaleDB | Purpose-built for time series, 10-100x faster than plain Postgres |
| Real-time | Redis PubSub + WS | WebSocket hub pattern, client subscriptions by market/mint |
| Token program | SPL Token-2022 | Extension support (transfer fees, metadata), future-proof |
| Wallet auth | SIWS (Sign-In With Solana) | Trustless, no password, wallet signature proves identity |
| Charts | lightweight-charts v4 | TradingView quality, smallest bundle, production-grade |
| Frontend state | Zustand + TanStack Query | Minimal boilerplate, WS injection into cached queries |
