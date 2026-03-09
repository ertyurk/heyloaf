use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use chrono::{DateTime, Utc};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{ApiResponse, PaginatedResponse, PaginationParams};
use heyloaf_dal::models::shift::Shift;
use heyloaf_dal::repositories::shift::{PaymentMethodSummary, ShiftRepository};
use heyloaf_dal::repositories::user::UserRepository;
use heyloaf_services::audit_service::AuditBuilder;
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
    .map_err(|e| {
        // Catch the unique constraint violation from idx_one_open_shift_per_user
        let msg = e.to_string();
        if msg.contains("idx_one_open_shift_per_user") || msg.contains("unique") {
            AppError::Conflict("You already have an open shift".into())
        } else {
            AppError::Database(msg)
        }
    })?;

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

// --- Z-Report ---

#[derive(Debug, Serialize, ToSchema)]
pub struct ZReport {
    pub shift_id: Uuid,
    pub cashier_name: String,
    pub opened_at: DateTime<Utc>,
    pub closed_at: Option<DateTime<Utc>>,
    pub opening_balance: f64,
    pub closing_balance: Option<f64>,
    pub total_sales: f64,
    pub total_orders: i64,
    pub total_items_sold: i64,
    pub payment_method_breakdown: Vec<PaymentMethodSummary>,
    pub expected_cash: f64,
    pub actual_cash: Option<f64>,
    pub discrepancy: Option<f64>,
    pub voided_orders: i64,
    pub returned_orders: i64,
}

#[utoipa::path(
    get,
    path = "/api/shifts/{id}/z-report",
    tag = "shifts",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Shift ID")),
    responses((status = 200, body = inline(ApiResponse<ZReport>)))
)]
pub async fn get_z_report(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<ZReport>>, AppError> {
    let shift = ShiftRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Shift not found".into()))?;

    if shift.company_id != ctx.company_id {
        return Err(AppError::NotFound("Shift not found".into()));
    }

    let cashier = UserRepository::find_by_id(&state.pool, shift.cashier_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;
    let cashier_name = cashier.map_or_else(|| "Unknown".to_owned(), |u| u.name);

    let cash_method_id =
        ShiftRepository::find_cash_payment_method_id(&state.pool, ctx.company_id)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    let stats = ShiftRepository::order_stats(&state.pool, id, cash_method_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let breakdown = ShiftRepository::payment_method_breakdown(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let expected_cash = shift.opening_balance + stats.cash_sales;
    let actual_cash = shift.closing_balance;
    let discrepancy = actual_cash.map(|actual| actual - expected_cash);

    let report = ZReport {
        shift_id: shift.id,
        cashier_name,
        opened_at: shift.opened_at,
        closed_at: shift.closed_at,
        opening_balance: shift.opening_balance,
        closing_balance: shift.closing_balance,
        total_sales: stats.total_sales,
        total_orders: stats.total_orders,
        total_items_sold: stats.total_items_sold,
        payment_method_breakdown: breakdown,
        expected_cash,
        actual_cash,
        discrepancy,
        voided_orders: stats.voided_orders,
        returned_orders: stats.returned_orders,
    };

    Ok(Json(ApiResponse::new(report)))
}
