use axum::extract::State;
use axum::{Extension, Json};
use chrono::{DateTime, Utc};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::extractors::validated::ValidatedJson;
use crate::middleware::auth::AuthUser;
use crate::state::AppState;

// --- Response types ---

#[derive(Debug, Serialize, FromRow, ToSchema)]
pub struct CompanyWithUserCount {
    pub id: Uuid,
    pub name: String,
    pub is_active: bool,
    pub user_count: i64,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize, FromRow, ToSchema)]
pub struct SuperAdminUser {
    pub id: Uuid,
    pub name: String,
    pub email: String,
    pub is_super_admin: bool,
    pub company_count: i64,
    pub created_at: DateTime<Utc>,
}

// --- Request types ---

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateCompanyRequest {
    #[validate(length(min = 1, message = "Company name is required"))]
    pub name: String,
    pub settings: Option<serde_json::Value>,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/super-admin/companies",
    tag = "super-admin",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<CompanyWithUserCount>>)))
)]
pub async fn list_companies(
    State(state): State<AppState>,
    Extension(_auth): Extension<AuthUser>,
) -> Result<Json<ApiResponse<Vec<CompanyWithUserCount>>>, AppError> {
    let companies = sqlx::query_as::<_, CompanyWithUserCount>(
        r"SELECT c.id, c.name,
            CASE WHEN c.settings->>'is_active' = 'false' THEN false ELSE true END AS is_active,
            COUNT(uc.id) AS user_count,
            c.created_at
        FROM companies c
        LEFT JOIN user_companies uc ON uc.company_id = c.id AND uc.is_active = true
        GROUP BY c.id
        ORDER BY c.created_at DESC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(companies)))
}

#[utoipa::path(
    post,
    path = "/api/super-admin/companies",
    tag = "super-admin",
    security(("bearer" = [])),
    request_body = CreateCompanyRequest,
    responses((status = 200, body = inline(ApiResponse<CompanyWithUserCount>)))
)]
pub async fn create_company(
    State(state): State<AppState>,
    Extension(_auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateCompanyRequest>,
) -> Result<Json<ApiResponse<CompanyWithUserCount>>, AppError> {
    let settings = body
        .settings
        .unwrap_or_else(|| serde_json::json!({}));

    let company = sqlx::query_as::<_, CompanyWithUserCount>(
        r"WITH new_company AS (
            INSERT INTO companies (name, settings)
            VALUES ($1, $2)
            RETURNING *
        )
        SELECT nc.id, nc.name,
            true AS is_active,
            0::bigint AS user_count,
            nc.created_at
        FROM new_company nc",
    )
    .bind(&body.name)
    .bind(&settings)
    .fetch_one(&state.pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(company)))
}

#[utoipa::path(
    put,
    path = "/api/super-admin/companies/{id}/deactivate",
    tag = "super-admin",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Company ID")),
    responses((status = 200, body = inline(ApiResponse<serde_json::Value>)))
)]
pub async fn deactivate_company(
    State(state): State<AppState>,
    Extension(_auth): Extension<AuthUser>,
    axum::extract::Path(id): axum::extract::Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let result = sqlx::query(
        r"UPDATE companies
        SET settings = jsonb_set(COALESCE(settings, '{}'::jsonb), '{is_active}', 'false')
        WHERE id = $1",
    )
    .bind(id)
    .execute(&state.pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("Company not found".into()));
    }

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Company deactivated"
    }))))
}

#[utoipa::path(
    get,
    path = "/api/super-admin/users",
    tag = "super-admin",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<SuperAdminUser>>)))
)]
pub async fn list_all_users(
    State(state): State<AppState>,
    Extension(_auth): Extension<AuthUser>,
) -> Result<Json<ApiResponse<Vec<SuperAdminUser>>>, AppError> {
    let users = sqlx::query_as::<_, SuperAdminUser>(
        r"SELECT u.id, u.name, u.email, u.is_super_admin,
            COUNT(uc.id) AS company_count,
            u.created_at
        FROM users u
        LEFT JOIN user_companies uc ON uc.user_id = u.id AND uc.is_active = true
        GROUP BY u.id
        ORDER BY u.created_at DESC",
    )
    .fetch_all(&state.pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(users)))
}
