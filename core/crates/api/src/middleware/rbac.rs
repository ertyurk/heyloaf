use axum::{http::Request, middleware::Next, response::Response};
use heyloaf_common::errors::AppError;

use crate::middleware::auth::AuthUser;

pub async fn admin_only(
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let auth_user = request
        .extensions()
        .get::<AuthUser>()
        .ok_or_else(|| AppError::Unauthorized("Authentication required".into()))?
        .clone();

    match auth_user.role.as_deref() {
        Some("admin") => Ok(next.run(request).await),
        _ => Err(AppError::Forbidden("Admin access required".into())),
    }
}

pub async fn manager_or_above(
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let auth_user = request
        .extensions()
        .get::<AuthUser>()
        .ok_or_else(|| AppError::Unauthorized("Authentication required".into()))?
        .clone();

    match auth_user.role.as_deref() {
        Some("admin" | "manager") => Ok(next.run(request).await),
        _ => Err(AppError::Forbidden("Manager access required".into())),
    }
}
