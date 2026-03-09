use axum::extract::DefaultBodyLimit;
use axum::{Router, middleware as axum_middleware, routing};
use heyloaf_common::types::{Module, PermissionLevel};
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::handlers;
use crate::middleware;
use crate::middleware::rate_limit::RateLimitConfig;
use crate::middleware::rbac::require_module_permission;
use crate::openapi::ApiDoc;
use crate::state::AppState;

/// Helper: wrap a router with a module permission layer.
fn with_perm(router: Router<AppState>, module: Module, level: PermissionLevel) -> Router<AppState> {
    router.layer(axum_middleware::from_fn(require_module_permission(
        module, level,
    )))
}

// ---------------------------------------------------------------------------
// Routes that require no module permission (auth, notifications, etc.)
// ---------------------------------------------------------------------------
/// Routes that only need auth (no company_guard).
fn auth_only_routes() -> Router<AppState> {
    Router::new()
        .route("/auth/logout", routing::post(handlers::auth::logout))
        .route(
            "/auth/switch-company",
            routing::post(handlers::auth::switch_company),
        )
}

fn common_routes() -> Router<AppState> {
    Router::new()
        // Company (read)
        .route("/company", routing::get(handlers::company::get_company))
        // Notifications
        .route(
            "/notifications",
            routing::get(handlers::notifications::list_notifications),
        )
        .route(
            "/notifications/unread-count",
            routing::get(handlers::notifications::unread_count),
        )
        .route(
            "/notifications/read-all",
            routing::post(handlers::notifications::mark_all_read),
        )
        .route(
            "/notifications/{id}/read",
            routing::post(handlers::notifications::mark_read),
        )
}

// ---------------------------------------------------------------------------
// Products module (includes categories, recipes, price-lists, channels)
// ---------------------------------------------------------------------------
fn products_read_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route(
                "/categories",
                routing::get(handlers::categories::list_categories),
            )
            .route(
                "/categories/{id}",
                routing::get(handlers::categories::get_category),
            )
            .route("/products", routing::get(handlers::products::list_products))
            .route(
                "/products/{id}",
                routing::get(handlers::products::get_product),
            )
            .route(
                "/products/{id}/recipe",
                routing::get(handlers::recipes::get_recipe),
            )
            .route(
                "/products/{id}/recipe/cost",
                routing::get(handlers::recipes::get_recipe_cost),
            )
            .route(
                "/price-lists",
                routing::get(handlers::price_lists::list_price_lists),
            )
            .route(
                "/price-lists/{id}",
                routing::get(handlers::price_lists::get_price_list),
            )
            .route(
                "/price-lists/{id}/items",
                routing::get(handlers::price_lists::list_price_list_items),
            )
            .route(
                "/marketplace-channels",
                routing::get(handlers::marketplace_channels::list_marketplace_channels),
            )
            .route(
                "/marketplace-channels/{id}",
                routing::get(handlers::marketplace_channels::get_marketplace_channel),
            ),
        Module::Products,
        PermissionLevel::Viewer,
    )
}

