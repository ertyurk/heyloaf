use argon2::{Argon2, PasswordHash, PasswordVerifier};
use axum::extract::State;
use axum::http::header::SET_COOKIE;
use axum::http::{HeaderMap, StatusCode};
use axum::{Extension, Json};
use heyloaf_common::crypto::hash_password;
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use heyloaf_dal::repositories::company::CompanyRepository;
use heyloaf_dal::repositories::user::UserRepository;
use jsonwebtoken::EncodingKey;
use serde::{Deserialize, Serialize};
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::extractors::validated::ValidatedJson;
use crate::middleware::auth::{AuthUser, Claims};
use crate::state::AppState;

// --- Request / Response types ---

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct LoginRequest {
    #[validate(email(message = "Invalid email address"))]
    pub email: String,
    #[validate(length(min = 1, max = 1024, message = "Password is required"))]
    pub password: String,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct RegisterRequest {
    #[validate(length(min = 1, message = "Name is required"))]
    pub name: String,
    #[validate(email(message = "Invalid email address"))]
    pub email: String,
    #[validate(length(
        min = 8,
        max = 1024,
        message = "Password must be between 8 and 1024 characters"
    ))]
    pub password: String,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct RefreshRequest {
    pub refresh_token: Option<String>,
}

#[derive(Debug, Deserialize, ToSchema)]
pub struct SwitchCompanyRequest {
    pub company_id: Uuid,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct TokenResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: u64,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct LoginResponse {
    pub access_token: String,
    pub refresh_token: String,
    pub token_type: String,
    pub expires_in: u64,
    pub user: LoginUser,
    pub company: Option<LoginCompany>,
    pub role: Option<String>,
    pub permissions: serde_json::Value,
    pub preferred_language: Option<String>,
    pub is_super_admin: bool,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct LoginUser {
    pub id: Uuid,
    pub name: String,
    pub email: String,
}

#[derive(Debug, Serialize, ToSchema)]
pub struct LoginCompany {
    pub id: Uuid,
    pub name: String,
}

// --- Helpers ---

fn verify_password(password: &str, hash: &str) -> Result<bool, AppError> {
    let parsed_hash = PasswordHash::new(hash)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Invalid password hash: {e}")))?;
    Ok(Argon2::default()
        .verify_password(password.as_bytes(), &parsed_hash)
        .is_ok())
}

fn generate_access_token(
    user_id: Uuid,
    company_id: Option<Uuid>,
    role: Option<&str>,
    secret: &str,
    ttl_secs: u64,
) -> Result<String, AppError> {
    let now = chrono::Utc::now();
    let claims = Claims {
        sub: user_id,
        company_id,
        role: role.map(String::from),
        exp: (now + chrono::Duration::seconds(ttl_secs as i64)).timestamp() as usize,
        iat: now.timestamp() as usize,
        iss: "heyloaf".into(),
        aud: "heyloaf-api".into(),
    };

    jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(e.into()))
}

fn generate_refresh_token(
    user_id: Uuid,
    company_id: Option<Uuid>,
    secret: &str,
    ttl_secs: u64,
) -> Result<String, AppError> {
    let now = chrono::Utc::now();
    let claims = Claims {
        sub: user_id,
        company_id,
        role: None,
        exp: (now + chrono::Duration::seconds(ttl_secs as i64)).timestamp() as usize,
        iat: now.timestamp() as usize,
        iss: "heyloaf".into(),
        aud: "heyloaf-api".into(),
    };

    jsonwebtoken::encode(
        &jsonwebtoken::Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(e.into()))
}

fn build_refresh_cookie(token: &str, max_age_secs: u64, is_production: bool) -> String {
    let mut cookie = format!(
        "refresh_token={token}; HttpOnly; SameSite=Strict; Path=/auth; Max-Age={max_age_secs}"
    );
    if is_production {
        cookie.push_str("; Secure");
    }
    cookie
}

fn clear_refresh_cookie(is_production: bool) -> String {
    let mut cookie =
        "refresh_token=; HttpOnly; SameSite=Strict; Path=/auth; Max-Age=0".to_string();
    if is_production {
        cookie.push_str("; Secure");
    }
    cookie
}

/// Try to extract the refresh token from the Cookie header, falling back to the body field.
fn extract_refresh_token(
    headers: &HeaderMap,
    body_token: Option<String>,
) -> Result<String, AppError> {
    // Try cookie first
    if let Some(cookie_header) = headers.get(axum::http::header::COOKIE)
        && let Ok(cookie_str) = cookie_header.to_str()
    {
        for part in cookie_str.split(';') {
            let part = part.trim();
            if let Some(value) = part.strip_prefix("refresh_token=")
                && !value.is_empty()
            {
                return Ok(value.to_string());
            }
        }
    }
    // Fallback to body
    body_token.ok_or_else(|| AppError::BadRequest("Refresh token is required".into()))
}

// --- Handlers ---

#[utoipa::path(
    post,
    path = "/auth/login",
    tag = "auth",
    request_body = LoginRequest,
    responses((status = 200, body = inline(ApiResponse<LoginResponse>)))
)]
pub async fn login(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<LoginRequest>,
) -> Result<(HeaderMap, Json<ApiResponse<LoginResponse>>), AppError> {
    let user = UserRepository::find_by_email(&state.pool, &body.email)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::Unauthorized("Invalid credentials".into()))?;

    if !verify_password(&body.password, &user.password_hash)? {
        return Err(AppError::Unauthorized("Invalid credentials".into()));
    }

    let companies = UserRepository::get_user_companies(&state.pool, user.id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let (company_id, role, permissions) =
        companies.first().map_or((None, None, serde_json::Value::Object(serde_json::Map::new())), |uc| {
            (Some(uc.company_id), Some(uc.role.clone()), uc.permissions.clone())
        });

    // Fetch company details if user belongs to one
    let login_company = if let Some(cid) = company_id {
        CompanyRepository::find_by_id(&state.pool, cid)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .map(|c| LoginCompany {
                id: c.id,
                name: c.name,
            })
    } else {
        None
    };

    let access_token = generate_access_token(
        user.id,
        company_id,
        role.as_deref(),
        &state.config.jwt_secret,
        state.config.jwt_access_token_ttl_secs,
    )?;

    let refresh_token = generate_refresh_token(
        user.id,
        company_id,
        &state.config.refresh_jwt_secret,
        state.config.jwt_refresh_token_ttl_secs,
    )?;

    let is_production = state.config.app_env.eq_ignore_ascii_case("production");
    let cookie = build_refresh_cookie(
        &refresh_token,
        state.config.jwt_refresh_token_ttl_secs,
        is_production,
    );

    let mut headers = HeaderMap::new();
    match cookie.parse() {
        Ok(val) => { headers.insert(SET_COOKIE, val); }
        Err(e) => { tracing::warn!(error = %e, "Failed to parse Set-Cookie header"); }
    }

    let preferred_language = user
        .metadata
        .get("preferred_language")
        .and_then(serde_json::Value::as_str)
        .map(String::from);

    Ok((
        headers,
        Json(ApiResponse::new(LoginResponse {
            access_token,
            refresh_token,
            token_type: "Bearer".into(),
            expires_in: state.config.jwt_access_token_ttl_secs,
            user: LoginUser {
                id: user.id,
                name: user.name,
                email: user.email,
            },
            company: login_company,
            role: role.clone(),
            permissions,
            preferred_language,
            is_super_admin: user.is_super_admin,
        })),
    ))
}

