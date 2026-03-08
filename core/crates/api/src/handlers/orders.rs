use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use chrono::{DateTime, Utc};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{ApiResponse, PaginatedResponse, PaginationParams};
use heyloaf_dal::models::order::{Order, OrderItem};
use heyloaf_dal::repositories::order::{OrderItemRepository, OrderItemTuple, OrderRepository};
use heyloaf_services::audit_service::AuditBuilder;
use heyloaf_services::stock_service::StockService;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::extractors::validated::ValidatedJson;
use crate::middleware::auth::AuthUser;
use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

// --- Request / Response types ---

#[derive(Debug, Deserialize)]
pub struct OrderListParams {
    pub status: Option<String>,
    pub cashier_id: Option<Uuid>,
    pub date_from: Option<DateTime<Utc>>,
    pub date_to: Option<DateTime<Utc>>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateOrderRequest {
    pub shift_id: Option<Uuid>,
    pub terminal_id: Option<Uuid>,
    pub payment_method_id: Option<Uuid>,
    pub notes: Option<String>,
    #[validate(length(min = 1, message = "At least one item is required"))]
    pub items: Vec<CreateOrderItemRequest>,
}

#[derive(Debug, Deserialize, Serialize, Validate, ToSchema)]
pub struct CreateOrderItemRequest {
    pub product_id: Option<Uuid>,
    #[validate(length(min = 1, message = "Product name is required"))]
    pub product_name: String,
    pub variant_name: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub vat_rate: f64,
    pub line_total: f64,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct OrderReasonRequest {
    #[validate(length(min = 1, message = "Reason is required"))]
    pub reason: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct OrderWithItems {
    #[serde(flatten)]
    pub order: Order,
    pub items: Vec<OrderItem>,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/orders",
    tag = "orders",
    security(("bearer" = [])),
    params(
        ("status" = Option<String>, Query, description = "Filter by status"),
        ("cashier_id" = Option<Uuid>, Query, description = "Filter by cashier"),
        ("date_from" = Option<DateTime<Utc>>, Query, description = "Filter from date"),
        ("date_to" = Option<DateTime<Utc>>, Query, description = "Filter to date"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<Order>)))
)]
pub async fn list_orders(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<OrderListParams>,
) -> Result<Json<PaginatedResponse<Order>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (orders, total) = OrderRepository::list(
        &state.pool,
        ctx.company_id,
        params.status.as_deref(),
        params.cashier_id,
        params.date_from,
        params.date_to,
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(orders, total, page, per_page)))
}

#[utoipa::path(
    get,
    path = "/api/orders/{id}",
    tag = "orders",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Order ID")),
    responses((status = 200, body = inline(ApiResponse<OrderWithItems>)))
)]
pub async fn get_order(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<OrderWithItems>>, AppError> {
    let order = OrderRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Order not found".into()))?;

    if order.company_id != ctx.company_id {
        return Err(AppError::NotFound("Order not found".into()));
    }

    let items = OrderItemRepository::list_by_order(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(OrderWithItems { order, items })))
}

#[utoipa::path(
    post,
    path = "/api/orders",
    tag = "orders",
    security(("bearer" = [])),
    request_body = CreateOrderRequest,
    responses((status = 200, body = inline(ApiResponse<OrderWithItems>)))
)]
pub async fn create_order(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateOrderRequest>,
) -> Result<Json<ApiResponse<OrderWithItems>>, AppError> {
    let subtotal: f64 = body.items.iter().map(|i| i.line_total).sum();
    let tax_total: f64 = body
        .items
        .iter()
        .map(|i| i.line_total * i.vat_rate / 100.0)
        .sum();
    let total = subtotal + tax_total;

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    let order_number = OrderRepository::next_number_with_executor(&mut *tx)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let order = OrderRepository::create_with_executor(
        &mut *tx,
        ctx.company_id,
        &order_number,
        auth.user_id,
        body.shift_id,
        body.terminal_id,
        subtotal,
        tax_total,
        total,
        body.payment_method_id,
        body.notes.as_deref(),
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    let batch_items: Vec<OrderItemTuple> = body
        .items
        .into_iter()
        .map(|i| {
            (
                i.product_id,
                i.product_name,
                i.variant_name,
                i.quantity,
                i.unit_price,
                i.vat_rate,
                i.line_total,
            )
        })
        .collect();

    let items =
        OrderItemRepository::create_batch_with_executor(&mut *tx, order.id, &batch_items)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    // Stock-out for each item with a product_id
    for item in &items {
        if let Some(product_id) = item.product_id {
            StockService::record_movement_tx(
                &mut tx,
                ctx.company_id,
                product_id,
                "out",
                "sale",
                item.quantity,
                Some(item.unit_price),
                Some(item.vat_rate),
                Some("order"),
                Some(order.id),
                None,
                auth.user_id,
            )
            .await?;
        }
    }

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("order", order.id)
        .action("create")
        .after(&order)
        .emit();

    Ok(Json(ApiResponse::new(OrderWithItems { order, items })))
}

#[utoipa::path(
    post,
    path = "/api/orders/{id}/void",
    tag = "orders",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Order ID")),
    request_body = OrderReasonRequest,
    responses((status = 200, body = inline(ApiResponse<Order>)))
)]
pub async fn void_order(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<OrderReasonRequest>,
) -> Result<Json<ApiResponse<Order>>, AppError> {
    let existing = OrderRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Order not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Order not found".into()));
    }

    if existing.status != "completed" {
        return Err(AppError::BadRequest(
            "Only completed orders can be voided".into(),
        ));
    }

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    let order =
        OrderRepository::update_status_with_notes_executor(
            &mut *tx, id, "voided", &body.reason,
        )
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Reverse stock movements for voided order
    StockService::reverse_movements_tx(&mut tx, "order", id, auth.user_id).await?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("order", order.id)
        .action("void")
        .before(&existing)
        .after(&order)
        .emit();

    Ok(Json(ApiResponse::new(order)))
}

#[utoipa::path(
    post,
    path = "/api/orders/{id}/return",
    tag = "orders",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Order ID")),
    request_body = OrderReasonRequest,
    responses((status = 200, body = inline(ApiResponse<Order>)))
)]
pub async fn return_order(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<OrderReasonRequest>,
) -> Result<Json<ApiResponse<Order>>, AppError> {
    let existing = OrderRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Order not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Order not found".into()));
    }

    if existing.status != "completed" {
        return Err(AppError::BadRequest(
            "Only completed orders can be returned".into(),
        ));
    }

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    let order =
        OrderRepository::update_status_with_notes_executor(
            &mut *tx, id, "returned", &body.reason,
        )
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Reverse stock movements for returned order
    StockService::reverse_movements_tx(&mut tx, "order", id, auth.user_id).await?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("order", order.id)
        .action("return")
        .before(&existing)
        .after(&order)
        .emit();

    Ok(Json(ApiResponse::new(order)))
}
