use utoipa::OpenApi;

use crate::handlers::{
    audit, auth, categories, company, contacts, currencies, dashboard, invoices,
    marketplace_channels, notifications, orders, payment_methods, pos_terminals, price_lists,
    production, products, recipes, shifts, stock, users,
};

#[derive(OpenApi)]
#[openapi(
    info(
        title = "Heyloaf API",
        version = "0.1.0",
        description = "Multi-platform POS and business management API"
    ),
    paths(
        // Auth
        auth::login,
        auth::register,
        auth::refresh,
        auth::logout,
        auth::switch_company,
        // Company
        company::get_company,
        company::update_company,
        // Categories
        categories::list_categories,
        categories::get_category,
        categories::create_category,
        categories::update_category,
        categories::delete_category,
        // Products
        products::list_products,
        products::get_product,
        products::create_product,
        products::update_product,
        products::delete_product,
        products::bulk_activate,
        products::bulk_deactivate,
        products::bulk_category,
        // Recipes
        recipes::get_recipe,
        recipes::update_recipe,
        recipes::get_recipe_cost,
        // Stock
        stock::list_stock,
        stock::list_low_stock,
        stock::get_stock,
        stock::update_stock_levels,
        stock::create_movement,
        stock::list_movements,
        stock::create_stock_count,
        stock::complete_stock_count,
        stock::list_stock_counts,
        // Price Lists
        price_lists::list_price_lists,
        price_lists::get_price_list,
        price_lists::create_price_list,
        price_lists::update_price_list,
        price_lists::set_default_price_list,
        price_lists::delete_price_list,
        price_lists::list_price_list_items,
        price_lists::upsert_price_list_items,
        price_lists::delete_price_list_item,
        // Marketplace Channels
        marketplace_channels::list_marketplace_channels,
        marketplace_channels::get_marketplace_channel,
        marketplace_channels::create_marketplace_channel,
        marketplace_channels::update_marketplace_channel,
        marketplace_channels::delete_marketplace_channel,
        // Currencies
        currencies::list_currencies,
        currencies::get_currency,
        currencies::create_currency,
        currencies::update_currency,
        currencies::delete_currency,
        // Contacts
        contacts::list_contacts,
        contacts::get_contact,
        contacts::create_contact,
        contacts::update_contact,
        contacts::delete_contact,
        contacts::list_contact_transactions,
        contacts::record_payment,
        // Invoices
        invoices::list_invoices,
        invoices::get_invoice,
        invoices::create_invoice,
        invoices::update_invoice,
        invoices::update_invoice_status,
        invoices::delete_invoice,
        // Orders
        orders::list_orders,
        orders::get_order,
        orders::create_order,
        orders::void_order,
        orders::return_order,
        // Shifts
        shifts::list_shifts,
        shifts::get_current_shift,
        shifts::open_shift,
        shifts::close_shift,
        // Payment Methods
        payment_methods::list_payment_methods,
        payment_methods::create_payment_method,
        payment_methods::update_payment_method,
        payment_methods::set_default_payment_method,
        payment_methods::delete_payment_method,
        // POS Terminals
        pos_terminals::list_pos_terminals,
        pos_terminals::create_pos_terminal,
        pos_terminals::update_pos_terminal,
        pos_terminals::delete_pos_terminal,
        // Production
        production::list_production_records,
        production::get_production_record,
        production::create_production_record,
        production::update_production_record,
        production::delete_production_record,
        production::list_production_sessions,
        production::create_production_session,
        production::add_session_item,
        production::complete_production_session,
        production::delete_production_session,
        // Notifications
        notifications::list_notifications,
        notifications::unread_count,
        notifications::mark_read,
        notifications::mark_all_read,
        // Audit
        audit::list_audit_logs,
        // Users
        users::list_users,
        users::get_user,
        users::create_user,
        users::update_user_role,
        users::remove_user,
        // Dashboard
        dashboard::get_dashboard,
    ),
    components(schemas(
        // Auth
        auth::LoginRequest,
        auth::RegisterRequest,
        auth::RefreshRequest,
        auth::SwitchCompanyRequest,
        auth::TokenResponse,
        auth::LoginResponse,
        auth::LoginUser,
        auth::LoginCompany,
        // Company
        company::UpdateCompanyRequest,
        heyloaf_dal::models::company::Company,
        // Categories
        categories::CreateCategoryRequest,
        categories::UpdateCategoryRequest,
        heyloaf_dal::models::category::Category,
        // Products
        products::CreateProductRequest,
        products::UpdateProductRequest,
        products::BulkIdsRequest,
        products::BulkCategoryRequest,
        products::BulkActionResponse,
        heyloaf_dal::models::product::Product,
        // Recipes
        recipes::UpdateRecipeRequest,
        recipes::RecipeMaterial,
        recipes::RecipeVariant,
        recipes::RecipeCostResponse,
        recipes::MaterialCostLine,
        // Stock
        stock::UpdateStockLevelsRequest,
        stock::CreateMovementRequest,
        stock::CreateStockCountRequest,
        heyloaf_dal::models::stock::Stock,
        heyloaf_dal::models::stock_movement::StockMovement,
        heyloaf_dal::models::stock_count::StockCount,
        // Price Lists
        price_lists::CreatePriceListRequest,
        price_lists::UpdatePriceListRequest,
        price_lists::UpsertPriceListItemRequest,
        price_lists::BulkPriceListItemEntry,
        heyloaf_dal::models::price_list::PriceList,
        heyloaf_dal::models::price_list_item::PriceListItem,
        // Marketplace Channels
        marketplace_channels::CreateMarketplaceChannelRequest,
        marketplace_channels::UpdateMarketplaceChannelRequest,
        heyloaf_dal::models::marketplace_channel::MarketplaceChannel,
        // Currencies
        currencies::CreateCurrencyRequest,
        currencies::UpdateCurrencyRequest,
        heyloaf_dal::models::currency::Currency,
        // Contacts
        contacts::CreateContactRequest,
        contacts::UpdateContactRequest,
        contacts::RecordPaymentRequest,
        heyloaf_dal::models::contact::Contact,
        // Invoices
        invoices::CreateInvoiceRequest,
        invoices::UpdateInvoiceRequest,
        invoices::UpdateInvoiceStatusRequest,
        heyloaf_dal::models::invoice::Invoice,
        // Transactions
        heyloaf_dal::models::transaction::Transaction,
        // Orders
        orders::CreateOrderRequest,
        orders::CreateOrderItemRequest,
        orders::OrderWithItems,
        heyloaf_dal::models::order::Order,
        heyloaf_dal::models::order::OrderItem,
        // Shifts
        shifts::OpenShiftRequest,
        shifts::CloseShiftRequest,
        heyloaf_dal::models::shift::Shift,
        // Payment Methods
        payment_methods::CreatePaymentMethodRequest,
        payment_methods::UpdatePaymentMethodRequest,
        heyloaf_dal::models::payment_method::PaymentMethod,
        // POS Terminals
        pos_terminals::CreatePosTerminalRequest,
        pos_terminals::UpdatePosTerminalRequest,
        heyloaf_dal::models::pos_terminal::PosTerminal,
        // Production
        production::CreateProductionRecordRequest,
        production::UpdateProductionRecordRequest,
        production::CreateProductionSessionRequest,
        production::AddSessionItemRequest,
        heyloaf_dal::models::production_record::ProductionRecord,
        heyloaf_dal::models::production_session::ProductionSession,
        // Notifications
        notifications::UnreadCountResponse,
        notifications::MarkAllReadResponse,
        heyloaf_dal::models::notification::Notification,
        // Users
        users::CreateUserRequest,
        users::UpdateRoleRequest,
        heyloaf_dal::models::user::CompanyUser,
        // Audit
        heyloaf_dal::models::audit::AuditLog,
        // Dashboard
        dashboard::DashboardData,
    )),
    tags(
        (name = "auth", description = "Authentication endpoints"),
        (name = "company", description = "Company management"),
        (name = "categories", description = "Product category management"),
        (name = "products", description = "Product management"),
        (name = "stock", description = "Stock management"),
        (name = "price-lists", description = "Price list management"),
        (name = "marketplace-channels", description = "Marketplace channel management"),
        (name = "currencies", description = "Currency management"),
        (name = "contacts", description = "Contact & ledger management"),
        (name = "invoices", description = "Invoice management"),
        (name = "orders", description = "Order management"),
        (name = "shifts", description = "Shift management"),
        (name = "payment-methods", description = "Payment method management"),
        (name = "pos-terminals", description = "POS terminal management"),
        (name = "recipes", description = "Product recipe & BOM management"),
        (name = "production", description = "Production & cooking workflow"),
        (name = "notifications", description = "Notification management"),
        (name = "users", description = "User management"),
        (name = "audit", description = "Audit log management"),
        (name = "dashboard", description = "Dashboard aggregations"),
    )
)]
pub struct ApiDoc;
