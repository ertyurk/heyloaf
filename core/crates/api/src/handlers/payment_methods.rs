use axum::extract::{Path, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use heyloaf_dal::models::payment_method::PaymentMethod;
use heyloaf_dal::repositories::payment_method::PaymentMethodRepository;
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
pub struct CreatePaymentMethodRequest {
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
    #[serde(default)]
    pub is_default: bool,
    #[serde(default)]
    pub display_order: i32,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdatePaymentMethodRequest {
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
    #[serde(default = "default_true")]
    pub is_active: bool,
    #[serde(default)]
    pub display_order: i32,
}

fn default_true() -> bool {
    true
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/payment-methods",
    tag = "payment_methods",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<PaymentMethod>>)))
)]
pub async fn list_payment_methods(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<PaymentMethod>>>, AppError> {
    let methods = PaymentMethodRepository::list(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(methods)))
}

#[utoipa::path(
    post,
    path = "/api/payment-methods",
    tag = "payment_methods",
    security(("bearer" = [])),
    request_body = CreatePaymentMethodRequest,
    responses((status = 200, body = inline(ApiResponse<PaymentMethod>)))
)]
pub async fn create_payment_method(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreatePaymentMethodRequest>,
) -> Result<Json<ApiResponse<PaymentMethod>>, AppError> {
    let method = PaymentMethodRepository::create(
        &state.pool,
        ctx.company_id,
        &body.name,
        body.is_default,
        body.display_order,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("payment_method", method.id)
        .action("create")
        .after(&method)
        .emit();

    Ok(Json(ApiResponse::new(method)))
}

#[utoipa::path(
    put,
    path = "/api/payment-methods/{id}",
    tag = "payment_methods",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Payment method ID")),
    request_body = UpdatePaymentMethodRequest,
    responses((status = 200, body = inline(ApiResponse<PaymentMethod>)))
)]
pub async fn update_payment_method(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdatePaymentMethodRequest>,
) -> Result<Json<ApiResponse<PaymentMethod>>, AppError> {
    let existing = PaymentMethodRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Payment method not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Payment method not found".into()));
    }

    let method = PaymentMethodRepository::update(
        &state.pool,
        id,
        &body.name,
        body.is_active,
        body.display_order,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("payment_method", method.id)
        .action("update")
        .before(&existing)
        .after(&method)
        .emit();

    Ok(Json(ApiResponse::new(method)))
}

#[utoipa::path(
    post,
    path = "/api/payment-methods/{id}/default",
    tag = "payment_methods",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Payment method ID")),
    responses((status = 200, body = inline(ApiResponse<PaymentMethod>)))
)]
pub async fn set_default_payment_method(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<PaymentMethod>>, AppError> {
    let existing = PaymentMethodRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Payment method not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Payment method not found".into()));
    }

    let method = PaymentMethodRepository::set_default(&state.pool, ctx.company_id, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("payment_method", method.id)
        .action("set_default")
        .before(&existing)
        .after(&method)
        .emit();

    Ok(Json(ApiResponse::new(method)))
}

#[utoipa::path(
    delete,
    path = "/api/payment-methods/{id}",
    tag = "payment_methods",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Payment method ID")),
    responses((status = 200))
)]
pub async fn delete_payment_method(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = PaymentMethodRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Payment method not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Payment method not found".into()));
    }

    PaymentMethodRepository::delete(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("payment_method", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Payment method deleted successfully"
    }))))
}
