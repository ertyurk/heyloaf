# Heyloaf Initial Setup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Set up monorepo with Docker Compose (PostgreSQL), Rust backend (auth, company, products, categories), and TanStack Start frontend scaffolding.

**Architecture:** shadcn preset generated FE base (apps/web + packages/ui). Rust workspace under core/ with api, dal, common, cli crates. Patterns ported from Athena (Axum 0.8, JWT auth, handler/service/repo, fire-and-forget audit, strict clippy). PostgreSQL + SQLx replaces SurrealDB.

**Tech Stack:** Rust/Axum, PostgreSQL/SQLx, TanStack Start, React 19, Tailwind CSS 4, shadcn (base-nova), Turborepo, pnpm, Biome, just, Docker Compose.

---

## Task 1: Monorepo Root Setup

**Files:**
- Modify: `package.json`
- Modify: `pnpm-workspace.yaml`
- Modify: `.gitignore`
- Create: `biome.json`
- Delete: `.prettierrc`, `.prettierignore`
- Modify: `turbo.json`

**Step 1:** Update `package.json` — replace prettier with biome, add workspace scripts, update packageManager to latest pnpm.

**Step 2:** Update `pnpm-workspace.yaml` — add `packages/*` entries.

**Step 3:** Update `.gitignore` — add Rust targets, Docker volumes, .env, SQLx, IDE files.

**Step 4:** Create `biome.json` — strict linting config matching Athena approach.

**Step 5:** Delete `.prettierrc` and `.prettierignore` — replaced by biome.

**Step 6:** Update `turbo.json` — add lint/check tasks for biome.

**Step 7:** Update `apps/web/package.json` — replace eslint with biome, replace prettier scripts. Delete `apps/web/eslint.config.js`.

**Step 8:** Update `packages/ui/package.json` — replace eslint with biome. Delete `packages/ui/eslint.config.ts`.

**Step 9:** Run `pnpm install` to bootstrap workspace.

**Step 10:** Commit: "chore: scaffold monorepo with shadcn preset + biome"

---

## Task 2: Docker Compose + Infrastructure

**Files:**
- Create: `infrastructure/docker-compose.yml`
- Create: `.env.example`
- Create: `.env` (gitignored)

**Step 1:** Create `infrastructure/docker-compose.yml` — PostgreSQL 17, port 5432, named volume.

**Step 2:** Create `.env.example` with all env vars (DB, JWT, server config).

**Step 3:** Create `.env` from example with dev defaults.

**Step 4:** Start docker compose, verify PostgreSQL is running.

**Step 5:** Commit: "infra: add docker-compose with PostgreSQL 17"

---

## Task 3: Rust Workspace + Common Crate

**Files:**
- Create: `core/Cargo.toml` (workspace)
- Create: `core/crates/common/Cargo.toml`
- Create: `core/crates/common/src/lib.rs`
- Create: `core/crates/common/src/errors.rs`
- Create: `core/crates/common/src/types.rs`
- Create: `core/crates/common/src/config.rs`
- Create: `core/crates/common/src/telemetry.rs`
- Create: `core/crates/common/src/i18n.rs`
- Create: `core/crates/common/src/validation.rs`
- Create: `core/rust-toolchain.toml`
- Create: `core/.clippy.toml`

**Step 1:** Create `core/Cargo.toml` workspace with shared deps (axum 0.8, sqlx 0.8, tokio, serde, utoipa, uuid, chrono, thiserror, anyhow, argon2, jsonwebtoken, clap, dotenvy, tracing, validator). Strict clippy deny config. Release profile with LTO.

**Step 2:** Create `core/rust-toolchain.toml` — pin to stable.

**Step 3:** Create common crate — `config.rs` (env-based config loading), `errors.rs` (AppError enum with IntoResponse), `types.rs` (domain types, UUIDs), `telemetry.rs` (tracing setup), `i18n.rs` (TR/EN error messages), `validation.rs`.

**Step 4:** `cargo check` to verify compilation.

**Step 5:** Commit: "feat: add Rust workspace with common crate"

---

## Task 4: DAL Crate + Database Migrations

