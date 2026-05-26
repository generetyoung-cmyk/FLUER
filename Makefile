# FLUER Protocol — Makefile
# Usage: make <target>

.PHONY: help dev build test clean deploy-devnet deploy-mainnet \
        services-up services-down db-migrate vanity-gen lint type-check

# ── Colors ────────────────────────────────────────────────────
RESET  := \033[0m
BOLD   := \033[1m
CYAN   := \033[36m
GREEN  := \033[32m
YELLOW := \033[33m
RED    := \033[31m

help: ## Show this help
	@echo "$(BOLD)FLUER Protocol$(RESET)"
	@echo "───────────────────────────────────────"
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "$(CYAN)%-20s$(RESET) %s\n", $$1, $$2}'

# ── Infrastructure ────────────────────────────────────────────

services-up: ## Start PostgreSQL + Redis via Docker Compose
	@echo "$(GREEN)Starting infrastructure...$(RESET)"
	docker compose up -d postgres redis
	@echo "$(GREEN)Waiting for services...$(RESET)"
	@sleep 3
	@$(MAKE) db-migrate

services-down: ## Stop all Docker services
	docker compose down

services-logs: ## Stream logs from all services
	docker compose logs -f

db-migrate: ## Run all pending database migrations
	@echo "$(GREEN)Running migrations...$(RESET)"
	cd services/api-gateway && \
		DATABASE_URL=$${DATABASE_URL:-postgresql://postgres:fluerdev@localhost:5432/fluer} \
		cargo sqlx migrate run
	@echo "$(GREEN)Migrations complete$(RESET)"

db-reset: ## Drop and recreate the database (DESTRUCTIVE)
	@echo "$(RED)Dropping database...$(RESET)"
	docker compose exec postgres psql -U postgres -c "DROP DATABASE IF EXISTS fluer; CREATE DATABASE fluer;"
	@$(MAKE) db-migrate

# ── Smart Contracts ───────────────────────────────────────────

programs-build: ## Build all Anchor programs
	@echo "$(GREEN)Building Anchor programs...$(RESET)"
	cd programs && anchor build

programs-test: ## Run Anchor program tests
	cd programs && anchor test

programs-clean: ## Clean Anchor build artifacts
	cd programs && anchor clean

deploy-devnet: ## Deploy programs to Solana devnet
	@echo "$(YELLOW)Deploying to devnet...$(RESET)"
	cd programs && anchor deploy --provider.cluster devnet
	@echo "$(GREEN)Devnet deployment complete$(RESET)"
	@echo "$(YELLOW)Don't forget to update program IDs in .env files!$(RESET)"

deploy-mainnet: ## Deploy programs to Solana mainnet (requires confirmation)
	@echo "$(RED)MAINNET DEPLOYMENT — Are you sure? (Ctrl+C to cancel)$(RESET)"
	@sleep 5
	cd programs && anchor deploy --provider.cluster mainnet

idl-generate: ## Generate updated IDL files after program changes
	cd programs && anchor build
	@echo "$(GREEN)Copying IDL files...$(RESET)"
	cp programs/target/idl/fluer_launchpad.json packages/idl/
	cp programs/target/idl/fluer_perp_engine.json packages/idl/
	cp programs/target/idl/fluer_prediction.json packages/idl/
	cp programs/target/idl/fluer_token.json packages/idl/

# ── Rust Services ─────────────────────────────────────────────

services-build: ## Build all Rust services (release)
	@echo "$(GREEN)Building Rust services...$(RESET)"
	cd services && cargo build --release

services-dev-api: ## Run API gateway in dev mode
	cd services && RUST_LOG=fluer_api=debug cargo run --bin api-gateway

services-dev-factory: ## Run market factory in dev mode
	cd services && RUST_LOG=market_factory=debug cargo run --bin market-factory

services-dev-prices: ## Run price aggregator in dev mode
	cd services && RUST_LOG=price_aggregator=debug cargo run --bin price-aggregator

services-test: ## Run Rust service tests
	cd services && cargo test

services-lint: ## Lint Rust services
	cd services && cargo clippy -- -D warnings

# ── Frontend ──────────────────────────────────────────────────

install: ## Install all Node.js dependencies
	pnpm install

dev: ## Start Next.js frontend in dev mode (requires services-up first)
	@echo "$(GREEN)Starting FLUER frontend...$(RESET)"
	cd apps/web && pnpm dev

web-build: ## Build Next.js production bundle
	cd apps/web && pnpm build

web-start: ## Start Next.js production server
	cd apps/web && pnpm start

type-check: ## TypeScript type checking
	cd apps/web && pnpm type-check
	cd packages/sdk && pnpm build

lint: ## Lint TypeScript/React code
	cd apps/web && pnpm lint

# ── SDK ───────────────────────────────────────────────────────

sdk-build: ## Build the TypeScript SDK
	cd packages/sdk && pnpm build

sdk-test: ## Run SDK tests
	cd packages/sdk && pnpm test

# ── Vanity Grinder ────────────────────────────────────────────

vanity-gen: ## Generate 100 vanity keypairs (suffix: flur)
	@echo "$(GREEN)Generating vanity keypairs with suffix 'flur'...$(RESET)"
	cd services && cargo run --release --bin vanity-grinder -- \
		--suffix flur \
		--count 100 \
		--output-dir ./vanity-pool
	@echo "$(GREEN)Done! Upload pool to Redis: make vanity-upload$(RESET)"

vanity-gen-fast: ## Generate 10 vanity keypairs (quick test)
	cd services && cargo run --release --bin vanity-grinder -- \
		--suffix flur --count 10 --dry-run

vanity-upload: ## Upload generated vanity pool to Redis
	@echo "$(YELLOW)Uploading vanity pool to Redis...$(RESET)"
	@for f in services/vanity-pool/*.json; do \
		pubkey=$$(cat $$f | python3 -c "import sys,json; print(json.load(sys.stdin)['pubkey'])"); \
		redis-cli rpush "vanity_pool:flur" "$$pubkey"; \
		echo "Added: $$pubkey"; \
	done
	@echo "Pool size: $$(redis-cli llen vanity_pool:flur)"

# ── Full Stack ────────────────────────────────────────────────

setup: ## Full local dev setup (first time)
	@echo "$(BOLD)$(GREEN)Setting up FLUER Protocol local dev environment...$(RESET)"
	@command -v docker >/dev/null 2>&1 || (echo "$(RED)Docker required$(RESET)" && exit 1)
	@command -v pnpm >/dev/null 2>&1 || (echo "$(RED)pnpm required: npm i -g pnpm$(RESET)" && exit 1)
	@command -v cargo >/dev/null 2>&1 || (echo "$(RED)Rust required: https://rustup.rs$(RESET)" && exit 1)
	$(MAKE) install
	$(MAKE) services-up
	$(MAKE) sdk-build
	@echo ""
	@echo "$(BOLD)$(GREEN)Setup complete!$(RESET)"
	@echo ""
	@echo "$(CYAN)Next steps:$(RESET)"
	@echo "  1. Copy: cp apps/web/.env.example apps/web/.env.local"
	@echo "  2. Fill in: HELIUS_API_KEY, PINATA_JWT in .env.local"
	@echo "  3. Run:  make dev"
	@echo "  4. Open: http://localhost:3000"

dev-full: ## Start all services concurrently for local development
	@echo "$(GREEN)Starting full stack...$(RESET)"
	@trap 'kill 0' INT; \
	$(MAKE) services-dev-api & \
	$(MAKE) services-dev-prices & \
	$(MAKE) dev & \
	wait

# ── CI ────────────────────────────────────────────────────────

ci: ## Run full CI suite
	$(MAKE) type-check
	$(MAKE) lint
	$(MAKE) services-test
	$(MAKE) programs-build

clean: ## Clean all build artifacts
	cd programs && anchor clean 2>/dev/null || true
	cd services && cargo clean
	cd apps/web && rm -rf .next out
	cd packages/sdk && rm -rf dist
	@echo "$(GREEN)Clean complete$(RESET)"
