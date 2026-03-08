use sqlx::PgPool;
use uuid::Uuid;

use crate::models::currency::Currency;

pub struct CurrencyRepository;

impl CurrencyRepository {
    const SELECT: &str = r"id, company_id, code, name, symbol,
        exchange_rate, is_base, is_active, created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Currency>, sqlx::Error> {
        let sql = format!("SELECT {} FROM currencies WHERE id = $1", Self::SELECT);
        sqlx::query_as::<_, Currency>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(pool: &PgPool, company_id: Uuid) -> Result<Vec<Currency>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM currencies WHERE company_id = $1 ORDER BY created_at DESC",
            Self::SELECT
        );
        sqlx::query_as::<_, Currency>(&sql)
            .bind(company_id)
            .fetch_all(pool)
            .await
    }

    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        code: &str,
        name: &str,
        symbol: &str,
        exchange_rate: f64,
        is_base: bool,
    ) -> Result<Currency, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO currencies
                (company_id, code, name, symbol, exchange_rate, is_base)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Currency>(&sql)
            .bind(company_id)
            .bind(code)
            .bind(name)
            .bind(symbol)
            .bind(exchange_rate)
            .bind(is_base)
            .fetch_one(pool)
            .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: &str,
        symbol: &str,
        exchange_rate: f64,
        is_active: bool,
    ) -> Result<Currency, sqlx::Error> {
        let sql = format!(
            r"UPDATE currencies SET
                name = $2, symbol = $3, exchange_rate = $4, is_active = $5
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Currency>(&sql)
            .bind(id)
            .bind(name)
            .bind(symbol)
            .bind(exchange_rate)
            .bind(is_active)
            .fetch_one(pool)
            .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM currencies WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