**Files:**
- Create: `core/crates/dal/Cargo.toml`
- Create: `core/crates/dal/src/lib.rs`
- Create: `core/crates/dal/src/pool.rs`
- Create: `core/crates/dal/src/models/mod.rs`
- Create: `core/crates/dal/src/models/company.rs`
- Create: `core/crates/dal/src/models/user.rs`
- Create: `core/crates/dal/src/models/product.rs`
- Create: `core/crates/dal/src/models/category.rs`
- Create: `core/crates/dal/src/repositories/mod.rs`
- Create: `core/crates/dal/src/repositories/company.rs`
- Create: `core/crates/dal/src/repositories/user.rs`
- Create: `core/crates/dal/src/repositories/product.rs`
- Create: `core/crates/dal/src/repositories/category.rs`
- Create: `core/crates/dal/migrations/00001_initial_schema.sql`

**Step 1:** Create migration `00001_initial_schema.sql`:
- `companies` table (id, name, tax_number, address, phone, email, website, logo_url, default_currency, default_tax_rate, default_language, timezone, settings JSONB, created_at, updated_at)
- `users` table (id, name, email, password_hash, is_super_admin, metadata JSONB, created_at, updated_at)
- `user_companies` table (id, user_id, company_id, role, permissions JSONB, is_active, created_at, updated_at)
- `product_categories` table (id, company_id, name, description, parent_id self-ref, display_order, pos_visible, status, depth, created_at, updated_at)
- `products` table (id, company_id, name, code, barcode, category_id, product_type enum, status enum, stock_status enum, unit_of_measure, sale_unit_type, plu_type, plu_code, scale_enabled, tax_rate, stock_tracking, min_stock_level, last_purchase_price, calculated_cost, image_url, recipe JSONB, purchase_options JSONB, created_at, updated_at)
- Enums: product_type, product_status, stock_status
- RLS policies on all business tables
- updated_at trigger function
- Partial unique indexes (code unique per company among active products)

**Step 2:** Create `pool.rs` — SQLx PgPool setup from config.

**Step 3:** Create model structs matching tables (with sqlx::FromRow).

**Step 4:** Create repositories — CRUD methods with compile-time checked queries using `sqlx::query_as!`.

**Step 5:** Run migration against Docker PostgreSQL.

**Step 6:** `cargo check` to verify.

**Step 7:** Commit: "feat: add DAL crate with initial schema + repositories"

---

## Task 5: API Crate (Server + Auth)

**Files:**
- Create: `core/crates/api/Cargo.toml`
- Create: `core/crates/api/src/main.rs`
- Create: `core/crates/api/src/state.rs`
- Create: `core/crates/api/src/routes.rs`
- Create: `core/crates/api/src/middleware/mod.rs`
- Create: `core/crates/api/src/middleware/auth.rs`
- Create: `core/crates/api/src/middleware/company_guard.rs`
- Create: `core/crates/api/src/middleware/language.rs`
- Create: `core/crates/api/src/middleware/request_context.rs`
- Create: `core/crates/api/src/extractors/mod.rs`
- Create: `core/crates/api/src/extractors/validated.rs`
- Create: `core/crates/api/src/handlers/mod.rs`
- Create: `core/crates/api/src/handlers/auth.rs`
- Create: `core/crates/api/src/handlers/health.rs`

**Step 1:** Create `state.rs` — AppState with PgPool, TokenService, Config.

**Step 2:** Create `main.rs` — startup sequence: config -> telemetry -> db pool -> run migrations -> build routes -> serve.

**Step 3:** Create auth middleware — JWT verification, extract AuthUser into extensions.

**Step 4:** Create company_guard middleware — extract company_id from auth user, set PostgreSQL RLS var.

**Step 5:** Create language middleware — read `x-app-language` header.

**Step 6:** Create request_context middleware — extract IP, user-agent.

**Step 7:** Create ValidatedJson/ValidatedQuery extractors.

**Step 8:** Create auth handlers — login, register, refresh, logout, switch-company.

**Step 9:** Create health handler.

**Step 10:** Create `routes.rs` — register all routes with middleware layers.

**Step 11:** `cargo run` to verify server starts and /health works.

**Step 12:** Commit: "feat: add API crate with auth handlers + middleware"

---

## Task 6: API Handlers (Company, Products, Categories)

