use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{ApiResponse, PaginatedResponse, PaginationParams};
use heyloaf_dal::models::shift::Shift;
use heyloaf_dal::repositories::shift::ShiftRepository;
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
pub struct ShiftListParams {
    pub status: Option<String>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct OpenShiftRequest {
    pub terminal_id: Option<Uuid>,
    #[serde(default)]
    pub opening_balance: f64,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CloseShiftRequest {
    pub closing_balance: f64,
    pub expected_balance: Option<f64>,
    pub notes: Option<String>,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/shifts",
    tag = "shifts",
    security(("bearer" = [])),
    params(
        ("status" = Option<String>, Query, description = "Filter by status"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<Shift>)))
)]
pub async fn list_shifts(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<ShiftListParams>,
) -> Result<Json<PaginatedResponse<Shift>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (shifts, total) = ShiftRepository::list(
        &state.pool,
        ctx.company_id,
        params.status.as_deref(),
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(shifts, total, page, per_page)))
}

#[utoipa::path(
    get,
    path = "/api/shifts/current",
    tag = "shifts",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Option<Shift>>)))
)]
pub async fn get_current_shift(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
) -> Result<Json<ApiResponse<Option<Shift>>>, AppError> {
    let shift = ShiftRepository::find_open(&state.pool, ctx.company_id, auth.user_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(shift)))
}

#[utoipa::path(
    post,
    path = "/api/shifts/open",
    tag = "shifts",
    security(("bearer" = [])),
    request_body = OpenShiftRequest,
    responses((status = 200, body = inline(ApiResponse<Shift>)))
)]
pub async fn open_shift(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<OpenShiftRequest>,
) -> Result<Json<ApiResponse<Shift>>, AppError> {
    // Check if user already has an open shift
    let existing = ShiftRepository::find_open(&state.pool, ctx.company_id, auth.user_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    if existing.is_some() {
        return Err(AppError::BadRequest(
            "You already have an open shift".into(),
        ));
    }

    let shift = ShiftRepository::open(
        &state.pool,
        ctx.company_id,
        auth.user_id,
        body.terminal_id,
        body.opening_balance,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("shift", shift.id)
        .action("open")
        .after(&shift)
        .emit();

    Ok(Json(ApiResponse::new(shift)))
}

#[utoipa::path(
    post,
    path = "/api/shifts/{id}/close",
    tag = "shifts",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Shift ID")),
    request_body = CloseShiftRequest,
    responses((status = 200, body = inline(ApiResponse<Shift>)))
)]
pub async fn close_shift(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<CloseShiftRequest>,
) -> Result<Json<ApiResponse<Shift>>, AppError> {
    let existing = ShiftRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Shift not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Shift not found".into()));
    }

    if existing.status != "open" {
        return Err(AppError::BadRequest("Shift is already closed".into()));
    }

    let shift = ShiftRepository::close(
        &state.pool,
        id,
        body.closing_balance,
        body.expected_balance,
        body.notes.as_deref(),
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("shift", shift.id)
        .action("close")
        .before(&existing)
        .after(&shift)
        .emit();

    Ok(Json(ApiResponse::new(shift)))
}
