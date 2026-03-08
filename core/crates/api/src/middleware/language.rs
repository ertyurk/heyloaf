use axum::{http::Request, middleware::Next, response::Response};
use heyloaf_common::types::Language;

pub async fn language_middleware(mut request: Request<axum::body::Body>, next: Next) -> Response {
    let language = request
        .headers()
        .get("x-app-language")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.parse::<Language>().ok())
        .unwrap_or_default();

    request.extensions_mut().insert(language);
    next.run(request).await
}
