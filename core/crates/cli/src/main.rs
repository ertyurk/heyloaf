#![expect(clippy::print_stdout)]

use clap::{Parser, Subcommand};

mod commands;

#[derive(Parser)]
#[command(name = "heyloaf-cli", about = "Heyloaf administration CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Create a new company
    CreateCompany {
        #[arg(long)]
        name: String,
        #[arg(long, default_value = "TRY")]
        currency: String,
        #[arg(long, default_value = "20.0")]
        tax_rate: f64,
        #[arg(long, default_value = "tr")]
        language: String,
    },
    /// Create a new user and optionally assign to a company
    CreateUser {
        #[arg(long)]
        name: String,
        #[arg(long)]
        email: String,
        #[arg(long)]
        password: String,
        #[arg(long)]
        company_id: Option<uuid::Uuid>,
        #[arg(long, default_value = "admin")]
        role: String,
        #[arg(long, default_value = "false")]
        super_admin: bool,
    },
    /// Create a new migration file
    CreateMigration {
        #[arg(long)]
        name: String,
    },
    /// Seed development data
    Seed,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let _ = dotenvy::dotenv();

    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("info")),
        )
        .init();

    let cli = Cli::parse();

    match cli.command {
        Commands::CreateCompany {
            name,
            currency,
            tax_rate,
            language,
        } => {
            commands::create_company::run(&name, &currency, tax_rate, &language).await?;
        }
        Commands::CreateUser {
            name,
            email,
            password,
            company_id,
            role,
            super_admin,
        } => {
            commands::create_user::run(&name, &email, &password, company_id, &role, super_admin)
                .await?;
        }
        Commands::CreateMigration { name } => {
            commands::create_migration::run(&name)?;
        }
        Commands::Seed => {
            commands::seed::run().await?;
        }
    }

    Ok(())
}
