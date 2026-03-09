use axum::extract::State;
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use heyloaf_dal::models::company::Company;
use heyloaf_dal::repositories::company::CompanyRepository;
use heyloaf_services::audit_service::AuditBuilder;
use serde::Deserialize;
use utoipa::ToSchema;
use validator::Validate;

use crate::extractors::validated::ValidatedJson;
use crate::middleware::auth::AuthUser;
use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateCompanyRequest {
    #[validate(length(min = 1, message = "Company name is required"))]
    pub name: String,
    pub tax_number: Option<String>,
    pub tax_office: Option<String>,
    pub address: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub website: Option<String>,
    pub logo_url: Option<String>,
    #[validate(length(min = 1, message = "Currency is required"))]
    pub default_currency: String,
    pub default_tax_rate: f64,
    #[validate(length(min = 1, message = "Language is required"))]
    pub default_language: String,
    #[validate(length(min = 1, message = "Timezone is required"))]
    pub timezone: String,
    pub settings: Option<serde_json::Value>,
}

#[utoipa::path(
    get,
    path = "/api/company",
    tag = "company",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Company>)))
)]
pub async fn get_company(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Company>>, AppError> {
    let company = CompanyRepository::find_by_id(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Company not found".into()))?;

    Ok(Json(ApiResponse::new(company)))
}

#[utoipa::path(
    put,
    path = "/api/company",
    tag = "company",
    security(("bearer" = [])),
    request_body = UpdateCompanyRequest,
    responses((status = 200, body = inline(ApiResponse<Company>)))
)]
pub async fn update_company(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<UpdateCompanyRequest>,
) -> Result<Json<ApiResponse<Company>>, AppError> {
    let existing = CompanyRepository::find_by_id(&state.pool, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Company not found".into()))?;

    let settings = if let Some(ref incoming) = body.settings {
        let mut merged = existing.settings.clone();
        if let (Some(base), Some(patch)) = (merged.as_object_mut(), incoming.as_object()) {
            for (k, v) in patch {
                if v.is_null() {
                    // Null values mean "delete this key"
                    base.remove(k);
                } else {
                    base.insert(k.clone(), v.clone());
                }
            }
        }
        merged
    } else {
        existing.settings.clone()
    };

    let company = CompanyRepository::update(
        &state.pool,
        ctx.company_id,
        &body.name,
        body.tax_number.as_deref(),
        body.tax_office.as_deref(),
        body.address.as_deref(),
        body.phone.as_deref(),
        body.email.as_deref(),
        body.website.as_deref(),
        body.logo_url.as_deref(),
        &body.default_currency,
        body.default_tax_rate,
        &body.default_language,
        &body.timezone,
        &settings,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("company", ctx.company_id)
        .action("update")
        .before(&existing)
        .after(&company)
        .emit();

    Ok(Json(ApiResponse::new(company)))
}
