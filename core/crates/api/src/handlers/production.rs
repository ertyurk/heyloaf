use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use chrono::{DateTime, Utc};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{ApiResponse, PaginatedResponse, PaginationParams};
use heyloaf_dal::models::production_record::ProductionRecord;
use heyloaf_dal::models::production_session::ProductionSession;
use heyloaf_dal::repositories::production_record::ProductionRecordRepository;
use heyloaf_dal::repositories::production_session::ProductionSessionRepository;
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

#[derive(Debug, Deserialize)]
pub struct ProductionRecordListParams {
    pub product_id: Option<Uuid>,
    pub date_from: Option<DateTime<Utc>>,
    pub date_to: Option<DateTime<Utc>>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateProductionRecordRequest {
    pub product_id: Uuid,
    pub variant_name: Option<String>,
    #[validate(range(min = 0.0, message = "Quantity must be non-negative"))]
    pub quantity: f64,
    #[validate(length(min = 1, message = "Unit is required"))]
    pub unit: String,
    #[validate(range(min = 0.0, message = "Batch size must be non-negative"))]
    pub batch_size: f64,
    #[serde(default = "default_materials")]
    pub materials: serde_json::Value,
    pub notes: Option<String>,
}

fn default_materials() -> serde_json::Value {
    serde_json::Value::Array(vec![])
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateProductionRecordRequest {
    #[validate(range(min = 0.0, message = "Quantity must be non-negative"))]
    pub quantity: f64,
    #[serde(default = "default_materials")]
    pub materials: serde_json::Value,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ProductionSessionListParams {
    pub status: Option<String>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateProductionSessionRequest {
    pub name: Option<String>,
}

#[derive(Debug, Deserialize, Serialize, Validate, ToSchema)]
pub struct SessionItem {
    pub product_id: Uuid,
    pub quantity: f64,
    #[serde(default)]
    pub notes: Option<String>,
    #[serde(default = "default_materials")]
    pub materials: serde_json::Value,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct AddSessionItemRequest {
    pub item: SessionItem,
}

// --- Production Record Handlers ---

#[utoipa::path(
    get,
    path = "/api/production/records",
    tag = "production",
    security(("bearer" = [])),
    params(
        ("product_id" = Option<Uuid>, Query, description = "Filter by product"),
        ("date_from" = Option<DateTime<Utc>>, Query, description = "Filter from date"),
        ("date_to" = Option<DateTime<Utc>>, Query, description = "Filter to date"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<ProductionRecord>)))
)]
pub async fn list_production_records(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<ProductionRecordListParams>,
) -> Result<Json<PaginatedResponse<ProductionRecord>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (records, total) = ProductionRecordRepository::list(
        &state.pool,
        ctx.company_id,
        params.product_id,
        params.date_from,
        params.date_to,
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(records, total, page, per_page)))
}