**Files:**
- Create: `core/crates/api/src/handlers/company.rs`
- Create: `core/crates/api/src/handlers/products.rs`
- Create: `core/crates/api/src/handlers/categories.rs`
- Modify: `core/crates/api/src/routes.rs`

**Step 1:** Create company handlers — GET /company, PUT /company.

**Step 2:** Create category handlers — CRUD + list with hierarchy.

**Step 3:** Create product handlers — CRUD + list with filters/pagination, bulk activate/deactivate/category.

**Step 4:** Register all routes.

**Step 5:** `cargo run` and test endpoints with curl.

**Step 6:** Commit: "feat: add company, product, category handlers"

---

## Task 7: CLI Crate

**Files:**
- Create: `core/crates/cli/Cargo.toml`
- Create: `core/crates/cli/src/main.rs`
- Create: `core/crates/cli/src/commands/mod.rs`
- Create: `core/crates/cli/src/commands/create_company.rs`
- Create: `core/crates/cli/src/commands/create_user.rs`
- Create: `core/crates/cli/src/commands/create_migration.rs`
- Create: `core/crates/cli/src/commands/seed.rs`

**Step 1:** Create CLI with clap — subcommands: create-company, create-user, create-migration, seed.

**Step 2:** `create-migration` — generates timestamped SQL file in dal/migrations/.

**Step 3:** `create-company` — inserts company record.

**Step 4:** `create-user` — creates user with hashed password + user_company link.

**Step 5:** `seed` — creates dev company + admin user + sample categories + sample products.

**Step 6:** Test: run seed, verify data in PostgreSQL.

**Step 7:** Commit: "feat: add CLI crate with admin commands + seed"

---

## Task 8: Justfile + CLAUDE.md Files

**Files:**
- Create: `justfile`
- Create: `CLAUDE.md`
- Create: `core/CLAUDE.md`
- Create: `apps/web/CLAUDE.md`
- Create: `packages/ui/CLAUDE.md`

**Step 1:** Create `justfile` with command groups:
- dev: `dev-api`, `dev-web`, `dev-all`
- build: `build-api`, `build-web`, `build-all`
- db: `db-up`, `db-down`, `db-reset`, `db-migrate`, `db-seed`
- quality: `lint`, `fmt`, `check`, `clippy`
- admin: `create-company`, `create-user`, `create-migration`
- setup: first-time setup (docker up, migrate, seed, pnpm install)

**Step 2:** Create root `CLAUDE.md` — monorepo overview, structure, commands, conventions, cross-boundary workflow.

**Step 3:** Create `core/CLAUDE.md` — Rust crate guide, patterns, clippy config, SQLx patterns.

**Step 4:** Create `apps/web/CLAUDE.md` — TanStack Start patterns, routing, shadcn usage.

**Step 5:** Create `packages/ui/CLAUDE.md` — shadcn component pattern, Base UI, CVA, cn().

**Step 6:** Commit: "chore: add justfile + CLAUDE.md project guides"

---

## Task 9: Services Crate (Audit)

**Files:**
- Create: `core/crates/services/Cargo.toml`
- Create: `core/crates/services/src/lib.rs`
- Create: `core/crates/services/src/audit_service.rs`
- Create: `core/crates/dal/migrations/00002_audit_logs.sql`

**Step 1:** Create migration for `audit_logs` table.

**Step 2:** Create AuditService — fire-and-forget via tokio::spawn, builder pattern matching Athena.

**Step 3:** Create AuditRepository in dal.

**Step 4:** Wire audit into API handlers (products, categories, company).

**Step 5:** Run migration, test audit logging.

**Step 6:** Commit: "feat: add audit trail service"

---

## Task 10: OpenAPI + API Client Package

**Files:**
- Modify: `core/crates/api/src/routes.rs` (add OpenAPI)
- Create: `packages/api-client/package.json`
- Create: `packages/api-client/src/index.ts`
- Modify: `justfile` (add gen-api command)

**Step 1:** Add utoipa OpenAPI annotations to all handlers + types.

**Step 2:** Serve OpenAPI spec at `/api-docs/openapi.json`.

**Step 3:** Create `packages/api-client` — placeholder for generated TypeScript client.

**Step 4:** Add `just gen-api` command to generate TypeScript from OpenAPI spec.

**Step 5:** Commit: "feat: add OpenAPI spec + api-client package scaffold"
