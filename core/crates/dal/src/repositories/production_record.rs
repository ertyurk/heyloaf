use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::production_record::ProductionRecord;

pub struct ProductionRecordRepository;

impl ProductionRecordRepository {
    const SELECT: &str = r"id, company_id, product_id, variant_name, quantity, unit,
        batch_size, materials, notes, produced_by, produced_at, created_at, updated_at";

    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<ProductionRecord>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM production_records WHERE id = $1",
            Self::SELECT
        );
        sqlx::query_as::<_, ProductionRecord>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        product_id: Option<Uuid>,
        date_from: Option<DateTime<Utc>>,
        date_to: Option<DateTime<Utc>>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<ProductionRecord>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM production_records
            WHERE company_id = $1
            AND ($2::uuid IS NULL OR product_id = $2)
            AND ($3::timestamptz IS NULL OR produced_at >= $3)
            AND ($4::timestamptz IS NULL OR produced_at <= $4)",
        )
        .bind(company_id)
        .bind(product_id)
        .bind(date_from)
        .bind(date_to)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM production_records
            WHERE company_id = $1
            AND ($2::uuid IS NULL OR product_id = $2)
            AND ($3::timestamptz IS NULL OR produced_at >= $3)
            AND ($4::timestamptz IS NULL OR produced_at <= $4)
            ORDER BY produced_at DESC
            LIMIT $5 OFFSET $6",
            Self::SELECT
        );
        let records = sqlx::query_as::<_, ProductionRecord>(&sql)
            .bind(company_id)
            .bind(product_id)
            .bind(date_from)
            .bind(date_to)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((records, total))
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        company_id: Uuid,
        product_id: Uuid,
        variant_name: Option<&str>,
        quantity: f64,
        unit: &str,
        batch_size: f64,
        materials: &serde_json::Value,
        notes: Option<&str>,
        produced_by: Uuid,
    ) -> Result<ProductionRecord, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO production_records
                (company_id, product_id, variant_name, quantity, unit, batch_size,
                 materials, notes, produced_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, ProductionRecord>(&sql)
            .bind(company_id)
            .bind(product_id)
            .bind(variant_name)
            .bind(quantity)
            .bind(unit)
            .bind(batch_size)
            .bind(materials)
            .bind(notes)
            .bind(produced_by)
            .fetch_one(executor)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        product_id: Uuid,
        variant_name: Option<&str>,
        quantity: f64,
        unit: &str,
        batch_size: f64,
        materials: &serde_json::Value,
        notes: Option<&str>,
        produced_by: Uuid,
    ) -> Result<ProductionRecord, sqlx::Error> {
        Self::create_with_executor(
            pool, company_id, product_id, variant_name, quantity, unit, batch_size,
            materials, notes, produced_by,
        )
        .await
    }

    pub async fn update_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        id: Uuid,
        quantity: f64,
        materials: &serde_json::Value,
        notes: Option<&str>,
    ) -> Result<ProductionRecord, sqlx::Error> {
        let sql = format!(
            r"UPDATE production_records SET
                quantity = $2, materials = $3, notes = $4
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, ProductionRecord>(&sql)
            .bind(id)
            .bind(quantity)
            .bind(materials)
            .bind(notes)
            .fetch_one(executor)
            .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        quantity: f64,
        materials: &serde_json::Value,
        notes: Option<&str>,
    ) -> Result<ProductionRecord, sqlx::Error> {
        Self::update_with_executor(pool, id, quantity, materials, notes).await
    }

    pub async fn delete_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM production_records WHERE id = $1")
            .bind(id)
            .execute(executor)
            .await?;
        Ok(())
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        Self::delete_with_executor(pool, id).await
    }
}