fn products_write_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            // Uploads (5MB body limit)
            .route("/uploads", routing::post(handlers::uploads::upload_file))
            .layer(DefaultBodyLimit::max(5 * 1024 * 1024))
            // Categories (write)
            .route(
                "/categories",
                routing::post(handlers::categories::create_category),
            )
            .route(
                "/categories/{id}",
                routing::put(handlers::categories::update_category),
            )
            .route(
                "/categories/{id}",
                routing::delete(handlers::categories::delete_category),
            )
            // Products (write)
            .route(
                "/products",
                routing::post(handlers::products::create_product),
            )
            .route(
                "/products/bulk/activate",
                routing::post(handlers::products::bulk_activate),
            )
            .route(
                "/products/bulk/deactivate",
                routing::post(handlers::products::bulk_deactivate),
            )
            .route(
                "/products/bulk/category",
                routing::post(handlers::products::bulk_category),
            )
            .route(
                "/products/bulk/price-list",
                routing::post(handlers::products::bulk_price_list),
            )
            .route(
                "/products/{id}",
                routing::put(handlers::products::update_product),
            )
            .route(
                "/products/{id}",
                routing::delete(handlers::products::delete_product),
            )
            .route(
                "/products/{id}/purchase-options",
                routing::put(handlers::products::update_purchase_options),
            )
            // Recipes (write)
            .route(
                "/products/{id}/recipe",
                routing::put(handlers::recipes::update_recipe),
            )
            // Marketplace channels (write)
            .route(
                "/marketplace-channels",
                routing::post(handlers::marketplace_channels::create_marketplace_channel),
            )
            .route(
                "/marketplace-channels/{id}",
                routing::put(handlers::marketplace_channels::update_marketplace_channel),
            )
            .route(
                "/marketplace-channels/{id}",
                routing::delete(handlers::marketplace_channels::delete_marketplace_channel),
            )
            // Price lists (write)
            .route(
                "/price-lists",
                routing::post(handlers::price_lists::create_price_list),
            )
            .route(
                "/price-lists/items/{item_id}",
                routing::delete(handlers::price_lists::delete_price_list_item),
            )
            .route(
                "/price-lists/{id}",
                routing::put(handlers::price_lists::update_price_list),
            )
            .route(
                "/price-lists/{id}",
                routing::delete(handlers::price_lists::delete_price_list),
            )
            .route(
                "/price-lists/{id}/default",
                routing::post(handlers::price_lists::set_default_price_list),
            )
            .route(
                "/price-lists/{id}/items",
                routing::post(handlers::price_lists::upsert_price_list_items),
            ),
        Module::Products,
        PermissionLevel::Editor,
    )
}

// ---------------------------------------------------------------------------
// Stock module
// ---------------------------------------------------------------------------
fn stock_read_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route("/stock", routing::get(handlers::stock::list_stock))
            .route("/stock/low", routing::get(handlers::stock::list_low_stock))
            .route(
                "/stock/movements",
                routing::get(handlers::stock::list_movements),
            )
            .route(
                "/stock/counts",
                routing::get(handlers::stock::list_stock_counts),
            )
            .route(
                "/stock/{product_id}",
                routing::get(handlers::stock::get_stock),
            ),
        Module::Stock,
        PermissionLevel::Viewer,
    )
}

fn stock_write_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route(
                "/stock/movements",
                routing::post(handlers::stock::create_movement),
            )
            .route(
                "/stock/counts",
                routing::post(handlers::stock::create_stock_count),
            )
            .route(
                "/stock/counts/{id}/complete",
                routing::post(handlers::stock::complete_stock_count),
            )
            .route(
                "/stock/{product_id}/levels",
                routing::put(handlers::stock::update_stock_levels),
            ),
        Module::Stock,
        PermissionLevel::Editor,
    )
}

// ---------------------------------------------------------------------------
// Production module
// ---------------------------------------------------------------------------
fn production_read_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route(
                "/production/records",
                routing::get(handlers::production::list_production_records),
            )
            .route(
                "/production/records/{id}",
                routing::get(handlers::production::get_production_record),
            )
            .route(
                "/production/sessions",
                routing::get(handlers::production::list_production_sessions),
            ),
        Module::Production,
        PermissionLevel::Viewer,
    )
}

fn production_write_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route(
                "/production/records",
                routing::post(handlers::production::create_production_record),
            )
            .route(
                "/production/records/{id}",
                routing::put(handlers::production::update_production_record),
            )
            .route(
                "/production/records/{id}",
                routing::delete(handlers::production::delete_production_record),
            )
            .route(
                "/production/sessions",
                routing::post(handlers::production::create_production_session),
            )
            .route(
                "/production/sessions/{id}/items",
                routing::post(handlers::production::add_session_item),
            )
            .route(
                "/production/sessions/{id}/complete",
                routing::post(handlers::production::complete_production_session),
            )
            .route(
                "/production/sessions/{id}",
                routing::delete(handlers::production::delete_production_session),
            ),
        Module::Production,
        PermissionLevel::Editor,
    )
}

// ---------------------------------------------------------------------------
// POS module (orders, shifts, POS terminals, payment methods)
// ---------------------------------------------------------------------------
fn pos_read_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route("/orders", routing::get(handlers::orders::list_orders))
            .route("/orders/{id}", routing::get(handlers::orders::get_order))
            .route("/shifts", routing::get(handlers::shifts::list_shifts))
            .route(
                "/shifts/current",
                routing::get(handlers::shifts::get_current_shift),
            )
            .route(
                "/shifts/{id}/z-report",
                routing::get(handlers::shifts::get_z_report),
            )
            .route(
                "/payment-methods",
                routing::get(handlers::payment_methods::list_payment_methods),
            )
            .route(
                "/pos-terminals",
                routing::get(handlers::pos_terminals::list_pos_terminals),
            ),
        Module::Pos,
        PermissionLevel::Viewer,
    )
}

