use axum::extract::{Path, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use heyloaf_dal::models::marketplace_channel::MarketplaceChannel;
use heyloaf_dal::repositories::marketplace_channel::MarketplaceChannelRepository;
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
pub struct CreateMarketplaceChannelRequest {
    #[validate(length(min = 1, message = "Code is required"))]
    pub code: String,
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateMarketplaceChannelRequest {
    #[validate(length(min = 1, message = "Code is required"))]
    pub code: String,
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
    #[serde(default = "default_true")]
    pub is_active: bool,
}

fn default_true() -> bool {
    true
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/marketplace-channels",
    tag = "marketplace_channels",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<MarketplaceChannel>>)))
)]
pub async fn list_marketplace_channels(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<MarketplaceChannel>>>, AppError> {
    let channels = MarketplaceChannelRepository::list(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(channels)))
}

#[utoipa::path(
    get,
    path = "/api/marketplace-channels/{id}",
    tag = "marketplace_channels",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Marketplace channel ID")),
    responses((status = 200, body = inline(ApiResponse<MarketplaceChannel>)))
)]
pub async fn get_marketplace_channel(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<MarketplaceChannel>>, AppError> {
    let channel = MarketplaceChannelRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Marketplace channel not found".into()))?;

    if channel.company_id != ctx.company_id {
        return Err(AppError::NotFound("Marketplace channel not found".into()));
    }

    Ok(Json(ApiResponse::new(channel)))
}

#[utoipa::path(
    post,
    path = "/api/marketplace-channels",
    tag = "marketplace_channels",
    security(("bearer" = [])),
    request_body = CreateMarketplaceChannelRequest,
    responses((status = 200, body = inline(ApiResponse<MarketplaceChannel>)))
)]
pub async fn create_marketplace_channel(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateMarketplaceChannelRequest>,
) -> Result<Json<ApiResponse<MarketplaceChannel>>, AppError> {
    let channel =
        MarketplaceChannelRepository::create(&state.pool, ctx.company_id, &body.code, &body.name)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("marketplace_channel", channel.id)
        .action("create")
        .after(&channel)
        .emit();

    Ok(Json(ApiResponse::new(channel)))
}

#[utoipa::path(
    put,
    path = "/api/marketplace-channels/{id}",
    tag = "marketplace_channels",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Marketplace channel ID")),
    request_body = UpdateMarketplaceChannelRequest,
    responses((status = 200, body = inline(ApiResponse<MarketplaceChannel>)))
)]
pub async fn update_marketplace_channel(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdateMarketplaceChannelRequest>,
) -> Result<Json<ApiResponse<MarketplaceChannel>>, AppError> {
    let existing = MarketplaceChannelRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Marketplace channel not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Marketplace channel not found".into()));
    }

    let channel = MarketplaceChannelRepository::update(
        &state.pool,
        id,
        &body.code,
        &body.name,
        body.is_active,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("marketplace_channel", channel.id)
        .action("update")
        .before(&existing)
        .after(&channel)
        .emit();

    Ok(Json(ApiResponse::new(channel)))
}

#[utoipa::path(
    delete,
    path = "/api/marketplace-channels/{id}",
    tag = "marketplace_channels",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Marketplace channel ID")),
    responses((status = 200))
)]
pub async fn delete_marketplace_channel(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = MarketplaceChannelRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Marketplace channel not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Marketplace channel not found".into()));
    }

    let has_price_lists = MarketplaceChannelRepository::has_price_lists(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    if has_price_lists {
        return Err(AppError::BadRequest(
            "Cannot delete marketplace channel that has associated price lists".into(),
        ));
    }

    MarketplaceChannelRepository::delete(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("marketplace_channel", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Marketplace channel deleted successfully"
    }))))
}
