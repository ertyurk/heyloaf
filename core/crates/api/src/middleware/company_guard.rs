use axum::{extract::State, http::Request, middleware::Next, response::Response};
use heyloaf_common::errors::AppError;
use uuid::Uuid;

use crate::middleware::auth::AuthUser;
use crate::state::AppState;

#[derive(Debug, Clone)]
pub struct CompanyContext {
    pub company_id: Uuid,
}

pub async fn company_guard_middleware(
    State(_state): State<AppState>,
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

    let mut request = request;
    request
        .extensions_mut()
        .insert(CompanyContext { company_id });

    Ok(next.run(request).await)
}
