# Heyloaf Backend (Rust)

## Crate Map

| Crate     | Purpose                              |
|-----------|--------------------------------------|
| api       | Axum HTTP server, handlers, middleware, routes |
| dal       | SQLx repos, models, migrations      |
| common    | Shared types, errors, config, i18n, telemetry |
| services  | Business logic (audit, stock cascades, etc.) |
| cli       | Admin CLI (create-company, create-user, create-migration, seed) |

## Code Style

- **Clippy pedantic** enabled at workspace level with explicit allows/denies
- **No unwrap/expect/panic** — `deny` in workspace lints
- **No `#[allow(...)]`** — `allow_attributes` is denied
- **rustfmt** with `max_width = 100`
- **tracing** for all logging (no println in library code, CLI has `#![allow(clippy::print_stdout)]`)

## Patterns

### Handlers
```rust
pub async fn get_thing(
    State(state): State<AppState>,
    Extension(company): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Thing>>, AppError> {
    let thing = ThingRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Thing not found".into()))?;
    Ok(Json(ApiResponse { data: thing }))
}
```

### Repositories
- One struct per table, all methods are `async fn(&PgPool, ...) -> Result<T, sqlx::Error>`
- Use `sqlx::query_as::<_, Model>(SQL)` with bind params
- PG enums cast in SQL: `$1::product_type`
- No cross-table joins in repos — compose in services

### Error Handling
- `AppError` enum in common crate → `IntoResponse` for Axum
- `AppResult<T> = Result<T, AppError>`
- SQLx errors → `AppError::Database(e.to_string())`
- Not found → `AppError::NotFound("message".into())`
- Validation → `AppError::Validation { field, message }`

### Migrations
- SQL files in `dal/src/migrations/`
- Named: `NNNNN_description.sql` (5-digit, sequential)
- Run via `sqlx::migrate!()` at startup
- Create new: `just create-migration name="add_thing"`

### Audit Trail
```rust
AuditBuilder::new(state.audit.clone(), company.company_id, auth.user_id)
    .entity("product", product.id)
    .action("create")
    .after(&product)
    .emit(); // fire-and-forget
```

## PostgreSQL Notes
- Custom enums: `product_type`, `product_status`, `stock_status`, `user_role`
- Repos use string types for enum fields, cast in SQL queries
- NUMERIC fields → `f64` in Rust models
- `updated_at` auto-set by trigger
- RLS enabled but enforcement is at application layer for now (SET LOCAL requires transactions)

## SQLx
- **Compile-time checking disabled** for now (no `.sqlx` cache committed)
- Queries use runtime `query_as::<_, T>(sql)` pattern
- Migration runner embedded via `sqlx::migrate!()`