fn pos_write_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route("/orders", routing::post(handlers::orders::create_order))
            .route(
                "/orders/{id}/void",
                routing::post(handlers::orders::void_order),
            )
            .route(
                "/orders/{id}/return",
                routing::post(handlers::orders::return_order),
            )
            .route("/shifts/open", routing::post(handlers::shifts::open_shift))
            .route(
                "/shifts/{id}/close",
                routing::post(handlers::shifts::close_shift),
            ),
        Module::Pos,
        PermissionLevel::Editor,
    )
}

fn pos_admin_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route(
                "/payment-methods",
                routing::post(handlers::payment_methods::create_payment_method),
            )
            .route(
                "/payment-methods/{id}",
                routing::put(handlers::payment_methods::update_payment_method),
            )
            .route(
                "/payment-methods/{id}/default",
                routing::post(handlers::payment_methods::set_default_payment_method),
            )
            .route(
                "/payment-methods/{id}",
                routing::delete(handlers::payment_methods::delete_payment_method),
            )
            .route(
                "/pos-terminals",
                routing::post(handlers::pos_terminals::create_pos_terminal),
            )
            .route(
                "/pos-terminals/{id}",
                routing::put(handlers::pos_terminals::update_pos_terminal),
            )
            .route(
                "/pos-terminals/{id}",
                routing::delete(handlers::pos_terminals::delete_pos_terminal),
            ),
        Module::Pos,
        PermissionLevel::Admin,
    )
}

// ---------------------------------------------------------------------------
// Sales module (contacts, invoices, transactions)
// ---------------------------------------------------------------------------
fn sales_read_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route("/contacts", routing::get(handlers::contacts::list_contacts))
            .route(
                "/contacts/{id}",
                routing::get(handlers::contacts::get_contact),
            )
            .route(
                "/contacts/{id}/transactions",
                routing::get(handlers::contacts::list_contact_transactions),
            )
            .route(
                "/transactions",
                routing::get(handlers::transactions::list_transactions),
            )
            .route("/invoices", routing::get(handlers::invoices::list_invoices))
            .route(
                "/invoices/{id}",
                routing::get(handlers::invoices::get_invoice),
            ),
        Module::Sales,
        PermissionLevel::Viewer,
    )
}

fn sales_write_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route(
                "/contacts",
                routing::post(handlers::contacts::create_contact),
            )
            .route(
                "/contacts/{id}",
                routing::put(handlers::contacts::update_contact),
            )
            .route(
                "/contacts/{id}",
                routing::delete(handlers::contacts::delete_contact),
            )
            .route(
                "/contacts/{id}/payment",
                routing::post(handlers::contacts::record_payment),
            )
            .route(
                "/invoices",
                routing::post(handlers::invoices::create_invoice),
            )
            .route(
                "/invoices/{id}",
                routing::put(handlers::invoices::update_invoice),
            )
            .route(
                "/invoices/{id}",
                routing::delete(handlers::invoices::delete_invoice),
            )
            .route(
                "/invoices/{id}/status",
                routing::put(handlers::invoices::update_invoice_status),
            ),
        Module::Sales,
        PermissionLevel::Editor,
    )
}

// ---------------------------------------------------------------------------
// Finance module (currencies)
// ---------------------------------------------------------------------------
fn finance_read_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route(
                "/currencies",
                routing::get(handlers::currencies::list_currencies),
            )
            .route(
                "/currencies/{id}",
                routing::get(handlers::currencies::get_currency),
            ),
        Module::Finance,
        PermissionLevel::Viewer,
    )
}

fn finance_write_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route(
                "/currencies",
                routing::post(handlers::currencies::create_currency),
            )
            .route(
                "/currencies/{id}",
                routing::put(handlers::currencies::update_currency),
            )
            .route(
                "/currencies/{id}",
                routing::delete(handlers::currencies::delete_currency),
            ),
        Module::Finance,
        PermissionLevel::Admin,
    )
}

