use axum::extract::DefaultBodyLimit;
use axum::{Router, middleware as axum_middleware, routing};
use heyloaf_common::types::{Module, PermissionLevel};
use tower_http::services::ServeDir;
use tower_http::set_header::SetResponseHeaderLayer;
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::handlers;
use crate::middleware;
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
fn common_routes() -> Router<AppState> {
    Router::new()
        // Auth
        .route("/auth/logout", routing::post(handlers::auth::logout))
        .route(
            "/auth/switch-company",
            routing::post(handlers::auth::switch_company),
        )
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
                "/products/{id}",
                routing::put(handlers::products::update_product),
            )
            .route(
                "/products/{id}",
                routing::delete(handlers::products::delete_product),
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
// Top-level router
// ---------------------------------------------------------------------------
pub fn create_routes(state: AppState) -> Router {
    let public_routes = Router::new()
        .route("/health", routing::get(handlers::health::health_check))
        .route("/auth/login", routing::post(handlers::auth::login))
        .route("/auth/register", routing::post(handlers::auth::register))
        .route("/auth/refresh", routing::post(handlers::auth::refresh));

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
            middleware::auth::auth_middleware,
        ));

    Router::new()
        .merge(public_routes)
        .nest("/api", protected_routes)
        .merge(uploads_service)
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .with_state(state)
}
