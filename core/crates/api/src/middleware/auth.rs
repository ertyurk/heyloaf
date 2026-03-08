use axum::{
    extract::State,
    http::{Request, header},
    middleware::Next,
    response::Response,
};
use heyloaf_common::errors::AppError;
use jsonwebtoken::{Algorithm, DecodingKey, Validation, decode};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::state::AppState;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: Uuid,
    pub company_id: Option<Uuid>,
    pub role: Option<String>,
    pub exp: usize,
    pub iat: usize,
}

#[derive(Debug, Clone)]
pub struct AuthUser {
    pub user_id: Uuid,
    pub company_id: Option<Uuid>,
    pub role: Option<String>,
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let auth_header = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(|| AppError::Unauthorized("Missing authorization header".into()))?;

    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or_else(|| AppError::Unauthorized("Invalid authorization header format".into()))?;

    let validation = Validation::new(Algorithm::HS256);
    let key = DecodingKey::from_secret(state.config.jwt_secret.as_bytes());

    let token_data = decode::<Claims>(token, &key, &validation).map_err(|e| {
        tracing::debug!(error = %e, "JWT validation failed");
        AppError::Unauthorized("Invalid or expired token".into())
    })?;

    let auth_user = AuthUser {
        user_id: token_data.claims.sub,
        company_id: token_data.claims.company_id,
        role: token_data.claims.role,
    };

    request.extensions_mut().insert(auth_user);
    Ok(next.run(request).await)
}
