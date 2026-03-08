use axum::extract::{Path, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use heyloaf_dal::models::price_list::PriceList;
use heyloaf_dal::models::price_list_item::PriceListItem;
use heyloaf_dal::repositories::price_list::PriceListRepository;
use heyloaf_dal::repositories::price_list_item::PriceListItemRepository;
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

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreatePriceListRequest {
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
    #[validate(length(min = 1, message = "Channel type is required"))]
    pub channel_type: String,
    pub marketplace_channel_id: Option<Uuid>,
    pub city: Option<String>,
    #[serde(default)]
    pub is_default: bool,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdatePriceListRequest {
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
    #[validate(length(min = 1, message = "Channel type is required"))]
    pub channel_type: String,
    pub marketplace_channel_id: Option<Uuid>,
    pub city: Option<String>,
    #[serde(default = "default_true")]
    pub is_active: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpsertPriceListItemRequest {
    pub product_id: Option<Uuid>,
    pub price: Option<f64>,
    pub vat_rate: Option<f64>,
    pub items: Option<Vec<BulkPriceListItemEntry>>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct BulkPriceListItemEntry {
    pub product_id: Uuid,
    pub price: f64,
    pub vat_rate: Option<f64>,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/price-lists",
    tag = "price_lists",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<PriceList>>)))
)]
pub async fn list_price_lists(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<PriceList>>>, AppError> {
    let price_lists = PriceListRepository::list(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(price_lists)))
}

#[utoipa::path(
    get,
    path = "/api/price-lists/{id}",
    tag = "price_lists",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Price list ID")),
    responses((status = 200, body = inline(ApiResponse<PriceList>)))
)]
pub async fn get_price_list(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<PriceList>>, AppError> {
    let price_list = PriceListRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Price list not found".into()))?;

    if price_list.company_id != ctx.company_id {
        return Err(AppError::NotFound("Price list not found".into()));
    }

    Ok(Json(ApiResponse::new(price_list)))
}

#[utoipa::path(
    post,
    path = "/api/price-lists",
    tag = "price_lists",
    security(("bearer" = [])),
    request_body = CreatePriceListRequest,
    responses((status = 200, body = inline(ApiResponse<PriceList>)))
)]
pub async fn create_price_list(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreatePriceListRequest>,
) -> Result<Json<ApiResponse<PriceList>>, AppError> {
    let price_list = PriceListRepository::create(
        &state.pool,
        ctx.company_id,
        &body.name,
        &body.channel_type,
        body.marketplace_channel_id,
        body.city.as_deref(),
        body.is_default,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("price_list", price_list.id)
        .action("create")
        .after(&price_list)
        .emit();

    Ok(Json(ApiResponse::new(price_list)))
}

#[utoipa::path(
    put,
    path = "/api/price-lists/{id}",
    tag = "price_lists",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Price list ID")),
    request_body = UpdatePriceListRequest,
    responses((status = 200, body = inline(ApiResponse<PriceList>)))
)]
pub async fn update_price_list(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdatePriceListRequest>,
) -> Result<Json<ApiResponse<PriceList>>, AppError> {
    let existing = PriceListRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Price list not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Price list not found".into()));
    }

    let price_list = PriceListRepository::update(
        &state.pool,
        id,
        &body.name,
        &body.channel_type,
        body.marketplace_channel_id,
        body.city.as_deref(),
        body.is_active,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("price_list", price_list.id)
        .action("update")
        .before(&existing)
        .after(&price_list)
        .emit();

    Ok(Json(ApiResponse::new(price_list)))
}

#[utoipa::path(
    post,
    path = "/api/price-lists/{id}/default",
    tag = "price_lists",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Price list ID")),
    responses((status = 200, body = inline(ApiResponse<PriceList>)))
)]
pub async fn set_default_price_list(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<PriceList>>, AppError> {
    let existing = PriceListRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Price list not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Price list not found".into()));
    }

    let price_list = PriceListRepository::set_default(&state.pool, ctx.company_id, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("price_list", price_list.id)
        .action("set_default")
        .after(&price_list)
        .emit();

    Ok(Json(ApiResponse::new(price_list)))
}

#[utoipa::path(
    delete,
    path = "/api/price-lists/{id}",
    tag = "price_lists",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Price list ID")),
    responses((status = 200))
)]
pub async fn delete_price_list(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = PriceListRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Price list not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Price list not found".into()));
    }

    PriceListRepository::delete(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("price_list", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Price list deleted successfully"
    }))))
}

#[utoipa::path(
    get,
    path = "/api/price-lists/{id}/items",
    tag = "price_lists",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Price list ID")),
    responses((status = 200, body = inline(ApiResponse<Vec<PriceListItem>>)))
)]
pub async fn list_price_list_items(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Vec<PriceListItem>>>, AppError> {
    let price_list = PriceListRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Price list not found".into()))?;

    if price_list.company_id != ctx.company_id {
        return Err(AppError::NotFound("Price list not found".into()));
    }

    let items = PriceListItemRepository::list_by_price_list(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(items)))
}

#[utoipa::path(
    post,
    path = "/api/price-lists/{id}/items",
    tag = "price_lists",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Price list ID")),
    request_body = UpsertPriceListItemRequest,
    responses((status = 200, body = inline(ApiResponse<Vec<PriceListItem>>)))
)]
pub async fn upsert_price_list_items(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpsertPriceListItemRequest>,
) -> Result<Json<ApiResponse<Vec<PriceListItem>>>, AppError> {
    let price_list = PriceListRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Price list not found".into()))?;

    if price_list.company_id != ctx.company_id {
        return Err(AppError::NotFound("Price list not found".into()));
    }

    let results = if let Some(items) = body.items {
        let tuples: Vec<(Uuid, f64, Option<f64>)> = items
            .iter()
            .map(|i| (i.product_id, i.price, i.vat_rate))
            .collect();
        PriceListItemRepository::bulk_upsert(&state.pool, ctx.company_id, id, &tuples)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
    } else {
        let product_id = body
            .product_id
            .ok_or_else(|| AppError::BadRequest("product_id or items required".into()))?;
        let price = body
            .price
            .ok_or_else(|| AppError::BadRequest("price is required".into()))?;
        let item = PriceListItemRepository::upsert(
            &state.pool,
            ctx.company_id,
            id,
            product_id,
            price,
            body.vat_rate,
        )
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
        vec![item]
    };

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("price_list", id)
        .action("upsert_items")
        .after(&results)
        .emit();

    Ok(Json(ApiResponse::new(results)))
}

#[utoipa::path(
    delete,
    path = "/api/price-lists/items/{item_id}",
    tag = "price_lists",
    security(("bearer" = [])),
    params(("item_id" = Uuid, Path, description = "Price list item ID")),
    responses((status = 200))
)]
pub async fn delete_price_list_item(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(item_id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = PriceListItemRepository::find_by_id(&state.pool, item_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Price list item not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Price list item not found".into()));
    }

    PriceListItemRepository::delete(&state.pool, item_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("price_list_item", item_id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Price list item deleted successfully"
    }))))
}
