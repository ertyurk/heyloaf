use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{ApiResponse, PaginatedResponse, PaginationParams};
use heyloaf_dal::models::stock::Stock;
use heyloaf_dal::models::stock_count::StockCount;
use heyloaf_dal::models::stock_movement::StockMovement;
use heyloaf_dal::repositories::stock::StockRepository;
use heyloaf_dal::repositories::stock_count::StockCountRepository;
use heyloaf_dal::repositories::stock_movement::StockMovementRepository;
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

// --- Request types ---

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateStockLevelsRequest {
    pub min_level: Option<f64>,
    pub max_level: Option<f64>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateMovementRequest {
    pub product_id: Uuid,
    #[validate(length(min = 1, message = "Movement type is required"))]
    pub movement_type: String,
    #[validate(range(exclusive_min = 0.0, message = "Quantity must be greater than zero"))]
    pub quantity: f64,
    pub description: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct MovementListParams {
    pub product_id: Option<Uuid>,
    pub movement_type: Option<String>,
    pub source: Option<String>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Deserialize, Serialize, Validate, ToSchema)]
pub struct StockCountItem {
    pub product_id: Uuid,
    pub counted_quantity: f64,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateStockCountRequest {
    pub notes: Option<String>,
    #[validate(length(min = 1, message = "At least one item is required"))]
    pub items: Vec<StockCountItem>,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/stock",
    tag = "stock",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<Stock>>)))
)]
pub async fn list_stock(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<Stock>>>, AppError> {
    let stock = StockRepository::list(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(stock)))
}

#[utoipa::path(
    get,
    path = "/api/stock/low",
    tag = "stock",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<Stock>>)))
)]
pub async fn list_low_stock(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<Stock>>>, AppError> {
    let stock = StockRepository::list_low_stock(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(stock)))
}

#[utoipa::path(
    get,
    path = "/api/stock/{product_id}",
    tag = "stock",
    security(("bearer" = [])),
    params(("product_id" = Uuid, Path, description = "Product ID")),
    responses((status = 200, body = inline(ApiResponse<Stock>)))
)]
pub async fn get_stock(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(product_id): Path<Uuid>,
) -> Result<Json<ApiResponse<Stock>>, AppError> {
    let stock = StockRepository::find_by_product(&state.pool, ctx.company_id, product_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Stock record not found".into()))?;

    Ok(Json(ApiResponse::new(stock)))
}

#[utoipa::path(
    put,
    path = "/api/stock/{product_id}/levels",
    tag = "stock",
    security(("bearer" = [])),
    params(("product_id" = Uuid, Path, description = "Product ID")),
    request_body = UpdateStockLevelsRequest,
    responses((status = 200, body = inline(ApiResponse<Stock>)))
)]
pub async fn update_stock_levels(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(product_id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdateStockLevelsRequest>,
) -> Result<Json<ApiResponse<Stock>>, AppError> {
    // Ensure the stock record exists
    StockRepository::get_or_create(&state.pool, ctx.company_id, product_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let stock = StockRepository::update_levels(
        &state.pool,
        ctx.company_id,
        product_id,
        body.min_level,
        body.max_level,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("stock", stock.id)
        .action("update_levels")
        .after(&stock)
        .emit();

    Ok(Json(ApiResponse::new(stock)))
}

#[utoipa::path(
    post,
    path = "/api/stock/movements",
    tag = "stock",
    security(("bearer" = [])),
    request_body = CreateMovementRequest,
    responses((status = 200, body = inline(ApiResponse<StockMovement>)))
)]
pub async fn create_movement(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateMovementRequest>,
) -> Result<Json<ApiResponse<StockMovement>>, AppError> {
    let stock_service = StockService::new(state.pool.clone());

    let movement = stock_service
        .record_movement(
            ctx.company_id,
            body.product_id,
            &body.movement_type,
            "manual",
            body.quantity,
            None,
            None,
            None,
            None,
            body.description.as_deref(),
            auth.user_id,
        )
        .await?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("stock_movement", movement.id)
        .action("create")
        .after(&movement)
        .emit();

    Ok(Json(ApiResponse::new(movement)))
}

#[utoipa::path(
    get,
    path = "/api/stock/movements",
    tag = "stock",
    security(("bearer" = [])),
    params(
        ("product_id" = Option<Uuid>, Query, description = "Filter by product"),
        ("movement_type" = Option<String>, Query, description = "Filter by movement type"),
        ("source" = Option<String>, Query, description = "Filter by source"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<StockMovement>)))
)]
pub async fn list_movements(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<MovementListParams>,
) -> Result<Json<PaginatedResponse<StockMovement>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (movements, total) = StockMovementRepository::list(
        &state.pool,
        ctx.company_id,
        params.product_id,
        params.movement_type.as_deref(),
        params.source.as_deref(),
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(
        movements, total, page, per_page,
    )))
}

