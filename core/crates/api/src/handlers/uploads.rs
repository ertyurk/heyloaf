use axum::extract::{Multipart, State};
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use serde::Serialize;
use std::path::PathBuf;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

const MAX_FILE_SIZE: usize = 5 * 1024 * 1024; // 5MB

const ALLOWED_CONTENT_TYPES: &[&str] = &[
    "image/jpeg",
    "image/png",
    "image/webp",
];

#[derive(Debug, Serialize, ToSchema)]
pub struct UploadResponse {
    pub url: String,
}

fn extension_for_content_type(content_type: &str) -> Option<&'static str> {
    match content_type {
        "image/jpeg" => Some("jpg"),
        "image/png" => Some("png"),
        "image/webp" => Some("webp"),
        _ => None,
    }
}

#[utoipa::path(
    post,
    path = "/api/uploads",
    tag = "uploads",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<UploadResponse>)))
)]
pub async fn upload_file(
    State(_state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<UploadResponse>>, AppError> {
    let field = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(format!("Invalid multipart data: {e}")))?
        .ok_or_else(|| AppError::BadRequest("No file field provided".into()))?;

    let content_type = field
        .content_type()
        .ok_or_else(|| AppError::BadRequest("Missing content type".into()))?
        .to_string();

    if !ALLOWED_CONTENT_TYPES.contains(&content_type.as_str()) {
        return Err(AppError::BadRequest(format!(
            "Unsupported file type: {content_type}. Allowed: JPEG, PNG, WebP"
        )));
    }

    let ext = extension_for_content_type(&content_type)
        .ok_or_else(|| AppError::BadRequest("Could not determine file extension".into()))?;

    let data = field
        .bytes()
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to read file data: {e}")))?;

    if data.len() > MAX_FILE_SIZE {
        return Err(AppError::BadRequest(format!(
            "File too large. Maximum size is {}MB",
            MAX_FILE_SIZE / 1024 / 1024
        )));
    }

    if data.is_empty() {
        return Err(AppError::BadRequest("File is empty".into()));
    }

    let file_id = Uuid::new_v4();
    let filename = format!("{file_id}.{ext}");
    let relative_path = format!("uploads/{}/{filename}", ctx.company_id);

    let dir: PathBuf = format!("./uploads/{}", ctx.company_id).into();
    tokio::fs::create_dir_all(&dir)
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to create upload directory: {e}")))?;

    let file_path = dir.join(&filename);
    tokio::fs::write(&file_path, &data)
        .await
        .map_err(|e| AppError::BadRequest(format!("Failed to write file: {e}")))?;

    let url = format!("/{relative_path}");

    Ok(Json(ApiResponse::new(UploadResponse { url })))
}
