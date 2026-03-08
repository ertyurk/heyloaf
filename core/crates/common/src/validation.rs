use crate::errors::AppError;
use validator::ValidationErrors;

/// Convert validator errors into an `AppError`, extracting the first field error.
#[must_use]
pub fn validation_errors_to_app_error(errors: &ValidationErrors) -> AppError {
    if let Some((field, field_errors)) = errors.field_errors().into_iter().next()
        && let Some(first_error) = field_errors.first()
    {
        return AppError::Validation {
            field: field.to_string(),
            message: first_error
                .message
                .as_ref()
                .map_or_else(|| format!("Invalid value for {field}"), |m| m.to_string()),
        };
    }
    AppError::BadRequest("Validation failed".to_string())
}
