use axum::{Router, middleware as axum_middleware, routing};
use utoipa::OpenApi;
use utoipa_swagger_ui::SwaggerUi;

use crate::handlers;
use crate::middleware;
use crate::openapi::ApiDoc;
use crate::state::AppState;

/// Routes accessible to all authenticated users (no role restriction).
fn open_routes() -> Router<AppState> {
    Router::new()
        // Auth
        .route("/auth/logout", routing::post(handlers::auth::logout))
        .route(
            "/auth/switch-company",
            routing::post(handlers::auth::switch_company),
        )
        // Company (read)
        .route("/company", routing::get(handlers::company::get_company))
        // Categories (read)
        .route(
            "/categories",
            routing::get(handlers::categories::list_categories),
        )
        .route(
            "/categories/{id}",
            routing::get(handlers::categories::get_category),
        )
        // Products (read)
        .route("/products", routing::get(handlers::products::list_products))
        .route(
            "/products/{id}",
            routing::get(handlers::products::get_product),
        )
        // Recipes (read)
        .route(
            "/products/{id}/recipe",
            routing::get(handlers::recipes::get_recipe),
        )
        .route(
            "/products/{id}/recipe/cost",
            routing::get(handlers::recipes::get_recipe_cost),
        )
        // Stock (read)
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
        )
        // Price lists (read)
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
        // Marketplace channels (read)
        .route(
            "/marketplace-channels",
            routing::get(handlers::marketplace_channels::list_marketplace_channels),
        )
        .route(
            "/marketplace-channels/{id}",
            routing::get(handlers::marketplace_channels::get_marketplace_channel),
        )
        // Currencies (read)
        .route(
            "/currencies",
            routing::get(handlers::currencies::list_currencies),
        )
        .route(
            "/currencies/{id}",
            routing::get(handlers::currencies::get_currency),
        )
        // Contacts (read)
        .route("/contacts", routing::get(handlers::contacts::list_contacts))
        .route(
            "/contacts/{id}",
            routing::get(handlers::contacts::get_contact),
        )
        .route(
            "/contacts/{id}/transactions",
            routing::get(handlers::contacts::list_contact_transactions),
        )
        // Transactions (read)
        .route(
            "/transactions",
            routing::get(handlers::transactions::list_transactions),
        )
        // Invoices (read)
        .route("/invoices", routing::get(handlers::invoices::list_invoices))
        .route(
            "/invoices/{id}",
            routing::get(handlers::invoices::get_invoice),
        )
        // Orders (all — cashiers need create for POS)
        .route("/orders", routing::get(handlers::orders::list_orders))
        .route("/orders", routing::post(handlers::orders::create_order))
        .route("/orders/{id}", routing::get(handlers::orders::get_order))
        .route(
            "/orders/{id}/void",
            routing::post(handlers::orders::void_order),
        )
        .route(
            "/orders/{id}/return",
            routing::post(handlers::orders::return_order),
        )
        // Shifts (all)
        .route("/shifts", routing::get(handlers::shifts::list_shifts))
        .route(
            "/shifts/current",
            routing::get(handlers::shifts::get_current_shift),
        )
        .route("/shifts/open", routing::post(handlers::shifts::open_shift))
        .route(
            "/shifts/{id}/close",
            routing::post(handlers::shifts::close_shift),
        )
        // Payment methods (read)
        .route(
            "/payment-methods",
            routing::get(handlers::payment_methods::list_payment_methods),
        )
        // POS terminals (read)
        .route(
            "/pos-terminals",
            routing::get(handlers::pos_terminals::list_pos_terminals),
        )
        // Production (read)
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
        )
        // Notifications (all)
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

/// Routes restricted to manager or above (admin, manager).
fn manager_routes() -> Router<AppState> {
    Router::new()
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
        // Stock (write)
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
        // Contacts (write)
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
        // Invoices (write)
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
        )
        // Production (write)
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
        )
        .layer(axum_middleware::from_fn(middleware::rbac::manager_or_above))
}

/// Routes restricted to admin only.
fn admin_routes() -> Router<AppState> {
    Router::new()
        // Company (write)
        .route("/company", routing::put(handlers::company::update_company))
        // Users (all operations)
        .route("/users", routing::get(handlers::users::list_users))
        .route("/users", routing::post(handlers::users::create_user))
        .route("/users/{id}", routing::get(handlers::users::get_user))
        .route(
            "/users/{id}/role",
            routing::put(handlers::users::update_user_role),
        )
        .route("/users/{id}", routing::delete(handlers::users::remove_user))
        // Currencies (write)
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
        )
        // Payment methods (write)
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
        // POS terminals (write)
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
        )
        // Audit logs (read)
        .route(
            "/audit-logs",
            routing::get(handlers::audit::list_audit_logs),
        )
        // Dashboard
        .route(
            "/dashboard",
            routing::get(handlers::dashboard::get_dashboard),
        )
        .layer(axum_middleware::from_fn(middleware::rbac::admin_only))
}

pub fn create_routes(state: AppState) -> Router {
    let public_routes = Router::new()
        .route("/health", routing::get(handlers::health::health_check))
        .route("/auth/login", routing::post(handlers::auth::login))
        .route("/auth/register", routing::post(handlers::auth::register))
        .route("/auth/refresh", routing::post(handlers::auth::refresh));

    let protected_routes = Router::new()
        .merge(open_routes())
        .merge(manager_routes())
        .merge(admin_routes())
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

    Router::new()
        .merge(public_routes)
        .nest("/api", protected_routes)
        .merge(SwaggerUi::new("/swagger-ui").url("/api-docs/openapi.json", ApiDoc::openapi()))
        .with_state(state)
}
