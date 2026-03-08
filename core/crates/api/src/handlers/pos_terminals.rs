use axum::extract::{Path, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use heyloaf_dal::models::pos_terminal::PosTerminal;
use heyloaf_dal::repositories::pos_terminal::PosTerminalRepository;
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
pub struct CreatePosTerminalRequest {
    #[validate(length(min = 1, message = "Terminal name is required"))]
    pub name: String,
    pub price_list_id: Option<Uuid>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdatePosTerminalRequest {
    #[validate(length(min = 1, message = "Terminal name is required"))]
    pub name: String,
    pub price_list_id: Option<Uuid>,
    #[serde(default = "default_true")]
    pub is_active: bool,
}

fn default_true() -> bool {
    true
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/pos-terminals",
    tag = "pos_terminals",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<PosTerminal>>)))
)]
pub async fn list_pos_terminals(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<PosTerminal>>>, AppError> {
    let terminals = PosTerminalRepository::list(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(terminals)))
}

#[utoipa::path(
    post,
    path = "/api/pos-terminals",
    tag = "pos_terminals",
    security(("bearer" = [])),
    request_body = CreatePosTerminalRequest,
    responses((status = 200, body = inline(ApiResponse<PosTerminal>)))
)]
pub async fn create_pos_terminal(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreatePosTerminalRequest>,
) -> Result<Json<ApiResponse<PosTerminal>>, AppError> {
    let terminal =
        PosTerminalRepository::create(&state.pool, ctx.company_id, &body.name, body.price_list_id)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("pos_terminal", terminal.id)
        .action("create")
        .after(&terminal)
        .emit();

    Ok(Json(ApiResponse::new(terminal)))
}

#[utoipa::path(
    put,
    path = "/api/pos-terminals/{id}",
    tag = "pos_terminals",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "POS terminal ID")),
    request_body = UpdatePosTerminalRequest,
    responses((status = 200, body = inline(ApiResponse<PosTerminal>)))
)]
pub async fn update_pos_terminal(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdatePosTerminalRequest>,
) -> Result<Json<ApiResponse<PosTerminal>>, AppError> {
    let existing = PosTerminalRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("POS terminal not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("POS terminal not found".into()));
    }

    let terminal = PosTerminalRepository::update(
        &state.pool,
        id,
        &body.name,
        body.price_list_id,
        body.is_active,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("pos_terminal", terminal.id)
        .action("update")
        .before(&existing)
        .after(&terminal)
        .emit();

    Ok(Json(ApiResponse::new(terminal)))
}

#[utoipa::path(
    delete,
    path = "/api/pos-terminals/{id}",
    tag = "pos_terminals",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "POS terminal ID")),
    responses((status = 200))
)]
pub async fn delete_pos_terminal(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = PosTerminalRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("POS terminal not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("POS terminal not found".into()));
    }

    PosTerminalRepository::delete(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("pos_terminal", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "POS terminal deleted successfully"
    }))))
}