#[utoipa::path(
    post,
    path = "/api/stock/counts",
    tag = "stock",
    security(("bearer" = [])),
    request_body = CreateStockCountRequest,
    responses((status = 200, body = inline(ApiResponse<StockCount>)))
)]
pub async fn create_stock_count(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateStockCountRequest>,
) -> Result<Json<ApiResponse<StockCount>>, AppError> {
    let items_json = serde_json::to_value(&body.items)
        .map_err(|e| AppError::BadRequest(format!("Invalid items: {e}")))?;

    let stock_count = StockCountRepository::create(
        &state.pool,
        ctx.company_id,
        auth.user_id,
        body.notes.as_deref(),
        items_json,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("stock_count", stock_count.id)
        .action("create")
        .after(&stock_count)
        .emit();

    Ok(Json(ApiResponse::new(stock_count)))
}

#[utoipa::path(
    post,
    path = "/api/stock/counts/{id}/complete",
    tag = "stock",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Stock count ID")),
    responses((status = 200, body = inline(ApiResponse<StockCount>)))
)]
pub async fn complete_stock_count(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<StockCount>>, AppError> {
    let existing = StockCountRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Stock count not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Stock count not found".into()));
    }

    if existing.status == "completed" {
        return Err(AppError::BadRequest(
            "Stock count is already completed".into(),
        ));
    }

    // Process count items — generate adjustment movements in a single transaction
    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    if let Some(items) = existing.items.as_array() {
        for item in items {
            let product_id = item
                .get("product_id")
                .and_then(|v| v.as_str())
                .and_then(|s| Uuid::parse_str(s).ok());
            let counted_quantity = item.get("counted_quantity").and_then(|v| v.as_f64());

            if let (Some(product_id), Some(counted)) = (product_id, counted_quantity) {
                // Get current stock level INSIDE the transaction to avoid TOCTOU race
                let current: Option<f64> = sqlx::query_scalar(
                    "SELECT quantity FROM stock WHERE company_id = $1 AND product_id = $2 FOR UPDATE",
                )
                .bind(ctx.company_id)
                .bind(product_id)
                .fetch_optional(&mut *tx)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

                let current_qty = current.unwrap_or(0.0);
                let diff = counted - current_qty;

                if diff.abs() > f64::EPSILON {
                    let movement_type = if diff > 0.0 { "in" } else { "out" };

                    StockService::record_movement_tx(
                        &mut tx,
                        ctx.company_id,
                        product_id,
                        movement_type,
                        "stock_count",
                        diff.abs(),
                        None,
                        None,
                        Some("stock_count"),
                        Some(id),
                        Some("Stock count adjustment"),
                        auth.user_id,
                    )
                    .await?;
                }
            }
        }
    }

    let stock_count = StockCountRepository::complete_with_executor(&mut *tx, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("stock_count", stock_count.id)
        .action("complete")
        .before(&existing)
        .after(&stock_count)
        .emit();

    Ok(Json(ApiResponse::new(stock_count)))
}

#[utoipa::path(
    get,
    path = "/api/stock/counts",
    tag = "stock",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<StockCount>>)))
)]
pub async fn list_stock_counts(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<StockCount>>>, AppError> {
    let counts = StockCountRepository::list(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(counts)))
}