// ---------------------------------------------------------------------------
// Reports module
// ---------------------------------------------------------------------------
fn reports_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route(
                "/dashboard",
                routing::get(handlers::dashboard::get_dashboard),
            )
            .route(
                "/reports/hourly-sales",
                routing::get(handlers::reports::hourly_sales),
            )
            .route(
                "/reports/stock-turnover",
                routing::get(handlers::reports::stock_turnover),
            )
            .route(
                "/reports/profit-margins",
                routing::get(handlers::reports::profit_margins),
            ),
        Module::Reports,
        PermissionLevel::Viewer,
    )
}

// ---------------------------------------------------------------------------
// Settings module (company, users, audit)
// ---------------------------------------------------------------------------
fn settings_routes() -> Router<AppState> {
    with_perm(
        Router::new()
            .route("/company", routing::put(handlers::company::update_company))
            .route("/users", routing::get(handlers::users::list_users))
            .route("/users", routing::post(handlers::users::create_user))
            .route("/users/{id}", routing::get(handlers::users::get_user))
            .route(
                "/users/{id}/role",
                routing::put(handlers::users::update_user_role),
            )
            .route(
                "/users/{id}/permissions",
                routing::put(handlers::users::update_user_permissions),
            )
            .route(
                "/users/{id}/preferences",
                routing::put(handlers::users::update_preferences),
            )
            .route("/users/{id}", routing::delete(handlers::users::remove_user))
            .route(
                "/audit-logs",
                routing::get(handlers::audit::list_audit_logs),
            ),
        Module::Settings,
        PermissionLevel::Admin,
    )
}

// ---------------------------------------------------------------------------
// Super Admin routes (no company_guard, require is_super_admin)
// ---------------------------------------------------------------------------
fn super_admin_routes() -> Router<AppState> {
    Router::new()
        .route(
            "/super-admin/companies",
            routing::get(handlers::super_admin::list_companies),
        )
        .route(
            "/super-admin/companies",
            routing::post(handlers::super_admin::create_company),
        )
        .route(
            "/super-admin/companies/{id}/deactivate",
            routing::put(handlers::super_admin::deactivate_company),
        )
        .route(
            "/super-admin/users",
            routing::get(handlers::super_admin::list_all_users),
        )
}

// ---------------------------------------------------------------------------
// Global security headers: apply all 5 layers to a router
// ---------------------------------------------------------------------------
fn apply_security_headers(router: Router) -> Router {
    router
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::HeaderName::from_static("x-content-type-options"),
            axum::http::header::HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::HeaderName::from_static("x-frame-options"),
            axum::http::header::HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::HeaderName::from_static("x-xss-protection"),
            axum::http::header::HeaderValue::from_static("0"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::HeaderName::from_static("referrer-policy"),
            axum::http::header::HeaderValue::from_static(
                "strict-origin-when-cross-origin",
            ),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::HeaderName::from_static("permissions-policy"),
            axum::http::header::HeaderValue::from_static(
                "camera=(), microphone=(), geolocation=()",
            ),
        ))
}

// ---------------------------------------------------------------------------
// Upload serve route with company_id check
// ---------------------------------------------------------------------------
async fn upload_company_guard(
    axum::extract::State(state): axum::extract::State<AppState>,
    request: axum::http::Request<axum::body::Body>,
    next: axum::middleware::Next,
) -> Result<axum::response::Response, heyloaf_common::errors::AppError> {
    use heyloaf_common::errors::AppError;

    // Extract the authenticated user's company_id from extensions
    let auth_user = request
        .extensions()
        .get::<middleware::auth::AuthUser>()
        .ok_or_else(|| AppError::Unauthorized("Authentication required".into()))?
        .clone();

    let user_company_id = auth_user
        .company_id
        .ok_or_else(|| AppError::Forbidden("No active company selected".into()))?;

    // The path will be like /uploads/{company_id}/filename.ext
    let path = request.uri().path().to_string();
    let segments: Vec<&str> = path.split('/').filter(|s| !s.is_empty()).collect();

    // segments: ["uploads", "<company_id>", "<filename>"]
    // Require at least the company_id segment and validate it matches the user's company
    if segments.len() < 2 {
        return Err(AppError::Forbidden("Invalid upload path".into()));
    }

    let path_company_id = segments[1]
        .parse::<uuid::Uuid>()
        .map_err(|_| AppError::Forbidden("Invalid upload path".into()))?;

    if path_company_id != user_company_id {
        return Err(AppError::Forbidden(
            "You do not have access to this company's uploads".into(),
        ));
    }

    let _ = state;
    Ok(next.run(request).await)
}

