use sqlx::PgPool;
use uuid::Uuid;

use crate::models::company::Company;

pub struct CompanyRepository;

impl CompanyRepository {
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Company>, sqlx::Error> {
        sqlx::query_as::<_, Company>("SELECT * FROM companies WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: &str,
        tax_number: Option<&str>,
        tax_office: Option<&str>,
        address: Option<&str>,
        phone: Option<&str>,
        email: Option<&str>,
        website: Option<&str>,
        default_currency: &str,
        default_tax_rate: f64,
        default_language: &str,
        timezone: &str,
        settings: &serde_json::Value,
    ) -> Result<Company, sqlx::Error> {
        sqlx::query_as::<_, Company>(
            r"UPDATE companies
            SET name = $2, tax_number = $3, tax_office = $4, address = $5,
                phone = $6, email = $7, website = $8,
                default_currency = $9, default_tax_rate = $10,
                default_language = $11, timezone = $12, settings = $13
            WHERE id = $1
            RETURNING *",
        )
        .bind(id)
        .bind(name)
        .bind(tax_number)
        .bind(tax_office)
        .bind(address)
        .bind(phone)
        .bind(email)
        .bind(website)
        .bind(default_currency)
        .bind(default_tax_rate)
        .bind(default_language)
        .bind(timezone)
        .bind(settings)
        .fetch_one(pool)
        .await
    }

    pub async fn create(
        pool: &PgPool,
        name: &str,
        default_currency: &str,
        default_tax_rate: f64,
        default_language: &str,
    ) -> Result<Company, sqlx::Error> {
        sqlx::query_as::<_, Company>(
            r"INSERT INTO companies (name, default_currency, default_tax_rate, default_language)
            VALUES ($1, $2, $3, $4)
            RETURNING *",
        )
        .bind(name)
        .bind(default_currency)
        .bind(default_tax_rate)
        .bind(default_language)
        .fetch_one(pool)
        .await
    }
}