#[utoipa::path(
    post,
    path = "/auth/register",
    tag = "auth",
    request_body = RegisterRequest,
    responses((status = 201, body = inline(ApiResponse<TokenResponse>)))
)]
pub async fn register(
    State(state): State<AppState>,
    ValidatedJson(body): ValidatedJson<RegisterRequest>,
) -> Result<(StatusCode, HeaderMap, Json<ApiResponse<TokenResponse>>), AppError> {
    // Check if email is already taken
    let existing = UserRepository::find_by_email(&state.pool, &body.email)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    if existing.is_some() {
        return Err(AppError::Conflict("Email address is already in use".into()));
    }

    let password_hash = hash_password(&body.password)?;

    let user = UserRepository::create(&state.pool, &body.name, &body.email, &password_hash, false)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let access_token = generate_access_token(
        user.id,
        None,
        None,
        &state.config.jwt_secret,
        state.config.jwt_access_token_ttl_secs,
    )?;

    let refresh_token = generate_refresh_token(
        user.id,
        None,
        &state.config.refresh_jwt_secret,
        state.config.jwt_refresh_token_ttl_secs,
    )?;

    let is_production = state.config.app_env.eq_ignore_ascii_case("production");
    let cookie = build_refresh_cookie(
        &refresh_token,
        state.config.jwt_refresh_token_ttl_secs,
        is_production,
    );

    let mut headers = HeaderMap::new();
    match cookie.parse() {
        Ok(val) => { headers.insert(SET_COOKIE, val); }
        Err(e) => { tracing::warn!(error = %e, "Failed to parse Set-Cookie header"); }
    }

    Ok((
        StatusCode::CREATED,
        headers,
        Json(ApiResponse::new(TokenResponse {
            access_token,
            refresh_token,
            token_type: "Bearer".into(),
            expires_in: state.config.jwt_access_token_ttl_secs,
        })),
    ))
}

