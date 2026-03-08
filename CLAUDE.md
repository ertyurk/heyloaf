# Heyloaf

Multi-platform POS and business management system for food production, retail, and wholesale.

## Monorepo Structure

```
heyloaf/
├── apps/web/              # TanStack Start (SSR + SPA)
├── core/                  # Rust workspace (Axum backend)
│   └── crates/
│       ├── api/           # HTTP server (handlers, middleware, routes)
│       ├── dal/           # Data access (SQLx, repos, migrations)
│       ├── common/        # Shared types, errors, config, i18n
│       ├── services/      # Business logic (audit, stock, production)
│       └── cli/           # Admin CLI (company/user provisioning, migrations)
├── packages/
│   └── ui/                # Shared UI components (shadcn + Base UI + Tailwind 4)
├── infrastructure/        # Docker Compose, Dockerfiles
└── docs/                  # Architecture, features, plans
```

## Quick Commands

```bash
just setup          # First-time: docker up, migrate, install deps, seed
just dev-all        # Run API + web in parallel
just dev-api        # Run API server only
just dev-web        # Run web app only
just lint           # Lint everything (Rust + TypeScript)
just fmt            # Format everything
just check          # Cargo check
just test           # Run Rust tests
just db-up          # Start PostgreSQL
just db-migrate     # Run migrations
just db-reset       # Destroy + recreate DB
just seed           # Seed dev data
just create-migration name="add_stock_table"
```

## Stack

| Layer      | Tech                                    |
|------------|-----------------------------------------|
| Backend    | Rust / Axum 0.8 / SQLx / PostgreSQL 17  |
| Web        | TanStack Start + React 19               |
| UI         | shadcn (Base UI) + Tailwind CSS 4       |
| API Spec   | OpenAPI (utoipa) → TS codegen           |
| Auth       | JWT access + httpOnly refresh cookie    |
| Linting    | Biome (TS) / Clippy pedantic (Rust)     |
| Task Runner| just                                    |

## Key Conventions

### Rust Backend
- **Handlers are thin.** Validate input → call service/repo → return response.
- **Repos are 1:1 with tables.** No cross-table queries in repos — do that in services.
- **No unwrap/expect/panic.** Clippy denies these at workspace level.
- **Fire-and-forget audit.** AuditService uses `tokio::spawn` — never blocks responses.
- **AppError → JSON.** All errors map to structured `{ error: { code, message, trace_id } }`.
- **Company isolation.** All business tables have `company_id`. Repos filter by it.

### Frontend
- **shadcn components** go in `packages/ui/` — shared across all apps.
- **App-specific components** go in `apps/web/src/components/`.
- **Biome** for linting/formatting (not ESLint/Prettier).
- **TanStack Form + Zod** for all forms.
- **Base UI primitives** (not Radix) — attribute selectors use `data-*`.

### Cross-Boundary Changes
When adding a new API endpoint:
1. Add handler + types in `core/crates/api/`
2. Add utoipa annotations for OpenAPI
3. Run `just gen-api` to regenerate TypeScript client
4. Use generated hooks in frontend

## Dev Credentials (after seed)
- Email: `admin@heyloaf.com`
- Password: `admin123`

## Environment
- `.env.example` → copy to `.env` for local dev
- PostgreSQL runs via Docker Compose at `localhost:5432`
- API server at `localhost:8081`
- Web app at `localhost:3000`
