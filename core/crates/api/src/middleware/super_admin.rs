use axum::{http::Request, middleware::Next, response::Response};
use heyloaf_common::errors::AppError;
use heyloaf_dal::repositories::user::UserRepository;
use sqlx::PgPool;

use crate::middleware::auth::AuthUser;

/// Check that the authenticated user has `is_super_admin = true`.
///
/// This guard queries the database rather than relying solely on the JWT claim,
/// ensuring that a revoked super-admin loses access immediately.
pub async fn super_admin_guard(
    pool: &PgPool,
    auth_user: &AuthUser,
) -> Result<(), AppError> {
    let user = UserRepository::find_by_id(pool, auth_user.user_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::Unauthorized("User not found".into()))?;

    if !user.is_super_admin {
        return Err(AppError::Forbidden(
            "Super admin privileges required".into(),
        ));
    }

    Ok(())
}

/// Axum middleware that rejects non-super-admin users.
pub async fn super_admin_middleware(
    axum::extract::State(state): axum::extract::State<crate::state::AppState>,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let auth_user = request
        .extensions()
        .get::<AuthUser>()
        .ok_or_else(|| AppError::Unauthorized("Authentication required".into()))?
        .clone();

    super_admin_guard(&state.pool, &auth_user).await?;

    Ok(next.run(request).await)
}
