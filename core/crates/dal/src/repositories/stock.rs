use sqlx::PgPool;
use uuid::Uuid;

use crate::models::stock::Stock;

pub struct StockRepository;

impl StockRepository {
    const SELECT: &str = r"id, company_id, product_id, quantity, min_level, max_level,
        reserved_quantity, location, last_movement_at, created_at, updated_at";

    pub async fn find_by_product(
        pool: &PgPool,
        company_id: Uuid,
        product_id: Uuid,
    ) -> Result<Option<Stock>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM stock WHERE company_id = $1 AND product_id = $2",
            Self::SELECT
        );
        sqlx::query_as::<_, Stock>(&sql)
            .bind(company_id)
            .bind(product_id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(pool: &PgPool, company_id: Uuid) -> Result<Vec<Stock>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM stock WHERE company_id = $1 ORDER BY created_at DESC",
            Self::SELECT
        );
        sqlx::query_as::<_, Stock>(&sql)
            .bind(company_id)
            .fetch_all(pool)
            .await
    }

    pub async fn list_low_stock(
        pool: &PgPool,
        company_id: Uuid,
    ) -> Result<Vec<Stock>, sqlx::Error> {
        let sql = format!(
            r"SELECT {} FROM stock
            WHERE company_id = $1
            AND min_level IS NOT NULL
            AND quantity <= min_level
            ORDER BY quantity ASC",
            Self::SELECT
        );
        sqlx::query_as::<_, Stock>(&sql)
            .bind(company_id)
            .fetch_all(pool)
            .await
    }

    pub async fn upsert_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        company_id: Uuid,
        product_id: Uuid,
        quantity_delta: f64,
    ) -> Result<Stock, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO stock (company_id, product_id, quantity, last_movement_at)
            VALUES ($1, $2, $3, now())
            ON CONFLICT (company_id, product_id)
            DO UPDATE SET
                quantity = stock.quantity + $3,
                last_movement_at = now()
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Stock>(&sql)
            .bind(company_id)
            .bind(product_id)
            .bind(quantity_delta)
            .fetch_one(executor)
            .await
    }

    pub async fn upsert(
        pool: &PgPool,
        company_id: Uuid,
        product_id: Uuid,
        quantity_delta: f64,
    ) -> Result<Stock, sqlx::Error> {
        Self::upsert_with_executor(pool, company_id, product_id, quantity_delta).await
    }

    pub async fn update_levels(
        pool: &PgPool,
        company_id: Uuid,
        product_id: Uuid,
        min_level: Option<f64>,
        max_level: Option<f64>,
    ) -> Result<Stock, sqlx::Error> {
        let sql = format!(
            r"UPDATE stock SET min_level = $3, max_level = $4
            WHERE company_id = $1 AND product_id = $2
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Stock>(&sql)
            .bind(company_id)
            .bind(product_id)
            .bind(min_level)
            .bind(max_level)
            .fetch_one(pool)
            .await
    }

    pub async fn get_or_create(
        pool: &PgPool,
        company_id: Uuid,
        product_id: Uuid,
    ) -> Result<Stock, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO stock (company_id, product_id)
            VALUES ($1, $2)
            ON CONFLICT (company_id, product_id) DO NOTHING
            RETURNING {}",
            Self::SELECT
        );

        // Try the insert first
        let inserted = sqlx::query_as::<_, Stock>(&sql)
            .bind(company_id)
            .bind(product_id)
            .fetch_optional(pool)
            .await?;

        if let Some(stock) = inserted {
            return Ok(stock);
        }

        // Row already exists, fetch it
        let select_sql = format!(
            "SELECT {} FROM stock WHERE company_id = $1 AND product_id = $2",
            Self::SELECT
        );
        sqlx::query_as::<_, Stock>(&select_sql)
            .bind(company_id)
            .bind(product_id)
            .fetch_one(pool)
            .await
    }
}
