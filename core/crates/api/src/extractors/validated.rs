use axum::{
    Json,
    extract::{FromRequest, Request, rejection::JsonRejection},
};
use heyloaf_common::errors::AppError;
use heyloaf_common::validation::validation_errors_to_app_error;
use serde::de::DeserializeOwned;
use validator::Validate;

pub struct ValidatedJson<T>(pub T);

impl<S, T> FromRequest<S> for ValidatedJson<T>
where
    T: DeserializeOwned + Validate,
    S: Send + Sync,
    Json<T>: FromRequest<S, Rejection = JsonRejection>,
{
    type Rejection = AppError;

    async fn from_request(req: Request, state: &S) -> Result<Self, Self::Rejection> {
        let Json(value) = Json::<T>::from_request(req, state)
            .await
            .map_err(|e| AppError::BadRequest(e.body_text()))?;

        value
            .validate()
            .map_err(|e| validation_errors_to_app_error(&e))?;

        Ok(ValidatedJson(value))
    }
}
