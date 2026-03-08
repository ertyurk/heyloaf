use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{ApiResponse, PaginatedResponse, PaginationParams};
use heyloaf_dal::models::notification::Notification;
use heyloaf_dal::repositories::notification::NotificationRepository;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::middleware::auth::AuthUser;
use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

// --- Request/Response types ---

#[derive(Debug, Deserialize)]
pub struct NotificationListParams {
    pub is_read: Option<bool>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct UnreadCountResponse {
    pub count: i64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MarkAllReadResponse {
    pub affected: u64,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/notifications",
    tag = "notifications",
    security(("bearer" = [])),
    params(
        ("is_read" = Option<bool>, Query, description = "Filter by read status"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<Notification>)))
)]
pub async fn list_notifications(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Query(params): Query<NotificationListParams>,
) -> Result<Json<PaginatedResponse<Notification>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (notifications, total) = NotificationRepository::list(
        &state.pool,
        ctx.company_id,
        Some(auth.user_id),
        params.is_read,
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(
        notifications,
        total,
        page,
        per_page,
    )))
}

#[utoipa::path(
    get,
    path = "/api/notifications/unread-count",
    tag = "notifications",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<UnreadCountResponse>)))
)]
pub async fn unread_count(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
) -> Result<Json<ApiResponse<UnreadCountResponse>>, AppError> {
    let count = NotificationRepository::count_unread(&state.pool, ctx.company_id, auth.user_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(UnreadCountResponse { count })))
}

#[utoipa::path(
    post,
    path = "/api/notifications/{id}/read",
    tag = "notifications",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Notification ID")),
    responses((status = 200))
)]
pub async fn mark_read(
    State(state): State<AppState>,
    Extension(_ctx): Extension<CompanyContext>,
    Extension(_auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    NotificationRepository::mark_read(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Notification marked as read"
    }))))
}

#[utoipa::path(
    post,
    path = "/api/notifications/read-all",
    tag = "notifications",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<MarkAllReadResponse>)))
)]
pub async fn mark_all_read(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
) -> Result<Json<ApiResponse<MarkAllReadResponse>>, AppError> {
    let affected = NotificationRepository::mark_all_read(&state.pool, ctx.company_id, auth.user_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(MarkAllReadResponse { affected })))
}