#[utoipa::path(
    get,
    path = "/api/production/records/{id}",
    tag = "production",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Production record ID")),
    responses((status = 200, body = inline(ApiResponse<ProductionRecord>)))
)]
pub async fn get_production_record(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<ProductionRecord>>, AppError> {
    let record = ProductionRecordRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Production record not found".into()))?;

    if record.company_id != ctx.company_id {
        return Err(AppError::NotFound("Production record not found".into()));
    }

    Ok(Json(ApiResponse::new(record)))
}

#[utoipa::path(
    post,
    path = "/api/production/records",
    tag = "production",
    security(("bearer" = [])),
    request_body = CreateProductionRecordRequest,
    responses((status = 200, body = inline(ApiResponse<ProductionRecord>)))
)]
pub async fn create_production_record(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateProductionRecordRequest>,
) -> Result<Json<ApiResponse<ProductionRecord>>, AppError> {
    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    let record = ProductionRecordRepository::create_with_executor(
        &mut *tx,
        ctx.company_id,
        body.product_id,
        body.variant_name.as_deref(),
        body.quantity,
        &body.unit,
        body.batch_size,
        &body.materials,
        body.notes.as_deref(),
        auth.user_id,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    // Stock-in for finished product
    StockService::record_movement_tx(
        &mut tx,
        ctx.company_id,
        record.product_id,
        "in",
        "production",
        record.quantity,
        None,
        None,
        Some("production"),
        Some(record.id),
        Some("Production output"),
        auth.user_id,
    )
    .await?;

    // Stock-out for each consumed material
    record_material_stock_movements_tx(
        &mut tx,
        ctx.company_id,
        record.id,
        &record.materials,
        auth.user_id,
    )
    .await?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("production_record", record.id)
        .action("create")
        .after(&record)
        .emit();

    Ok(Json(ApiResponse::new(record)))
}

#[utoipa::path(
    put,
    path = "/api/production/records/{id}",
    tag = "production",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Production record ID")),
    request_body = UpdateProductionRecordRequest,
    responses((status = 200, body = inline(ApiResponse<ProductionRecord>)))
)]
pub async fn update_production_record(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdateProductionRecordRequest>,
) -> Result<Json<ApiResponse<ProductionRecord>>, AppError> {
    let existing = ProductionRecordRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Production record not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Production record not found".into()));
    }

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    // Reverse old stock movements before updating
    StockService::reverse_movements_tx(&mut tx, ctx.company_id, "production", id, auth.user_id)
        .await?;

    let record = ProductionRecordRepository::update_with_executor(
        &mut *tx,
        id,
        ctx.company_id,
        body.quantity,
        &body.materials,
        body.notes.as_deref(),
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    // Re-apply stock-in for finished product
    StockService::record_movement_tx(
        &mut tx,
        ctx.company_id,
        record.product_id,
        "in",
        "production",
        record.quantity,
        None,
        None,
        Some("production"),
        Some(record.id),
        Some("Production output"),
        auth.user_id,
    )
    .await?;

    // Re-apply stock-out for materials
    record_material_stock_movements_tx(
        &mut tx,
        ctx.company_id,
        record.id,
        &record.materials,
        auth.user_id,
    )
    .await?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("production_record", record.id)
        .action("update")
        .before(&existing)
        .after(&record)
        .emit();

    Ok(Json(ApiResponse::new(record)))
}

#[utoipa::path(
    delete,
    path = "/api/production/records/{id}",
    tag = "production",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Production record ID")),
    responses((status = 200))
)]
pub async fn delete_production_record(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = ProductionRecordRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Production record not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Production record not found".into()));
    }

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    // Reverse stock movements before deleting
    StockService::reverse_movements_tx(&mut tx, ctx.company_id, "production", id, auth.user_id)
        .await?;

    ProductionRecordRepository::delete_with_executor(&mut *tx, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("production_record", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Production record deleted successfully"
    }))))
}

// --- Production Session Handlers ---

#[utoipa::path(
    get,
    path = "/api/production/sessions",
    tag = "production",
    security(("bearer" = [])),
    params(
        ("status" = Option<String>, Query, description = "Filter by status"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<ProductionSession>)))
)]
pub async fn list_production_sessions(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<ProductionSessionListParams>,
) -> Result<Json<PaginatedResponse<ProductionSession>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (sessions, total) = ProductionSessionRepository::list(
        &state.pool,
        ctx.company_id,
        params.status.as_deref(),
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(
        sessions, total, page, per_page,
    )))
}

#[utoipa::path(
    post,
    path = "/api/production/sessions",
    tag = "production",
    security(("bearer" = [])),
    request_body = CreateProductionSessionRequest,
    responses((status = 200, body = inline(ApiResponse<ProductionSession>)))
)]
pub async fn create_production_session(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateProductionSessionRequest>,
) -> Result<Json<ApiResponse<ProductionSession>>, AppError> {
    let session =
        ProductionSessionRepository::create(&state.pool, ctx.company_id, body.name.as_deref())
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("production_session", session.id)
        .action("create")
        .after(&session)
        .emit();

    Ok(Json(ApiResponse::new(session)))
}

#[utoipa::path(
    post,
    path = "/api/production/sessions/{id}/items",
    tag = "production",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Production session ID")),
    request_body = AddSessionItemRequest,
    responses((status = 200, body = inline(ApiResponse<ProductionSession>)))
)]
pub async fn add_session_item(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<AddSessionItemRequest>,
) -> Result<Json<ApiResponse<ProductionSession>>, AppError> {
    let existing = ProductionSessionRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Production session not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Production session not found".into()));
    }

    if existing.status == "completed" {
        return Err(AppError::BadRequest(
            "Cannot add items to a completed session".into(),
        ));
    }

    let item_json = serde_json::to_value(&body.item)
        .map_err(|e| AppError::BadRequest(format!("Failed to serialize item: {e}")))?;

    let session = ProductionSessionRepository::add_item(&state.pool, id, ctx.company_id, &item_json)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("production_session", session.id)
        .action("add_item")
        .before(&existing)
        .after(&session)
        .emit();

    Ok(Json(ApiResponse::new(session)))
}

