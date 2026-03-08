use anyhow::{Context, anyhow};

/// Application configuration loaded from environment variables.
#[derive(Debug, Clone)]
pub struct Config {
    pub database_url: String,
    pub server_host: String,
    pub server_port: u16,
    pub jwt_secret: String,
    pub jwt_access_token_ttl_secs: u64,
    pub jwt_refresh_token_ttl_secs: u64,
    pub cors_origins: String,
    pub log_level: String,
    pub log_format: String,
}

impl Config {
    /// Load configuration from environment variables.
    ///
    /// Reads a `.env` file if present, then pulls values from the environment.
    /// Returns an error if any required variable is missing or malformed.
    pub fn from_env() -> anyhow::Result<Self> {
        // Load .env file if it exists; ignore errors (file may not be present)
        let _ = dotenvy::dotenv();

        let database_url = std::env::var("DATABASE_URL")
            .context("DATABASE_URL environment variable is required")?;

        let server_host = std::env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string());

        let server_port = std::env::var("SERVER_PORT")
            .unwrap_or_else(|_| "3000".to_string())
            .parse::<u16>()
            .map_err(|e| anyhow!("SERVER_PORT must be a valid u16: {e}"))?;

        let jwt_secret =
            std::env::var("JWT_SECRET").context("JWT_SECRET environment variable is required")?;

        let jwt_access_token_ttl_secs = std::env::var("JWT_ACCESS_TOKEN_TTL_SECS")
            .unwrap_or_else(|_| "900".to_string())
            .parse::<u64>()
            .map_err(|e| anyhow!("JWT_ACCESS_TOKEN_TTL_SECS must be a valid u64: {e}"))?;

        let jwt_refresh_token_ttl_secs = std::env::var("JWT_REFRESH_TOKEN_TTL_SECS")
            .unwrap_or_else(|_| "604800".to_string())
            .parse::<u64>()
            .map_err(|e| anyhow!("JWT_REFRESH_TOKEN_TTL_SECS must be a valid u64: {e}"))?;

        let cors_origins =
            std::env::var("CORS_ORIGINS").unwrap_or_else(|_| "http://localhost:3000".to_string());

        let log_level = std::env::var("LOG_LEVEL").unwrap_or_else(|_| "debug".to_string());

        let log_format = std::env::var("LOG_FORMAT").unwrap_or_else(|_| "pretty".to_string());

        Ok(Self {
            database_url,
            server_host,
            server_port,
            jwt_secret,
            jwt_access_token_ttl_secs,
            jwt_refresh_token_ttl_secs,
            cors_origins,
            log_level,
            log_format,
        })
    }
}
