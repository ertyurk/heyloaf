use axum::extract::{Path, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use heyloaf_dal::repositories::product::ProductRepository;
use heyloaf_services::audit_service::AuditBuilder;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::middleware::auth::AuthUser;
use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

// --- Request / Response types ---

#[derive(Debug, Deserialize, ToSchema)]
pub struct UpdateRecipeRequest {
    pub batch_size: f64,
    pub materials: Vec<RecipeMaterial>,
    pub variants: Option<Vec<RecipeVariant>>,
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct RecipeMaterial {
    pub product_id: Uuid,
    pub quantity: f64,
    pub unit: String,
}

#[derive(Debug, Clone, Deserialize, Serialize, ToSchema)]
pub struct RecipeVariant {
    pub name: String,
    pub material_overrides: Vec<RecipeMaterial>,
    pub price_modifier: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct RecipeCostResponse {
    pub total_cost: f64,
    pub unit_cost: f64,
    pub batch_size: f64,
    pub materials: Vec<MaterialCostLine>,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct MaterialCostLine {
    pub product_id: Uuid,
    pub product_name: String,
    pub quantity: f64,
    pub unit: String,
    pub unit_price: Option<f64>,
    pub line_cost: Option<f64>,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/products/{id}/recipe",
    tag = "recipes",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Product ID")),
    responses((status = 200, body = inline(ApiResponse<serde_json::Value>)))
)]
pub async fn get_recipe(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let product = ProductRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Product not found".into()))?;

    if product.company_id != ctx.company_id {
        return Err(AppError::NotFound("Product not found".into()));
    }

    let recipe = product.recipe.unwrap_or_else(|| serde_json::json!({}));

    Ok(Json(ApiResponse::new(recipe)))
}

#[utoipa::path(
    put,
    path = "/api/products/{id}/recipe",
    tag = "recipes",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Product ID")),
    request_body = UpdateRecipeRequest,
    responses((status = 200, body = inline(ApiResponse<serde_json::Value>)))
)]
pub async fn update_recipe(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateRecipeRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = ProductRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Product not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Product not found".into()));
    }

    let product_type = existing.product_type.as_str();
    if product_type != "semi" && product_type != "finished" {
        return Err(AppError::BadRequest(
            "Only SEMI and FINISHED products can have recipes".into(),
        ));
    }

    if body.batch_size <= 0.0 {
        return Err(AppError::Validation {
            field: "batch_size".into(),
            message: "Batch size must be greater than zero".into(),
        });
    }

    let recipe_value = serde_json::json!({
        "batch_size": body.batch_size,
        "materials": body.materials,
        "variants": body.variants,
        "notes": body.notes,
    });

    let product = ProductRepository::update_recipe(&state.pool, id, &recipe_value)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("product", product.id)
        .action("update_recipe")
        .before(&existing.recipe)
        .after(&product.recipe)
        .emit();

    let recipe = product.recipe.unwrap_or_else(|| serde_json::json!({}));

    Ok(Json(ApiResponse::new(recipe)))
}

#[utoipa::path(
    get,
    path = "/api/products/{id}/recipe/cost",
    tag = "recipes",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Product ID")),
    responses((status = 200, body = inline(ApiResponse<RecipeCostResponse>)))
)]
pub async fn get_recipe_cost(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<RecipeCostResponse>>, AppError> {
    let product = ProductRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Product not found".into()))?;

    if product.company_id != ctx.company_id {
        return Err(AppError::NotFound("Product not found".into()));
    }

    let recipe = product
        .recipe
        .ok_or_else(|| AppError::NotFound("Product has no recipe".into()))?;

    let batch_size = recipe
        .get("batch_size")
        .and_then(serde_json::Value::as_f64)
        .unwrap_or(1.0);

    let materials: Vec<RecipeMaterial> = recipe
        .get("materials")
        .and_then(|v| serde_json::from_value(v.clone()).ok())
        .unwrap_or_default();

    let mut cost_lines = Vec::with_capacity(materials.len());
    let mut total_cost = 0.0;

    for mat in &materials {
        let mat_product = ProductRepository::find_by_id(&state.pool, mat.product_id)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        let (product_name, unit_price) = match mat_product {
            Some(ref p) => {
                let price = p.last_purchase_price.or(p.calculated_cost);
                (p.name.clone(), price)
            }
            None => (String::from("(deleted)"), None),
        };

        let line_cost = unit_price.map(|p| p * mat.quantity);
        if let Some(lc) = line_cost {
            total_cost += lc;
        }

        cost_lines.push(MaterialCostLine {
            product_id: mat.product_id,
            product_name,
            quantity: mat.quantity,
            unit: mat.unit.clone(),
            unit_price,
            line_cost,
        });
    }

    let unit_cost = if batch_size > 0.0 {
        total_cost / batch_size
    } else {
        0.0
    };

    Ok(Json(ApiResponse::new(RecipeCostResponse {
        total_cost,
        unit_cost,
        batch_size,
        materials: cost_lines,
    })))
}