#[utoipa::path(
    post,
    path = "/api/production/sessions/{id}/complete",
    tag = "production",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Production session ID")),
    responses((status = 200, body = inline(ApiResponse<ProductionSession>)))
)]
pub async fn complete_production_session(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<ProductionSession>>, AppError> {
    let existing = ProductionSessionRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Production session not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Production session not found".into()));
    }

    if existing.status == "completed" {
        return Err(AppError::BadRequest("Session is already completed".into()));
    }

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    let session = ProductionSessionRepository::complete_with_executor(&mut *tx, id, ctx.company_id, auth.user_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Record stock movements for all session items
    if let Some(items) = session.items.as_array() {
        for (idx, item) in items.iter().enumerate() {
            let product_id = item
                .get("product_id")
                .and_then(serde_json::Value::as_str)
                .and_then(|s| s.parse::<Uuid>().ok())
                .ok_or_else(|| {
                    AppError::BadRequest(format!(
                        "Invalid or missing product_id in session item at index {idx}"
                    ))
                })?;

            let quantity = item
                .get("quantity")
                .and_then(serde_json::Value::as_f64)
                .ok_or_else(|| {
                    AppError::BadRequest(format!(
                        "Invalid or missing quantity in session item at index {idx}"
                    ))
                })?;

            // Stock-in for the finished product
            StockService::record_movement_tx(
                &mut tx,
                ctx.company_id,
                product_id,
                "in",
                "production",
                quantity,
                None,
                None,
                Some("production"),
                Some(session.id),
                Some("Production output"),
                auth.user_id,
            )
            .await?;

            // Stock-out for each material consumed
            let materials = item
                .get("materials")
                .cloned()
                .unwrap_or(serde_json::Value::Array(vec![]));
            record_material_stock_movements_tx(
                &mut tx,
                ctx.company_id,
                session.id,
                &materials,
                auth.user_id,
            )
            .await?;
        }
    }

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("production_session", session.id)
        .action("complete")
        .before(&existing)
        .after(&session)
        .emit();

    Ok(Json(ApiResponse::new(session)))
}

#[utoipa::path(
    delete,
    path = "/api/production/sessions/{id}",
    tag = "production",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Production session ID")),
    responses((status = 200))
)]
pub async fn delete_production_session(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = ProductionSessionRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Production session not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Production session not found".into()));
    }

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    // Reverse stock movements if the session was completed
    if existing.status == "completed" {
        StockService::reverse_movements_tx(
            &mut tx,
            ctx.company_id,
            "production",
            id,
            auth.user_id,
        )
        .await?;
    }

    ProductionSessionRepository::delete_with_executor(&mut *tx, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("production_session", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Production session deleted successfully"
    }))))
}

// --- Stock helpers ---

/// Record stock-out movements for each material in the materials JSON array,
/// within a transaction.
/// Each element is expected to have `product_id` and `quantity` fields.
async fn record_material_stock_movements_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    company_id: Uuid,
    reference_id: Uuid,
    materials: &serde_json::Value,
    user_id: Uuid,
) -> Result<(), AppError> {
    let items = match materials.as_array() {
        Some(arr) => arr,
        None => return Ok(()),
    };

    for (idx, mat) in items.iter().enumerate() {
        let product_id = mat
            .get("product_id")
            .and_then(serde_json::Value::as_str)
            .and_then(|s| s.parse::<Uuid>().ok())
            .ok_or_else(|| {
                AppError::BadRequest(format!(
                    "Invalid or missing product_id in material at index {idx}"
                ))
            })?;

        let quantity = mat
            .get("quantity")
            .and_then(serde_json::Value::as_f64)
            .ok_or_else(|| {
                AppError::BadRequest(format!(
                    "Invalid or missing quantity in material at index {idx}"
                ))
            })?;

        StockService::record_movement_tx(
            tx,
            company_id,
            product_id,
            "out",
            "production",
            quantity,
            None,
            None,
            Some("production"),
            Some(reference_id),
            Some("Material consumption"),
            user_id,
        )
        .await?;
    }

    Ok(())
}
