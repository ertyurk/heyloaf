use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{ApiResponse, PaginatedResponse, PaginationParams};
use heyloaf_dal::models::product::Product;
use heyloaf_dal::repositories::product::ProductRepository;
use heyloaf_services::audit_service::AuditBuilder;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::extractors::validated::ValidatedJson;
use crate::middleware::auth::AuthUser;
use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

// --- Request types ---

#[derive(Debug, Deserialize)]
pub struct ProductListParams {
    pub product_type: Option<String>,
    pub status: Option<String>,
    pub category_id: Option<Uuid>,
    pub search: Option<String>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateProductRequest {
    #[validate(length(min = 1, message = "Product name is required"))]
    pub name: String,
    pub code: Option<String>,
    pub barcode: Option<String>,
    pub category_id: Option<Uuid>,
    #[validate(length(min = 1, message = "Product type is required"))]
    pub product_type: String,
    #[validate(length(min = 1, message = "Unit of measure is required"))]
    pub unit_of_measure: String,
    pub tax_rate: Option<f64>,
    #[serde(default)]
    pub stock_tracking: bool,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateProductRequest {
    #[validate(length(min = 1, message = "Product name is required"))]
    pub name: String,
    pub code: Option<String>,
    pub barcode: Option<String>,
    pub category_id: Option<Uuid>,
    #[validate(length(min = 1, message = "Status is required"))]
    pub status: String,
    #[validate(length(min = 1, message = "Stock status is required"))]
    pub stock_status: String,
    #[validate(length(min = 1, message = "Unit of measure is required"))]
    pub unit_of_measure: String,
    pub sale_unit_type: Option<String>,
    pub plu_type: Option<String>,
    pub plu_code: Option<String>,
    #[serde(default)]
    pub scale_enabled: bool,
    pub tax_rate: Option<f64>,
    #[serde(default)]
    pub stock_tracking: bool,
    pub min_stock_level: Option<f64>,
    pub image_url: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct BulkIdsRequest {
    pub ids: Vec<Uuid>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct BulkCategoryRequest {
    pub ids: Vec<Uuid>,
    pub category_id: Option<Uuid>,
}

#[derive(Debug, serde::Serialize, ToSchema)]
pub struct BulkActionResponse {
    pub affected: u64,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/products",
    tag = "products",
    security(("bearer" = [])),
    params(
        ("product_type" = Option<String>, Query, description = "Filter by product type"),
        ("status" = Option<String>, Query, description = "Filter by status"),
        ("category_id" = Option<Uuid>, Query, description = "Filter by category"),
        ("search" = Option<String>, Query, description = "Search by name, code, or barcode"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<Product>)))
)]
pub async fn list_products(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<ProductListParams>,
) -> Result<Json<PaginatedResponse<Product>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (products, total) = ProductRepository::list(
        &state.pool,
        ctx.company_id,
        params.product_type.as_deref(),
        params.status.as_deref(),
        params.category_id,
        params.search.as_deref(),
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(
        products, total, page, per_page,
    )))
}

