use axum::{extract::State, http::Request, middleware::Next, response::Response};
use heyloaf_common::errors::AppError;
use heyloaf_dal::repositories::user::UserRepository;
use uuid::Uuid;

use crate::middleware::auth::AuthUser;
use crate::state::AppState;

#[derive(Debug, Clone)]
pub struct CompanyContext {
    pub company_id: Uuid,
    /// Raw permissions JSON from `user_companies.permissions`.
    pub permissions: serde_json::Value,
}

pub async fn company_guard_middleware(
    State(state): State<AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let auth_user = request
        .extensions()
        .get::<AuthUser>()
        .ok_or_else(|| AppError::Unauthorized("Authentication required".into()))?
        .clone();

    let company_id = auth_user
        .company_id
        .ok_or_else(|| AppError::BadRequest("No active company selected".into()))?;

    // Fetch user_company row so we get the permissions JSONB.
    let uc = UserRepository::get_user_company(&state.pool, auth_user.user_id, company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::Forbidden("User does not belong to this company".into()))?;

    let mut request = request;
    request
        .extensions_mut()
        .insert(CompanyContext {
            company_id,
            permissions: uc.permissions,
        });

    Ok(next.run(request).await)
}
