use axum::extract::{Path, State};
use axum::{Extension, Json};
use heyloaf_common::crypto::hash_password;
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use heyloaf_dal::models::user::{CompanyUser, UserCompany};
use heyloaf_dal::repositories::user::UserRepository;
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
pub struct CreateUserRequest {
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
    #[validate(email(message = "Valid email is required"))]
    pub email: String,
    #[validate(length(min = 8, message = "Password must be at least 8 characters"))]
    pub password: String,
    #[validate(length(min = 1, message = "Role is required"))]
    pub role: String,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateRoleRequest {
    #[validate(length(min = 1, message = "Role is required"))]
    pub role: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdatePermissionsRequest {
    pub permissions: serde_json::Value,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/users",
    tag = "users",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<CompanyUser>>)))
)]
pub async fn list_users(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<CompanyUser>>>, AppError> {
    let users = UserRepository::list_by_company(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(users)))
}

#[utoipa::path(
    get,
    path = "/api/users/{id}",
    tag = "users",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "User ID")),
    responses((status = 200, body = inline(ApiResponse<CompanyUser>)))
)]
pub async fn get_user(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<CompanyUser>>, AppError> {
    let user = UserRepository::find_by_user_and_company(&state.pool, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found in this company".into()))?;

    Ok(Json(ApiResponse::new(user)))
}

#[utoipa::path(
    post,
    path = "/api/users",
    tag = "users",
    security(("bearer" = [])),
    request_body = CreateUserRequest,
    responses((status = 200, body = inline(ApiResponse<CompanyUser>)))
)]
pub async fn create_user(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateUserRequest>,
) -> Result<Json<ApiResponse<CompanyUser>>, AppError> {
    // Check if user already exists by email
    let existing = UserRepository::find_by_email(&state.pool, &body.email)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let user = if let Some(existing_user) = existing {
        // Check if already in this company
        let uc = UserRepository::get_user_company(&state.pool, existing_user.id, ctx.company_id)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        if uc.is_some() {
            return Err(AppError::Conflict(
                "User is already a member of this company".into(),
            ));
        }

        existing_user
    } else {
        let password_hash = hash_password(&body.password)?;
        UserRepository::create(&state.pool, &body.name, &body.email, &password_hash, false)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
    };

    UserRepository::add_to_company(&state.pool, user.id, ctx.company_id, &body.role)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("user", user.id)
        .action("invite")
        .after(&user)
        .emit();

    // Return the CompanyUser view
    let company_user =
        UserRepository::find_by_user_and_company(&state.pool, user.id, ctx.company_id)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .ok_or_else(|| AppError::Database("Failed to retrieve created user".into()))?;

    Ok(Json(ApiResponse::new(company_user)))
}

#[utoipa::path(
    put,
    path = "/api/users/{id}/role",
    tag = "users",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "User ID")),
    request_body = UpdateRoleRequest,
    responses((status = 200, body = inline(ApiResponse<UserCompany>)))
)]
pub async fn update_user_role(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdateRoleRequest>,
) -> Result<Json<ApiResponse<UserCompany>>, AppError> {
    // Verify user belongs to this company
    let uc = UserRepository::get_user_company(&state.pool, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found in this company".into()))?;

    let updated = UserRepository::update_role(&state.pool, id, ctx.company_id, &body.role)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("user_company", uc.id)
        .action("update_role")
        .before(&uc)
        .after(&updated)
        .emit();

    Ok(Json(ApiResponse::new(updated)))
}

#[utoipa::path(
    put,
    path = "/api/users/{id}/permissions",
    tag = "users",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "User ID")),
    request_body = UpdatePermissionsRequest,
    responses((status = 200, body = inline(ApiResponse<UserCompany>)))
)]
pub async fn update_user_permissions(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdatePermissionsRequest>,
) -> Result<Json<ApiResponse<UserCompany>>, AppError> {
    // Verify user belongs to this company
    let uc = UserRepository::get_user_company(&state.pool, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found in this company".into()))?;

    let updated =
        UserRepository::update_permissions(&state.pool, id, ctx.company_id, &body.permissions)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("user_company", uc.id)
        .action("update_permissions")
        .before(&uc)
        .after(&updated)
        .emit();

    Ok(Json(ApiResponse::new(updated)))
}

#[utoipa::path(
    delete,
    path = "/api/users/{id}",
    tag = "users",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "User ID")),
    responses((status = 200))
)]
pub async fn remove_user(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    // Verify user belongs to this company
    let uc = UserRepository::get_user_company(&state.pool, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("User not found in this company".into()))?;

    UserRepository::deactivate_from_company(&state.pool, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("user_company", uc.id)
        .action("deactivate")
        .before(&uc)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "User removed from company"
    }))))
}
