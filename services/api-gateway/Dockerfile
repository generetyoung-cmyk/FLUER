# ── FLUER API Gateway — Multi-stage Dockerfile ────────────────

# Stage 1: Builder
FROM rust:1.82-slim-bookworm AS builder

WORKDIR /app

# Install build dependencies
RUN apt-get update && apt-get install -y \
    pkg-config \
    libssl-dev \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Copy workspace files first for dependency caching
COPY Cargo.toml Cargo.toml
COPY api-gateway/Cargo.toml api-gateway/Cargo.toml
COPY market-factory/Cargo.toml market-factory/Cargo.toml
COPY price-aggregator/Cargo.toml price-aggregator/Cargo.toml
COPY vanity-grinder/Cargo.toml vanity-grinder/Cargo.toml

# Create stub lib files to cache dependency compilation
RUN for dir in api-gateway market-factory price-aggregator vanity-grinder; do \
    mkdir -p $dir/src && \
    echo "fn main() {}" > $dir/src/main.rs; \
done

# Compile dependencies
RUN cargo build --release --bin api-gateway 2>/dev/null || true

# Copy actual source
COPY . .

# Force recompile of our crates
RUN touch api-gateway/src/main.rs && \
    cargo build --release --bin api-gateway

# Stage 2: Runtime
FROM debian:bookworm-slim AS runtime

RUN apt-get update && apt-get install -y \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create non-root user
RUN groupadd -r fluer && useradd -r -g fluer fluer

WORKDIR /app

# Copy binary from builder
COPY --from=builder /app/target/release/api-gateway /app/api-gateway

# Copy migrations
COPY api-gateway/migrations /app/migrations

USER fluer

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8080/health || exit 1

CMD ["/app/api-gateway"]
