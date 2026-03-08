use axum::http::StatusCode;
use axum::response::{IntoResponse, Response};
use serde_json::json;
use thiserror::Error;

pub type AppResult<T> = Result<T, AppError>;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("Internal server error")]
    Internal(#[from] anyhow::Error),

    #[error("Database error: {0}")]
    Database(String),

    #[error("Validation error: {field}: {message}")]
    Validation { field: String, message: String },

    #[error("Not found: {0}")]
    NotFound(String),

    #[error("Unauthorized: {0}")]
    Unauthorized(String),

    #[error("Forbidden: {0}")]
    Forbidden(String),

    #[error("Bad request: {0}")]
    BadRequest(String),

    #[error("Conflict: {0}")]
    Conflict(String),
}

impl IntoResponse for AppError {
    fn into_response(self) -> Response {
        let (status, code, message, details) = match &self {
            AppError::Internal(err) => {
                tracing::error!(error = %err, "Internal server error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "INTERNAL_ERROR",
                    "An internal error occurred".to_string(),
                    None,
                )
            }
            AppError::Database(msg) => {
                tracing::error!(error = %msg, "Database error");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    "DATABASE_ERROR",
                    "A database error occurred".to_string(),
                    None,
                )
            }
            AppError::Validation { field, message } => {
                tracing::warn!(field = %field, message = %message, "Validation error");
                (
                    StatusCode::BAD_REQUEST,
                    "VALIDATION_ERROR",
                    message.clone(),
                    Some(json!({ "field": field })),
                )
            }
            AppError::NotFound(msg) => (StatusCode::NOT_FOUND, "NOT_FOUND", msg.clone(), None),
            AppError::Unauthorized(msg) => {
                tracing::debug!(message = %msg, "Unauthorized");
                (StatusCode::UNAUTHORIZED, "UNAUTHORIZED", msg.clone(), None)
            }
            AppError::Forbidden(msg) => (StatusCode::FORBIDDEN, "FORBIDDEN", msg.clone(), None),
            AppError::BadRequest(msg) => {
                (StatusCode::BAD_REQUEST, "BAD_REQUEST", msg.clone(), None)
            }
            AppError::Conflict(msg) => (StatusCode::CONFLICT, "CONFLICT", msg.clone(), None),
        };

        let trace_id = uuid::Uuid::new_v4().to_string();
        let mut body = json!({
            "error": {
                "code": code,
                "message": message,
                "trace_id": trace_id,
                "timestamp": chrono::Utc::now().to_rfc3339(),
            }
        });

        if let Some(details) = details {
            body["error"]["details"] = details;
        }

        (status, axum::Json(body)).into_response()
    }
}
