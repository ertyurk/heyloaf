use axum::extract::{Path, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use heyloaf_dal::models::category::Category;
use heyloaf_dal::repositories::category::CategoryRepository;
use heyloaf_services::audit_service::AuditBuilder;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::extractors::validated::ValidatedJson;
use crate::middleware::auth::AuthUser;
use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateCategoryRequest {
    #[validate(length(min = 1, message = "Category name is required"))]
    pub name: String,
    pub description: Option<String>,
    pub parent_id: Option<Uuid>,
    #[serde(default)]
    pub display_order: i32,
    #[serde(default = "default_true")]
    pub pos_visible: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateCategoryRequest {
    #[validate(length(min = 1, message = "Category name is required"))]
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub display_order: i32,
    #[serde(default = "default_true")]
    pub pos_visible: bool,
}

#[utoipa::path(
    get,
    path = "/api/categories",
    tag = "categories",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<Category>>)))
)]
pub async fn list_categories(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<Category>>>, AppError> {
    let categories = CategoryRepository::list(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(categories)))
}

#[utoipa::path(
    get,
    path = "/api/categories/{id}",
    tag = "categories",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Category ID")),
    responses((status = 200, body = inline(ApiResponse<Category>)))
)]
pub async fn get_category(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Category>>, AppError> {
    let category = CategoryRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Category not found".into()))?;

    if category.company_id != ctx.company_id {
        return Err(AppError::NotFound("Category not found".into()));
    }

    Ok(Json(ApiResponse::new(category)))
}

#[utoipa::path(
    post,
    path = "/api/categories",
    tag = "categories",
    security(("bearer" = [])),
    request_body = CreateCategoryRequest,
    responses((status = 200, body = inline(ApiResponse<Category>)))
)]
pub async fn create_category(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateCategoryRequest>,
) -> Result<Json<ApiResponse<Category>>, AppError> {
    let category = CategoryRepository::create(
        &state.pool,
        ctx.company_id,
        &body.name,
        body.description.as_deref(),
        body.parent_id,
        body.display_order,
        body.pos_visible,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("category", category.id)
        .action("create")
        .after(&category)
        .emit();

    Ok(Json(ApiResponse::new(category)))
}

#[utoipa::path(
    put,
    path = "/api/categories/{id}",
    tag = "categories",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Category ID")),
    request_body = UpdateCategoryRequest,
    responses((status = 200, body = inline(ApiResponse<Category>)))
)]
pub async fn update_category(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdateCategoryRequest>,
) -> Result<Json<ApiResponse<Category>>, AppError> {
    let existing = CategoryRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Category not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Category not found".into()));
    }

    let category = CategoryRepository::update(
        &state.pool,
        id,
        &body.name,
        body.description.as_deref(),
        body.display_order,
        body.pos_visible,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("category", category.id)
        .action("update")
        .before(&existing)
        .after(&category)
        .emit();

    Ok(Json(ApiResponse::new(category)))
}

#[utoipa::path(
    delete,
    path = "/api/categories/{id}",
    tag = "categories",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Category ID")),
    responses((status = 200))
)]
pub async fn delete_category(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = CategoryRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Category not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Category not found".into()));
    }

    let has_children = CategoryRepository::has_children(&state.pool, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    if has_children {
        return Err(AppError::Conflict(
            "Cannot delete category with child categories".into(),
        ));
    }

    let has_products = CategoryRepository::has_products(&state.pool, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    if has_products {
        return Err(AppError::Conflict(
            "Cannot delete category with assigned products".into(),
        ));
    }

    CategoryRepository::delete(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("category", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Category deleted successfully"
    }))))
}
