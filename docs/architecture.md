# Heyloaf - Technical Architecture

> Monorepo, multi-platform POS system. Rust backend, TanStack web, Tauri desktop, React Native mobile.

---

## Table of Contents

1. [Stack Summary](#stack-summary)
2. [Monorepo Structure](#monorepo-structure)
3. [Backend](#backend)
4. [Web App](#web-app)
5. [Desktop App](#desktop-app)
6. [Mobile App](#mobile-app)
7. [Shared Packages](#shared-packages)
8. [Database](#database)
9. [Authentication](#authentication)
10. [API Contract](#api-contract)
11. [File Storage](#file-storage)
12. [Real-Time](#real-time)
13. [Multi-Tenancy](#multi-tenancy)
14. [Internationalization](#internationalization)
15. [Audit Trail](#audit-trail)
16. [Deployment](#deployment)
17. [Future: Sync Engine](#future-sync-engine)

---

## Reference Project

Many backend patterns (auth, middleware, file storage, WebSocket, Docker, CI/CD) are reused from the Athena project:

```
/Users/meer/Developer/ls/gaia/athena
```

Key differences from Athena:

- **Database**: PostgreSQL + SQLx (Athena uses SurrealDB you port proper cli methods and migrations to sqlx here. including but not limited to migration file creation)
- **Product domain**: Entirely new (POS, recipes, production, stock)
- **Multi-tenancy**: company_id on every table + RLS (Athena uses different isolation)

---

## Stack Summary

| Layer          | Choice                                         |
| -------------- | ---------------------------------------------- |
| Monorepo       | pnpm + Turborepo (TS) + Cargo workspace (Rust) |
| Backend        | Rust / Axum                                    |
| Database       | PostgreSQL + SQLx                              |
| Web            | TanStack Start + React 19                      |
| Desktop        | Tauri 2                                        |
| Mobile         | React Native + Expo                            |
| API Contract   | OpenAPI (utoipa) -> TypeScript codegen         |
| Auth           | JWT access + httpOnly refresh cookie           |
| File Storage   | Cloudflare R2                                  |
| Real-Time      | WebSocket (Axum)                               |
| Styling        | Tailwind CSS 4                                 |
| Forms          | TanStack Form + Zod                            |
| State          | TanStack Query + Store                         |
| UI Pattern     | shadcn                                         |
| Task Runner    | just (justfile)                                |
| Linting (TS)   | Biome                                          |
| Linting (Rust) | Clippy (strict deny config)                    |

---

## Monorepo Structure

```
heyloaf/
├── apps/
│   ├── web/                  # TanStack Start (SSR + SPA)
│   ├── desktop/              # Tauri 2 (wraps web)
│   └── mobile/               # React Native + Expo
│
├── core/                     # Rust workspace
│   ├── Cargo.toml            # Workspace manifest
│   └── crates/
│       ├── api/              # Axum HTTP server (handlers, middleware, routes)
│       ├── dal/              # Data access layer (SQLx, repositories, migrations)
│       ├── common/           # Shared types, errors, validation, telemetry
│       ├── services/         # Business logic (stock cascades, invoice side effects, etc.)
│       └── cli/              # CLI tool for company provisioning & admin tasks
│
├── packages/
│   ├── api-client/           # Generated OpenAPI TypeScript client + TanStack Query hooks
│   ├── schemas/              # Zod schemas (shared validation)
│   ├── types/                # Shared TypeScript types
│   ├── ui/                   # Web UI component library (shadcn + Tailwind)
│   ├── ui-native/            # React Native components
│   ├── store/                # TanStack Store (auth, workspace, UI state)
│   ├── i18n/                 # Shared i18n strings (TR + EN)
│   └── config/               # Shared Biome config + tsconfig presets
│
├── infrastructure/
│   ├── docker-compose.yml    # PostgreSQL + Redis (dev)
│   ├── dockerfiles/
│   │   ├── api.Dockerfile    # Multi-stage Rust build
│   │   └── web.Dockerfile    # Node/pnpm multi-stage
│   └── workflows/            # GitHub Actions CI/CD
│
├── docs/
├── scripts/
├── package.json              # Root pnpm workspace
├── pnpm-workspace.yaml       # apps/* + packages/*
├── turbo.json                # Turborepo task graph
├── biome.json                # Linter config
├── justfile                  # Unified task runner
└── .env.example
```

---

## Backend

### Framework: Axum

Reuse patterns from Athena (`/Users/meer/Developer/ls/gaia/athena`):

- Axum 0.8 with tower-http middleware (CORS, tracing, compression)
- Tokio async runtime
- Modular handler/service/repository pattern

### Crate Structure

```
core/crates/
├── api/
│   ├── main.rs               # Startup: config -> telemetry -> DB pool -> Axum app
│   ├── config.rs              # App config from env
│   ├── routes.rs              # All route registration
│   ├── state.rs               # AppState (DB pool, R2 client, services)
│   ├── handlers/              # One file per domain (products, stock, invoices, etc.)
│   ├── middleware/            # Auth, rate limiting, request context, company guard, i18n
│   └── extractors/            # Custom Axum extractors (Language, CompanyId, etc.)
│
├── dal/
│   ├── pool.rs                # SQLx PgPool setup
│   ├── migrations/            # SQL migration files
│   ├── models/                # Rust structs mapping to Postgres tables
│   └── repositories/          # One file per table (CRUD + custom queries)
│
├── common/
│   ├── errors.rs              # Error types + Axum error responses (i18n-aware)
│   ├── types.rs               # Shared domain types
│   ├── validation.rs          # Input validation
│   ├── i18n.rs                # Backend i18n: error messages in TR/EN
│   └── telemetry.rs           # Logging, tracing, metrics
│
├── services/
│   ├── stock_integration.rs   # Stock cascade logic (purchase -> stock, production -> stock)
│   ├── smart_cascade.rs       # SEMI product cascade: check stock -> deduct or cascade to RAW
│   ├── invoice_service.rs     # Invoice side effects (stock + contact balance)
│   ├── production_service.rs  # Production side effects (stock in/out for materials)
│   ├── cost_calculator.rs     # Recipe cost computation
│   ├── audit_service.rs       # Non-blocking audit trail writer (background thread)
│   └── notification_service.rs # In-app notification generation
│
└── cli/
    ├── main.rs                # CLI entrypoint
    └── commands/
        ├── create_company.rs  # Provision new company
        ├── create_user.rs     # Create admin user for company
        ├── create_migration_file.rs         # Create serial migration file
        └── seed.rs            # Seed data for development

```

### Key Design Decisions

- **Services own business logic.** Handlers are thin -- validate input, call service, return response.
- **Repositories are 1:1 with tables.** No cross-table queries in repositories. Cross-table operations happen in services.
- **SQLx compile-time query checking.** All SQL queries verified at compile time against the actual database schema.
- **Company guard middleware.** Extracts company_id from authenticated user, injects into request extensions.
- **i18n middleware.** Reads `x-app-language` header, sets language context for error messages.
- **Audit writes are non-blocking.** Uses `tokio::spawn` to write audit records without blocking the response.

---

## Web App

### Framework: TanStack Start

- TanStack Start (SSR + SPA hybrid, runs on Nitro)
- TanStack Router (file-based routing)
- TanStack Query (server state)
- TanStack Form + Zod (forms + validation)
- TanStack Store (client state: auth, UI)
- React 19
- Tailwind CSS 4
- shadcn component pattern (Base UI primitives + Tailwind)

### Deployment: Cloudflare Pages

- Nitro `cloudflare-pages` preset
- SSR at the edge for initial page loads
- Client-side navigation after hydration
- API calls to Hetzner backend (CORS configured)

### Route Structure

```
/login                          # Public
/                               # Dashboard (admin only)
/products                       # Product list
/products/:id                   # Product detail/edit
/stock                          # Stock overview
/stock/count                    # Stock counting
/recipes                        # Recipe list
/recipes/:id                    # Recipe/variant editor
/production                     # Production records + sessions
/pos                            # Full-screen POS (no chrome)
/orders                         # Order history
/purchase/invoices              # Invoice list
/purchase/invoices/new          # New invoice
/purchase/invoices/:id/edit     # Edit invoice
/finance/contacts               # Contacts list
/reports                        # Reports hub
/settings                       # Settings hub
/settings/company               # Company profile
/settings/users                 # User management
/settings/marketplace           # Marketplace channels
/settings/pricelist             # Price lists
/settings/pos                   # POS settings (terminal assignments, shifts)
/settings/stock                 # Stock settings (unit precision, min levels)
/settings/payments              # Payment method configuration
/settings/general               # General settings (currencies, tax, locale)
/settings/notifications         # Notification settings
/admin                          # Super admin panel
/admin/companies                # Company management
/admin/users                    # Cross-company user view
```

---

## Desktop App

### Framework: Tauri 2

- Tauri wraps the web app in a native webview
- Same TanStack Start codebase runs inside the webview
- Tauri's Rust backend handles:
  - Serial port access (for scale integration -- pluggable protocol)
  - Thermal printer communication (ESC/POS direct printing)
  - Local file system access
  - Native window management (always-on-top for POS mode)
- Desktop-specific features exposed via Tauri IPC commands
- POS keyboard shortcuts (F-keys, numpad) handled natively

### Build

- Web app built to static output
- Tauri bundles it into a native app
- Single binary output per platform (macOS, Windows, Linux)

---

## Mobile App

### Framework: React Native + Expo

- Shares: `@heyloaf/api-client`, `@heyloaf/schemas`, `@heyloaf/types`, `@heyloaf/store`, `@heyloaf/i18n`
- Own UI layer: `@heyloaf/ui-native` (React Native components, not web shadcn)
- Expo for build/deploy tooling
- Camera access for barcode scanning and invoice photo capture

### Mobile-Specific Features

- **Production / Cooking Workflow** -- primary mobile screen, mobile-first design
  - Big buttons, minimal text, recipe checklist UX
  - Batch production sessions
- Barcode scanning via camera
- Invoice photo capture (for future OCR)
- In-app notifications
- Offline data viewing (read-only cache via TanStack Query persistence)

---

## Shared Packages

### `@heyloaf/api-client`

- Generated from backend's OpenAPI spec via `openapi-typescript`
- TanStack Query hooks per domain (products, stock, invoices, etc.)
- Typed fetch wrapper with JWT refresh logic
- Used by: web, desktop (via web), mobile

### `@heyloaf/schemas`

- Zod schemas for all input validation
- Shared between frontend (form validation) and can inform backend validation
- Product schema, invoice schema, contact schema, etc.

### `@heyloaf/types`

- Pure TypeScript types for domain entities
- No runtime code, just interfaces and type unions
- Product, Stock, Invoice, Contact, Order, etc.

### `@heyloaf/store`

- TanStack Store instances: auth store, UI store, company switcher state
- WebSocket manager (connect, reconnect, heartbeat, message handling)
- Used by: web, desktop (via web), mobile

### `@heyloaf/i18n`

- Translation strings for Turkish (TR) and English (EN)
- Language resolution: user preference -> company default -> English fallback
- Shared by: web, desktop (via web), mobile

### `@heyloaf/ui`

- Web component library (shadcn pattern)
- Base UI primitives + Tailwind styling
- Button, Input, Card, Modal, Toast, DataTable, etc.
- Used by: web, desktop (via web)

### `@heyloaf/ui-native`

- React Native component library
- Mirrors `@heyloaf/ui` API where possible for consistency
- Production screen components (big buttons, checklist)
- Used by: mobile only

### `@heyloaf/config`

- Shared Biome config
- Base tsconfig presets (base, react, react-native)

---

## Database

### PostgreSQL + SQLx

- PostgreSQL as single source of truth
- SQLx for database access (compile-time checked queries, no ORM magic)
- Migrations managed via SQLx CLI (`sqlx migrate run`)

### Schema Principles

- Every business table has `company_id` (multi-tenant)
- UUID primary keys (`gen_random_uuid()`)
- `created_at` / `updated_at` timestamps with auto-update triggers
- Product status as enum: `draft`, `inactive`, `active`
- Partial unique indexes scoped to active records per company
- Stock quantity maintained by DB trigger on `stock_movements` insert
- Invoice line items stored as JSONB (denormalized for performance)
- Recipe/BOM stored as JSONB on products table
- Quantity precision configurable per unit of measure

### Tables

| #   | Table                | Purpose                                                       |
| --- | -------------------- | ------------------------------------------------------------- |
| 1   | companies            | Root tenant entity                                            |
| 2   | users                | App users                                                     |
| 3   | user_companies       | Many-to-many user <-> company (role, perms)                   |
| 4   | product_categories   | Hierarchical categories (max 5 depth)                         |
| 5   | products             | Product catalog (status: draft/inactive/active, stock_status) |
| 6   | price_lists          | Price lists by channel                                        |
| 7   | price_list_items     | Product prices per list                                       |
| 8   | marketplace_channels | Sales channels                                                |
| 9   | contacts             | Supplier/customer ledger + credit limits                      |
| 10  | invoices             | Purchase & sales invoices (multi-currency)                    |
| 11  | stock                | Current inventory levels                                      |
| 12  | stock_movements      | Immutable stock audit log                                     |
| 13  | stock_counts         | Physical inventory count records                              |
| 14  | production_records   | Manufacturing runs / cooking sessions                         |
| 15  | production_sessions  | Batch production sessions                                     |
| 16  | orders               | POS sales orders                                              |
| 17  | order_items          | Order line items                                              |
| 18  | transactions         | Financial transactions (with payment method)                  |
| 19  | shifts               | POS shift records                                             |
| 20  | payment_methods      | Configurable payment methods per company                      |
| 21  | currencies           | Company currency configuration + rates                        |
| 22  | notifications        | In-app notifications                                          |
| 23  | audit_logs           | Universal audit trail (all entities)                          |
| 24  | pos_terminals        | POS terminal config (price list assignment)                   |

---

## Authentication

### Flow

```
Login (email + password)
  -> Backend validates credentials (Argon2 hash)
  -> Returns: JWT access token (short-lived, ~15min)
  -> Sets: httpOnly refresh cookie (long-lived, ~7 days)
  -> Token includes: user_id, active company_id

Company switch:
  -> Client calls /auth/switch-company
  -> Backend validates user belongs to target company
  -> Returns new access token with updated company_id

Every API request:
  -> Authorization: Bearer <access_token>
  -> x-app-language: en|tr
  -> Middleware extracts user + company_id + language
  -> Injects into request context

Token expired (401):
  -> Client auto-calls /auth/refresh
  -> Backend validates refresh cookie
  -> Returns new access token
  -> Retries original request
```

### Implementation

- Reuse Athena patterns: `TokenService`, auth middleware, auth cache
  (ref: `/Users/meer/Developer/ls/gaia/athena`)
- Passwords hashed with Argon2
- Refresh token rotation (old token invalidated on refresh)
- Redis for session/token cache (optional, can start without)

---

## API Contract

### OpenAPI (utoipa) -> TypeScript Codegen

```
Rust handlers (utoipa macros)
  -> OpenAPI spec at /api-docs/openapi.json
  -> openapi-typescript generates schema.ts
  -> Hand-written TanStack Query hooks on top
```

### API Structure

```
POST   /auth/login
POST   /auth/register
POST   /auth/refresh
POST   /auth/logout
POST   /auth/switch-company              # Company switcher

GET    /products
POST   /products
GET    /products/:id
PUT    /products/:id
DELETE /products/:id
POST   /products/bulk/activate
POST   /products/bulk/deactivate
POST   /products/bulk/category
GET    /products/:id/history

GET    /categories
POST   /categories
PUT    /categories/:id
DELETE /categories/:id

GET    /stock
GET    /stock/:productId
GET    /stock/low
POST   /stock/movements
GET    /stock/:productId/movements
POST   /stock/counts                     # Stock counting
GET    /stock/counts/:id

GET    /production
POST   /production
PUT    /production/:id
DELETE /production/:id
GET    /production/:id/history
GET    /production/summary
POST   /production/sessions              # Batch production
PUT    /production/sessions/:id
POST   /production/sessions/:id/complete

GET    /orders
POST   /orders
GET    /orders/:id
POST   /orders/:id/void
POST   /orders/:id/return

GET    /invoices
POST   /invoices
GET    /invoices/:id
PUT    /invoices/:id
DELETE /invoices/:id
GET    /invoices/summary

GET    /contacts
POST   /contacts
GET    /contacts/:id
PUT    /contacts/:id
DELETE /contacts/:id
GET    /contacts/summary
GET    /contacts/:id/transactions
GET    /contacts/:id/statement/export    # Excel export
POST   /contacts/:id/payments

GET    /price-lists
POST   /price-lists
PUT    /price-lists/:id
DELETE /price-lists/:id
POST   /price-lists/:id/default
GET    /price-lists/:id/items
POST   /price-lists/:id/items

GET    /marketplace-channels
POST   /marketplace-channels
PUT    /marketplace-channels/:id
DELETE /marketplace-channels/:id

GET    /users
POST   /users
PUT    /users/:id
DELETE /users/:id

GET    /company
PUT    /company
GET    /company/currencies
POST   /company/currencies
PUT    /company/currencies/:id
DELETE /company/currencies/:id

GET    /payment-methods
POST   /payment-methods
PUT    /payment-methods/:id
DELETE /payment-methods/:id
POST   /payment-methods/:id/default

GET    /shifts
POST   /shifts/open
POST   /shifts/:id/close
GET    /shifts/:id/z-report

GET    /pos/terminals
PUT    /pos/terminals/:id

GET    /notifications
PUT    /notifications/:id/read
POST   /notifications/read-all

GET    /reports/sales
GET    /reports/stock
GET    /reports/finance
GET    /reports/production

GET    /settings
PUT    /settings

# Super Admin (separate auth scope)
GET    /admin/companies
POST   /admin/companies
PUT    /admin/companies/:id
GET    /admin/users

GET    /audit-logs                       # Per-entity audit trail
GET    /audit-logs/:entityType/:entityId

WS     /ws
```

---

## File Storage

### Cloudflare R2

- S3-compatible API
- Used for: product images, company logos, invoice PDF uploads, Excel exports
- Public bucket for images (no signed URLs needed)
- Private bucket for invoices/exports (signed URLs for download)
- Rust: `aws-sdk-s3` crate (R2 is S3-compatible)
- Upload flow: client -> API -> R2 (or presigned upload URL for large files)

---

## Real-Time

### WebSocket (Axum)

Simple broadcast per company for real-time updates:

- Stock quantity changed (another terminal sold something)
- New order placed (kitchen/bar display)
- Price list updated
- Product activated/deactivated
- Notification created
- Production session completed

### Implementation

- Axum WebSocket handler at `/ws`
- `tokio::sync::broadcast` channel per company
- Client connects with JWT, server validates and subscribes to company channel
- Messages are typed JSON events: `{ type: "stock_updated", payload: { productId, quantity } }`
- Frontend `WebSocketManager` in `@heyloaf/store`
  (ref: Athena WebSocket patterns at `/Users/meer/Developer/ls/gaia/athena`)

---

## Multi-Tenancy

### Company Isolation

- Every business table has `company_id` column
- PostgreSQL RLS policies enforce isolation at DB level
- Backend middleware extracts `company_id` from authenticated user's active company
- All repository queries filter by `company_id`
- Double enforcement: application layer + database layer

### Multi-Company User Model

- `user_companies` junction table: user_id, company_id, role, permissions, is_active
- User can belong to multiple companies
- JWT contains active `company_id` -- switch via `/auth/switch-company`
- Company switcher UI component in header

### RLS Helper

```sql
CREATE FUNCTION get_user_company_id() RETURNS UUID AS $$
  SELECT current_setting('app.current_company_id')::UUID
$$ LANGUAGE SQL STABLE SECURITY DEFINER;
```

All table policies: `company_id = get_user_company_id()`

---

## Internationalization

### Frontend

- `@heyloaf/i18n` package with TR + EN translation files
- Language resolution order:
  1. `user.metadata.preferred_language` (per-user override)
  2. Company default language (set in company settings)
  3. Fallback: English
- All UI strings go through i18n -- no hardcoded text

### Backend

- `x-app-language` request header on every API call
- i18n middleware extracts language, sets context
- Error messages returned in the requested language
- `common/i18n.rs` with error message translations

---

## Audit Trail

### Design

- **Universal**: all entities (products, invoices, contacts, orders, stock, production, settings) are audited
- **Non-blocking**: audit writes use `tokio::spawn` -- fire-and-forget, does not block the response
- **Field-level**: records field name, old value, new value, who, when, change type
- Reference: follows Athena audit patterns (`/Users/meer/Developer/ls/gaia/athena`)

### Table: `audit_logs`

```sql
CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  entity_type TEXT NOT NULL,       -- 'product', 'invoice', 'contact', etc.
  entity_id UUID NOT NULL,
  action TEXT NOT NULL,            -- 'create', 'update', 'delete'
  changes JSONB,                   -- [{ field, old, new }]
  user_id UUID NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

---

## Deployment

### Architecture

```
Cloudflare
  ├── Pages              -> TanStack Start (SSR + static assets)
  └── R2                 -> File storage (images, PDFs)

Hetzner VM (Dokploy)
  ├── Axum API           -> Docker container (Rust binary)
  ├── PostgreSQL         -> Docker container (or managed)
  └── Redis              -> Docker container (optional, for caching)
```

### CI/CD (GitHub Actions)

```
On PR:
  ├── Rust: cargo check + clippy + fmt + test
  └── Frontend: biome lint + typecheck + build + test

On merge to main:
  ├── Build Rust binary (multi-stage Docker, cargo-chef cache)
  ├── Build web app (pnpm, Turborepo)
  ├── Deploy API container to Hetzner via Dokploy
  └── Deploy web to Cloudflare Pages
```

### Docker Compose (Development)

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_DB: heyloaf
      POSTGRES_USER: heyloaf
      POSTGRES_PASSWORD: devpassword
    ports:
      - "5432:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
```

---

## Future: Sync Engine

When offline POS capability is needed:

### Option A: ElectricSQL + TanStack DB

- Best fit for web + Tauri (TanStack ecosystem alignment)
- Postgres -> Electric -> TanStack DB collections on client
- HTTP-based protocol works in webview

### Option B: PowerSync

- Best fit for React Native (dedicated SDK)
- Postgres -> PowerSync -> SQLite on client
- Broader platform support with first-party SDKs

### Option C: Hybrid

- Electric for web + Tauri
- PowerSync for React Native
- Same Postgres source of truth, different sync paths

### Adoption Path

1. Start online-only (current plan)
2. Add Electric/PowerSync when offline is a real requirement
3. No architecture changes needed -- sync layer sits between existing API and client