#[utoipa::path(
    get,
    path = "/api/products/{id}",
    tag = "products",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Product ID")),
    responses((status = 200, body = inline(ApiResponse<Product>)))
)]
pub async fn get_product(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Product>>, AppError> {
    let product = ProductRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Product not found".into()))?;

    if product.company_id != ctx.company_id {
        return Err(AppError::NotFound("Product not found".into()));
    }

    Ok(Json(ApiResponse::new(product)))
}

#[utoipa::path(
    post,
    path = "/api/products",
    tag = "products",
    security(("bearer" = [])),
    request_body = CreateProductRequest,
    responses((status = 200, body = inline(ApiResponse<Product>)))
)]
pub async fn create_product(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateProductRequest>,
) -> Result<Json<ApiResponse<Product>>, AppError> {
    let product = ProductRepository::create(
        &state.pool,
        ctx.company_id,
        &body.name,
        body.code.as_deref(),
        body.barcode.as_deref(),
        body.category_id,
        &body.product_type,
        &body.unit_of_measure,
        body.tax_rate,
        body.stock_tracking,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("product", product.id)
        .action("create")
        .after(&product)
        .emit();

    Ok(Json(ApiResponse::new(product)))
}

#[utoipa::path(
    put,
    path = "/api/products/{id}",
    tag = "products",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Product ID")),
    request_body = UpdateProductRequest,
    responses((status = 200, body = inline(ApiResponse<Product>)))
)]
pub async fn update_product(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdateProductRequest>,
) -> Result<Json<ApiResponse<Product>>, AppError> {
    let existing = ProductRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Product not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Product not found".into()));
    }

    let product = ProductRepository::update(
        &state.pool,
        id,
        &body.name,
        body.code.as_deref(),
        body.barcode.as_deref(),
        body.category_id,
        &body.status,
        &body.stock_status,
        &body.unit_of_measure,
        body.sale_unit_type.as_deref(),
        body.plu_type.as_deref(),
        body.plu_code.as_deref(),
        body.scale_enabled,
        body.tax_rate,
        body.stock_tracking,
        body.min_stock_level,
        body.image_url.as_deref(),
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("product", product.id)
        .action("update")
        .before(&existing)
        .after(&product)
        .emit();

    Ok(Json(ApiResponse::new(product)))
}

#[utoipa::path(
    delete,
    path = "/api/products/{id}",
    tag = "products",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Product ID")),
    responses((status = 200))
)]
pub async fn delete_product(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = ProductRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Product not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Product not found".into()));
    }

    ProductRepository::delete(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("product", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Product deleted successfully"
    }))))
}

#[utoipa::path(
    post,
    path = "/api/products/bulk/activate",
    tag = "products",
    security(("bearer" = [])),
    request_body = BulkIdsRequest,
    responses((status = 200, body = inline(ApiResponse<BulkActionResponse>)))
)]
pub async fn bulk_activate(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Json(body): Json<BulkIdsRequest>,
) -> Result<Json<ApiResponse<BulkActionResponse>>, AppError> {
    if body.ids.is_empty() {
        return Err(AppError::BadRequest("No product IDs provided".into()));
    }

    let affected =
        ProductRepository::bulk_update_status(&state.pool, &body.ids, ctx.company_id, "active")
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(BulkActionResponse { affected })))
}

#[utoipa::path(
    post,
    path = "/api/products/bulk/deactivate",
    tag = "products",
    security(("bearer" = [])),
    request_body = BulkIdsRequest,
    responses((status = 200, body = inline(ApiResponse<BulkActionResponse>)))
)]
pub async fn bulk_deactivate(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Json(body): Json<BulkIdsRequest>,
) -> Result<Json<ApiResponse<BulkActionResponse>>, AppError> {
    if body.ids.is_empty() {
        return Err(AppError::BadRequest("No product IDs provided".into()));
    }

    let affected = ProductRepository::bulk_update_status(
        &state.pool,
        &body.ids,
        ctx.company_id,
        "inactive",
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(BulkActionResponse { affected })))
}

#[utoipa::path(
    post,
    path = "/api/products/bulk/category",
    tag = "products",
    security(("bearer" = [])),
    request_body = BulkCategoryRequest,
    responses((status = 200, body = inline(ApiResponse<BulkActionResponse>)))
)]
pub async fn bulk_category(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Json(body): Json<BulkCategoryRequest>,
) -> Result<Json<ApiResponse<BulkActionResponse>>, AppError> {
    if body.ids.is_empty() {
        return Err(AppError::BadRequest("No product IDs provided".into()));
    }

    let affected = ProductRepository::bulk_update_category(
        &state.pool,
        &body.ids,
        ctx.company_id,
        body.category_id,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(BulkActionResponse { affected })))
}