// ---------------------------------------------------------------------------
// Top-level router
// ---------------------------------------------------------------------------
pub fn create_routes(state: AppState) -> Router {
    let is_production = state.config.app_env.eq_ignore_ascii_case("production");

    // Rate limit configs
    let login_rl = RateLimitConfig::new(5, 60);
    let register_rl = RateLimitConfig::new(3, 300);
    let refresh_rl = RateLimitConfig::new(10, 60);

    let login_rl_clone = login_rl.clone();
    let register_rl_clone = register_rl.clone();
    let refresh_rl_clone = refresh_rl.clone();

    let public_routes = Router::new()
        .route("/health", routing::get(handlers::health::health_check))
        .route(
            "/auth/login",
            routing::post(handlers::auth::login).layer(axum_middleware::from_fn(
                move |req, next| {
                    let cfg = login_rl_clone.clone();
                    middleware::rate_limit::rate_limit_middleware(cfg, req, next)
                },
            )),
        )
        .route(
            "/auth/register",
            routing::post(handlers::auth::register).layer(axum_middleware::from_fn(
                move |req, next| {
                    let cfg = register_rl_clone.clone();
                    middleware::rate_limit::rate_limit_middleware(cfg, req, next)
                },
            )),
        )
        .route(
            "/auth/refresh",
            routing::post(handlers::auth::refresh).layer(axum_middleware::from_fn(
                move |req, next| {
                    let cfg = refresh_rl_clone.clone();
                    middleware::rate_limit::rate_limit_middleware(cfg, req, next)
                },
            )),
        );

    let protected_routes = Router::new()
        // Common (no module perm needed)
        .merge(common_routes())
        // Products module
        .merge(products_read_routes())
        .merge(products_write_routes())
        // Stock module
        .merge(stock_read_routes())
        .merge(stock_write_routes())
        // Production module
        .merge(production_read_routes())
        .merge(production_write_routes())
        // POS module
        .merge(pos_read_routes())
        .merge(pos_write_routes())
        .merge(pos_admin_routes())
        // Sales module
        .merge(sales_read_routes())
        .merge(sales_write_routes())
        // Finance module
        .merge(finance_read_routes())
        .merge(finance_write_routes())
        // Reports module
        .merge(reports_routes())
        // Settings module
        .merge(settings_routes())
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::company_guard::company_guard_middleware,
        ))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::auth_middleware,
        ))
        .layer(axum_middleware::from_fn(
            middleware::language::language_middleware,
        ));

    // Auth-only routes: auth middleware, but NO company_guard (so users
    // without an active company can still logout / switch company).
    let auth_only = auth_only_routes()
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::auth_middleware,
        ))
        .layer(axum_middleware::from_fn(
            middleware::language::language_middleware,
        ));

    // Super-admin routes: auth + super_admin guard, but NO company_guard.
    let super_admin = super_admin_routes()
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::super_admin::super_admin_middleware,
        ))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::auth_middleware,
        ))
        .layer(axum_middleware::from_fn(
            middleware::language::language_middleware,
        ));

    let uploads_service = Router::new()
        .nest_service("/uploads", ServeDir::new("./uploads"))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::HeaderName::from_static("x-content-type-options"),
            axum::http::header::HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            axum::http::header::CONTENT_DISPOSITION,
            axum::http::header::HeaderValue::from_static("inline"),
        ))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            upload_company_guard,
        ))
        .layer(axum_middleware::from_fn_with_state(
            state.clone(),
            middleware::auth::auth_middleware,
        ));

    let mut app = Router::new()
        .merge(public_routes)
        .nest("/api", protected_routes)
        .nest("/api", auth_only)
        .nest("/api", super_admin)
        .merge(uploads_service);

    // Swagger UI: only mount when NOT in production
    if !is_production {
        app = app.merge(
            SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()),
        );
    }

    apply_security_headers(app.with_state(state))
}
