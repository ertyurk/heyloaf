use axum::{extract::ConnectInfo, http::Request, middleware::Next, response::Response};
use heyloaf_common::errors::AppError;
use std::collections::HashMap;
use std::net::{IpAddr, SocketAddr};
use std::sync::Arc;
use tokio::sync::Mutex;
use tokio::time::Instant;

/// Shared bucket: maps IP -> (request count, window start).
type RateBucket = Arc<Mutex<HashMap<IpAddr, (u32, Instant)>>>;

/// Configuration for a rate limit rule.
#[derive(Clone)]
pub struct RateLimitConfig {
    pub max_requests: u32,
    pub window_secs: u64,
    bucket: RateBucket,
}

impl RateLimitConfig {
    #[must_use]
    pub fn new(max_requests: u32, window_secs: u64) -> Self {
        Self {
            max_requests,
            window_secs,
            bucket: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

/// Creates a rate-limiting middleware function.
///
/// Uses `ConnectInfo<SocketAddr>` if available, otherwise falls back to
/// the `X-Forwarded-For` header, and finally to `127.0.0.1`.
pub async fn rate_limit_middleware(
    config: RateLimitConfig,
    request: Request<axum::body::Body>,
    next: Next,
) -> Result<Response, AppError> {
    let ip = request
        .extensions()
        .get::<ConnectInfo<SocketAddr>>()
        .map(|ci| ci.0.ip())
        .or_else(|| {
            request
                .headers()
                .get("x-forwarded-for")
                .and_then(|v| v.to_str().ok())
                .and_then(|s| s.split(',').next())
                .and_then(|s| s.trim().parse::<IpAddr>().ok())
        })
        .unwrap_or(IpAddr::V4(std::net::Ipv4Addr::LOCALHOST));

    let now = Instant::now();
    let window = std::time::Duration::from_secs(config.window_secs);

    let mut bucket = config.bucket.lock().await;

    let entry = bucket.entry(ip).or_insert((0, now));

    // Reset window if expired
    if now.duration_since(entry.1) >= window {
        *entry = (0, now);
    }

    entry.0 += 1;

    if entry.0 > config.max_requests {
        let elapsed = now.duration_since(entry.1);
        let retry_after = config.window_secs.saturating_sub(elapsed.as_secs());
        return Err(AppError::TooManyRequests {
            message: "Too many requests. Please try again later.".into(),
            retry_after,
        });
    }

    drop(bucket);

    Ok(next.run(request).await)
}
