pub mod config;
pub mod crypto;
pub mod errors;
pub mod i18n;
pub mod telemetry;
pub mod types;
pub mod validation;

/// Escape SQL LIKE wildcard characters so user input cannot alter pattern semantics.
#[must_use]
pub fn escape_like(input: &str) -> String {
    input
        .replace('\\', "\\\\")
        .replace('%', "\\%")
        .replace('_', "\\_")
}
