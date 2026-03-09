use axum::{http::Request, middleware::Next, response::Response};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{Module, PermissionLevel};

use crate::middleware::auth::AuthUser;
use crate::middleware::company_guard::CompanyContext;

// ---------------------------------------------------------------------------
// Module-level permission helpers
// ---------------------------------------------------------------------------

/// Resolve the effective permission level for a module from the JSONB value.
///
/// Returns `None` (the `PermissionLevel` variant) when the key is missing or
/// unrecognisable, which lets the caller fall back to role-based access.
fn resolve_permission(
    permissions: &serde_json::Value,
    module: Module,
) -> Option<PermissionLevel> {
    permissions
        .get(module.as_key())
        .and_then(serde_json::Value::as_str)
        .and_then(|s| serde_json::from_value::<PermissionLevel>(serde_json::Value::String(s.to_owned())).ok())
}

/// Check module-level permission, falling back to legacy role-based access when
/// no module-level permissions are configured.
///
/// Fallback logic (when `permissions` is `{}` / `null` or the module key is absent):
/// - admin  -> always allowed
/// - manager -> allowed if `min_level` <= Editor
/// - user/cashier -> allowed if `min_level` <= Viewer
fn check_module_permission(
    role: Option<&str>,
    permissions: &serde_json::Value,
    module: Module,
    min_level: PermissionLevel,
) -> Result<(), AppError> {
    // Admins bypass all checks.
    if role == Some("admin") {
        return Ok(());
    }

    // Try module-level permission first.
    if let Some(level) = resolve_permission(permissions, module) {
        return if level.meets(min_level) {
            Ok(())
        } else {
            Err(AppError::Forbidden(format!(
                "Insufficient permission for {} (need {:?}, have {:?})",
                module.as_key(),
                min_level,
                level
            )))
        };
    }

    // Fallback: role-based heuristic (backward compatibility).
    let effective = match role {
        Some("manager") => PermissionLevel::Editor,
        Some("user" | "cashier") => PermissionLevel::Viewer,
        _ => PermissionLevel::None,
    };

    if effective.meets(min_level) {
        Ok(())
    } else {
        Err(AppError::Forbidden(format!(
            "Insufficient permission for {}",
            module.as_key(),
        )))
    }
}

/// Build an Axum middleware that enforces `module >= min_level`.
///
/// Usage:
/// ```ignore
/// .layer(axum_middleware::from_fn(require_module_permission(Module::Products, PermissionLevel::Editor)))
/// ```
type PermissionMiddlewareFuture =
    std::pin::Pin<Box<dyn std::future::Future<Output = Result<Response, AppError>> + Send>>;

pub fn require_module_permission(
    module: Module,
    min_level: PermissionLevel,
) -> impl Fn(Request<axum::body::Body>, Next) -> PermissionMiddlewareFuture
       + Clone
       + Send
       + Sync
       + 'static {
    move |request: Request<axum::body::Body>, next: Next| {
        Box::pin(async move {
            let auth_user = request
                .extensions()
                .get::<AuthUser>()
                .ok_or_else(|| AppError::Unauthorized("Authentication required".into()))?
                .clone();

            let permissions = request
                .extensions()
                .get::<CompanyContext>()
                .map_or_else(
                    || serde_json::Value::Object(serde_json::Map::new()),
                    |ctx| ctx.permissions.clone(),
                );

            check_module_permission(
                auth_user.role.as_deref(),
                &permissions,
                module,
                min_level,
            )?;

            Ok(next.run(request).await)
        })
    }
}
