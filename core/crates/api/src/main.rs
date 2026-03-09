use anyhow::Context;
use axum::http::{Method, header};
use heyloaf_common::config::Config;
use heyloaf_common::telemetry;
use heyloaf_dal::{create_pool, pool::run_migrations};
use std::net::SocketAddr;
use tower_http::compression::CompressionLayer;
use tower_http::cors::{Any, CorsLayer};

mod extractors;
mod handlers;
mod middleware;
mod openapi;
mod routes;
mod state;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    // Load config
    let config = Config::from_env().context("Failed to load configuration")?;

    // Init telemetry
    telemetry::init_telemetry(&config.log_level, &config.log_format)?;

    tracing::info!("Starting Heyloaf API server");

    // CORS production guard: wildcard origins are not allowed in production
    let is_production = config.app_env.eq_ignore_ascii_case("production");
    if is_production && config.cors_origins == "*" {
        tracing::error!(
            "CORS_ORIGINS is set to '*' in production. \
             This is insecure. Set explicit origins or the server will not start."
        );
        anyhow::bail!("Wildcard CORS origins are not allowed in production");
    }

    // Database pool
    let pool = create_pool(&config.database_url).await?;

    // Run migrations
    run_migrations(&pool).await?;

    // CORS
    let allowed_methods = [
        Method::GET,
        Method::POST,
        Method::PUT,
        Method::DELETE,
        Method::PATCH,
        Method::OPTIONS,
    ];
    let allowed_headers = [
        header::AUTHORIZATION,
        header::CONTENT_TYPE,
        header::ACCEPT,
        header::HeaderName::from_static("x-app-language"),
    ];

    let cors = if config.cors_origins == "*" {
        CorsLayer::new()
            .allow_origin(Any)
            .allow_methods(allowed_methods)
            .allow_headers(allowed_headers)
    } else {
        let origins: Vec<_> = config
            .cors_origins
            .split(',')
            .filter_map(|s| s.trim().parse().ok())
            .collect();
        CorsLayer::new()
            .allow_origin(origins)
            .allow_methods(allowed_methods)
            .allow_headers(allowed_headers)
            .allow_credentials(true)
    };

    // App state
    let state = state::AppState::new(pool, config.clone());

    // Routes
    let app = routes::create_routes(state)
        .layer(cors)
        .layer(CompressionLayer::new());

    // Start server
    let addr: SocketAddr = format!("{}:{}", config.server_host, config.server_port)
        .parse()
        .context("Invalid server address")?;

    tracing::info!(%addr, "Server listening");

    let listener = tokio::net::TcpListener::bind(addr).await?;
    axum::serve(listener, app).await?;

    Ok(())
}