#[utoipa::path(
    post,
    path = "/auth/refresh",
    tag = "auth",
    request_body = RefreshRequest,
    responses((status = 200, body = inline(ApiResponse<TokenResponse>)))
)]
pub async fn refresh(
    State(state): State<AppState>,
    request_headers: HeaderMap,
    Json(body): Json<RefreshRequest>,
) -> Result<(HeaderMap, Json<ApiResponse<TokenResponse>>), AppError> {
    let token = extract_refresh_token(&request_headers, body.refresh_token)?;

    let mut validation = jsonwebtoken::Validation::new(jsonwebtoken::Algorithm::HS256);
    validation.set_issuer(&["heyloaf"]);
    validation.set_audience(&["heyloaf-api"]);
    let key =
        jsonwebtoken::DecodingKey::from_secret(state.config.refresh_jwt_secret.as_bytes());

    let token_data = jsonwebtoken::decode::<Claims>(&token, &key, &validation).map_err(|e| {
        tracing::debug!(error = %e, "Refresh token validation failed");
        AppError::Unauthorized("Invalid or expired refresh token".into())
    })?;

    let user_id = token_data.claims.sub;
    let token_company_id = token_data.claims.company_id;

    // Fetch user's companies to include in the new access token
    let companies = UserRepository::get_user_companies(&state.pool, user_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    // Preserve the company from the refresh token if the user still belongs to it,
    // otherwise fall back to the first company.
    let (company_id, role) = if let Some(cid) = token_company_id {
        companies
            .iter()
            .find(|uc| uc.company_id == cid)
            .map_or_else(
                || {
                    companies.first().map_or((None, None), |uc| {
                        (Some(uc.company_id), Some(uc.role.clone()))
                    })
                },
                |uc| (Some(uc.company_id), Some(uc.role.clone())),
            )
    } else {
        companies.first().map_or((None, None), |uc| {
            (Some(uc.company_id), Some(uc.role.clone()))
        })
    };

    let access_token = generate_access_token(
        user_id,
        company_id,
        role.as_deref(),
        &state.config.jwt_secret,
        state.config.jwt_access_token_ttl_secs,
    )?;

    let new_refresh_token = generate_refresh_token(
        user_id,
        company_id,
        &state.config.refresh_jwt_secret,
        state.config.jwt_refresh_token_ttl_secs,
    )?;

    let is_production = state.config.app_env.eq_ignore_ascii_case("production");
    let cookie = build_refresh_cookie(
        &new_refresh_token,
        state.config.jwt_refresh_token_ttl_secs,
        is_production,
    );

    let mut headers = HeaderMap::new();
    match cookie.parse() {
        Ok(val) => { headers.insert(SET_COOKIE, val); }
        Err(e) => { tracing::warn!(error = %e, "Failed to parse Set-Cookie header"); }
    }

    Ok((
        headers,
        Json(ApiResponse::new(TokenResponse {
            access_token,
            refresh_token: new_refresh_token,
            token_type: "Bearer".into(),
            expires_in: state.config.jwt_access_token_ttl_secs,
        })),
    ))
}

#[utoipa::path(
    post,
    path = "/api/auth/logout",
    tag = "auth",
    security(("bearer" = [])),
    responses((status = 200))
)]
pub async fn logout(
    State(state): State<AppState>,
) -> Result<(HeaderMap, Json<ApiResponse<serde_json::Value>>), AppError> {
    let is_production = state.config.app_env.eq_ignore_ascii_case("production");
    let cookie = clear_refresh_cookie(is_production);

    let mut headers = HeaderMap::new();
    match cookie.parse() {
        Ok(val) => { headers.insert(SET_COOKIE, val); }
        Err(e) => { tracing::warn!(error = %e, "Failed to parse Set-Cookie header"); }
    }

    Ok((
        headers,
        Json(ApiResponse::new(serde_json::json!({
            "message": "Logged out successfully"
        }))),
    ))
}

#[utoipa::path(
    post,
    path = "/api/auth/switch-company",
    tag = "auth",
    security(("bearer" = [])),
    request_body = SwitchCompanyRequest,
    responses((status = 200, body = inline(ApiResponse<TokenResponse>)))
)]
pub async fn switch_company(
    State(state): State<AppState>,
    Extension(auth_user): Extension<AuthUser>,
    Json(body): Json<SwitchCompanyRequest>,
) -> Result<(HeaderMap, Json<ApiResponse<TokenResponse>>), AppError> {
    // Validate user belongs to the target company
    let user_company =
        UserRepository::get_user_company(&state.pool, auth_user.user_id, body.company_id)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .ok_or_else(|| AppError::Forbidden("You do not have access to this company".into()))?;

    let access_token = generate_access_token(
        auth_user.user_id,
        Some(body.company_id),
        Some(&user_company.role),
        &state.config.jwt_secret,
        state.config.jwt_access_token_ttl_secs,
    )?;

    let refresh_token = generate_refresh_token(
        auth_user.user_id,
        Some(body.company_id),
        &state.config.refresh_jwt_secret,
        state.config.jwt_refresh_token_ttl_secs,
    )?;

    let is_production = state.config.app_env.eq_ignore_ascii_case("production");
    let cookie = build_refresh_cookie(
        &refresh_token,
        state.config.jwt_refresh_token_ttl_secs,
        is_production,
    );

    let mut headers = HeaderMap::new();
    match cookie.parse() {
        Ok(val) => { headers.insert(SET_COOKIE, val); }
        Err(e) => { tracing::warn!(error = %e, "Failed to parse Set-Cookie header"); }
    }

    Ok((
        headers,
        Json(ApiResponse::new(TokenResponse {
            access_token,
            refresh_token,
            token_type: "Bearer".into(),
            expires_in: state.config.jwt_access_token_ttl_secs,
        })),
    ))
}
