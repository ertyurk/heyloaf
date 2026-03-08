use sqlx::PgPool;
use uuid::Uuid;

use crate::models::stock_count::StockCount;

pub struct StockCountRepository;

impl StockCountRepository {
    const SELECT: &str =
        r"id, company_id, counted_at, counted_by, notes, items, status, created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<StockCount>, sqlx::Error> {
        let sql = format!("SELECT {} FROM stock_counts WHERE id = $1", Self::SELECT);
        sqlx::query_as::<_, StockCount>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(pool: &PgPool, company_id: Uuid) -> Result<Vec<StockCount>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM stock_counts WHERE company_id = $1 ORDER BY created_at DESC",
            Self::SELECT
        );
        sqlx::query_as::<_, StockCount>(&sql)
            .bind(company_id)
            .fetch_all(pool)
            .await
    }

    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        counted_by: Uuid,
        notes: Option<&str>,
        items: serde_json::Value,
    ) -> Result<StockCount, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO stock_counts (company_id, counted_by, notes, items)
            VALUES ($1, $2, $3, $4)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, StockCount>(&sql)
            .bind(company_id)
            .bind(counted_by)
            .bind(notes)
            .bind(items)
            .fetch_one(pool)
            .await
    }

    pub async fn complete(pool: &PgPool, id: Uuid) -> Result<StockCount, sqlx::Error> {
        let sql = format!(
            r"UPDATE stock_counts SET status = 'completed'
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, StockCount>(&sql)
            .bind(id)
            .fetch_one(pool)
            .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM stock_counts WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
