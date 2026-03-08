/// Initialize the tracing subscriber for structured logging.
///
/// `log_level` sets the default filter (e.g. "debug", "info").
/// `log_format` controls output style: "json" for machine-readable, anything else for pretty.
pub fn init_telemetry(log_level: &str, log_format: &str) -> anyhow::Result<()> {
    let env_filter = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new(log_level));

    match log_format {
        "json" => {
            tracing_subscriber::fmt()
                .with_env_filter(env_filter)
                .json()
                .init();
        }
        _ => {
            tracing_subscriber::fmt()
                .with_env_filter(env_filter)
                .pretty()
                .init();
        }
    }

    Ok(())
}
