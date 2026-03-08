use axum::extract::{Query, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{PaginatedResponse, PaginationParams};
use heyloaf_dal::models::audit::AuditLog;
use heyloaf_dal::repositories::audit::AuditRepository;
use serde::Deserialize;
use uuid::Uuid;

use crate::middleware::auth::AuthUser;
use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

// --- Request types ---

#[derive(Debug, Deserialize)]
pub struct AuditListParams {
    pub entity_type: Option<String>,
    pub entity_id: Option<Uuid>,
    pub action: Option<String>,
    pub user_id: Option<Uuid>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/audit-logs",
    tag = "audit",
    security(("bearer" = [])),
    params(
        ("entity_type" = Option<String>, Query,
            description = "Filter by entity type"),
        ("entity_id" = Option<Uuid>, Query,
            description = "Filter by entity ID"),
        ("action" = Option<String>, Query,
            description = "Filter by action"),
        ("user_id" = Option<Uuid>, Query,
            description = "Filter by user ID"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query,
            description = "Items per page"),
    ),
    responses(
        (status = 200, body = inline(PaginatedResponse<AuditLog>))
    )
)]
pub async fn list_audit_logs(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(_auth): Extension<AuthUser>,
    Query(params): Query<AuditListParams>,
) -> Result<Json<PaginatedResponse<AuditLog>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (logs, total) = AuditRepository::list(
        &state.pool,
        ctx.company_id,
        params.entity_type.as_deref(),
        params.entity_id,
        params.action.as_deref(),
        params.user_id,
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(logs, total, page, per_page)))
}
