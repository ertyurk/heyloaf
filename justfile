# Heyloaf - Task Runner
# Usage: just <command>

set dotenv-load

# ─── Setup ───────────────────────────────────────────────────────────────────

# First-time project setup
setup:
    just db-up
    sleep 3
    just db-migrate
    pnpm install
    just seed
    @echo "Setup complete! Run 'just dev-all' to start."

# ─── Dev ─────────────────────────────────────────────────────────────────────

# Run API server (with cargo watch if available)
dev-api:
    cd core && cargo run --bin heyloaf-api

# Run web app
dev-web:
    pnpm --filter @heyloaf/web dev

# Run API + web in parallel
dev-all:
    just dev-api & just dev-web & wait

# ─── Build ───────────────────────────────────────────────────────────────────

# Build API (release)
build-api:
    cd core && cargo build --release --bin heyloaf-api

# Build web app
build-web:
    pnpm --filter @heyloaf/web build

# Build everything
build-all: build-api build-web

# ─── Database ────────────────────────────────────────────────────────────────

# Start PostgreSQL via docker compose
db-up:
    docker compose -f infrastructure/docker-compose.yml up -d

# Stop PostgreSQL
db-down:
    docker compose -f infrastructure/docker-compose.yml down

# Run database migrations
db-migrate:
    cd core && cargo run --bin heyloaf-api -- migrate 2>/dev/null || cd core && sqlx migrate run --source crates/dal/src/migrations

# Reset database (destroy + recreate)
db-reset:
    docker compose -f infrastructure/docker-compose.yml down -v
    just db-up
    sleep 3
    just db-migrate

# ─── Admin ───────────────────────────────────────────────────────────────────

# Seed development data
seed:
    cd core && cargo run --bin heyloaf-cli -- seed

# Create a new company
create-company name:
    cd core && cargo run --bin heyloaf-cli -- create-company --name "{{name}}"

# Create a new user
create-user name email password company_id="" role="admin":
    cd core && cargo run --bin heyloaf-cli -- create-user --name "{{name}}" --email "{{email}}" --password "{{password}}" {{if company_id != "" { "--company-id " + company_id } else { "" } }} --role "{{role}}"

# Create a new migration file
create-migration name:
    cd core && cargo run --bin heyloaf-cli -- create-migration --name "{{name}}"

# ─── Quality ─────────────────────────────────────────────────────────────────

# Run all linters
lint: lint-rs lint-ts

# Lint Rust code
lint-rs:
    cd core && cargo clippy --all-targets --all-features -- -D warnings

# Lint TypeScript code
lint-ts:
    pnpm check

# Format all code
fmt: fmt-rs fmt-ts

# Format Rust code
fmt-rs:
    cd core && cargo fmt --all

# Format TypeScript code
fmt-ts:
    pnpm check:fix

# Check Rust code compiles
check:
    cd core && cargo check --all-targets

# Run Rust tests
test:
    cd core && cargo test

# Typecheck TypeScript
typecheck:
    pnpm typecheck

# ─── Utils ───────────────────────────────────────────────────────────────────

# Generate OpenAPI TypeScript client (API server must be running)
gen-api:
    pnpm --filter @heyloaf/api-client gen

# Clean all build artifacts
clean:
    cd core && cargo clean
    rm -rf node_modules apps/*/node_modules packages/*/node_modules
    rm -rf apps/*/.output apps/*/.nitro apps/*/.tanstack apps/*/.vinxi
