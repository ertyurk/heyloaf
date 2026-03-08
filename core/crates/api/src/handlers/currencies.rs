use axum::extract::{Path, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use heyloaf_dal::models::currency::Currency;
use heyloaf_dal::repositories::currency::CurrencyRepository;
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
pub struct CreateCurrencyRequest {
    #[validate(length(min = 1, message = "Code is required"))]
    pub code: String,
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
    pub symbol: Option<String>,
    #[serde(default = "default_exchange_rate")]
    pub exchange_rate: f64,
    #[serde(default)]
    pub is_base: bool,
}

fn default_exchange_rate() -> f64 {
    1.0
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateCurrencyRequest {
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
    pub symbol: Option<String>,
    #[serde(default = "default_exchange_rate")]
    pub exchange_rate: f64,
    #[serde(default = "default_true")]
    pub is_active: bool,
}

fn default_true() -> bool {
    true
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/currencies",
    tag = "currencies",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<Currency>>)))
)]
pub async fn list_currencies(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<Currency>>>, AppError> {
    let currencies = CurrencyRepository::list(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(currencies)))
}

#[utoipa::path(
    get,
    path = "/api/currencies/{id}",
    tag = "currencies",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Currency ID")),
    responses((status = 200, body = inline(ApiResponse<Currency>)))
)]
pub async fn get_currency(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Currency>>, AppError> {
    let currency = CurrencyRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Currency not found".into()))?;

    if currency.company_id != ctx.company_id {
        return Err(AppError::NotFound("Currency not found".into()));
    }

    Ok(Json(ApiResponse::new(currency)))
}

#[utoipa::path(
    post,
    path = "/api/currencies",
    tag = "currencies",
    security(("bearer" = [])),
    request_body = CreateCurrencyRequest,
    responses((status = 200, body = inline(ApiResponse<Currency>)))
)]
pub async fn create_currency(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateCurrencyRequest>,
) -> Result<Json<ApiResponse<Currency>>, AppError> {
    let symbol = body.symbol.as_deref().unwrap_or("");

    let currency = CurrencyRepository::create(
        &state.pool,
        ctx.company_id,
        &body.code,
        &body.name,
        symbol,
        body.exchange_rate,
        body.is_base,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("currency", currency.id)
        .action("create")
        .after(&currency)
        .emit();

    Ok(Json(ApiResponse::new(currency)))
}

#[utoipa::path(
    put,
    path = "/api/currencies/{id}",
    tag = "currencies",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Currency ID")),
    request_body = UpdateCurrencyRequest,
    responses((status = 200, body = inline(ApiResponse<Currency>)))
)]
pub async fn update_currency(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdateCurrencyRequest>,
) -> Result<Json<ApiResponse<Currency>>, AppError> {
    let existing = CurrencyRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Currency not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Currency not found".into()));
    }

    let symbol = body.symbol.as_deref().unwrap_or(&existing.symbol);

    let currency = CurrencyRepository::update(
        &state.pool,
        id,
        &body.name,
        symbol,
        body.exchange_rate,
        body.is_active,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("currency", currency.id)
        .action("update")
        .before(&existing)
        .after(&currency)
        .emit();

    Ok(Json(ApiResponse::new(currency)))
}

#[utoipa::path(
    delete,
    path = "/api/currencies/{id}",
    tag = "currencies",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Currency ID")),
    responses((status = 200))
)]
pub async fn delete_currency(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = CurrencyRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Currency not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Currency not found".into()));
    }

    if existing.is_base {
        return Err(AppError::BadRequest(
            "Cannot delete the base currency".into(),
        ));
    }

    CurrencyRepository::delete(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("currency", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Currency deleted successfully"
    }))))
}
