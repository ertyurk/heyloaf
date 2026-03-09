use sqlx::PgPool;
use uuid::Uuid;

use crate::models::stock_movement::StockMovement;

pub struct StockMovementRepository;

impl StockMovementRepository {
    const SELECT: &str = r"id, company_id, product_id, movement_type::text,
        source::text, quantity, unit_price, total_price, vat_rate,
        reference_type, reference_id, description, created_by, created_at";

    #[expect(clippy::too_many_arguments)]
    pub async fn create_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        company_id: Uuid,
        product_id: Uuid,
        movement_type: &str,
        source: &str,
        quantity: f64,
        unit_price: Option<f64>,
        total_price: Option<f64>,
        vat_rate: Option<f64>,
        reference_type: Option<&str>,
        reference_id: Option<Uuid>,
        description: Option<&str>,
        created_by: Uuid,
    ) -> Result<StockMovement, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO stock_movements
                (company_id, product_id, movement_type, source, quantity,
                 unit_price, total_price, vat_rate, reference_type, reference_id,
                 description, created_by)
            VALUES ($1, $2, $3::movement_type, $4::movement_source, $5,
                    $6, $7, $8, $9, $10, $11, $12)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, StockMovement>(&sql)
            .bind(company_id)
            .bind(product_id)
            .bind(movement_type)
            .bind(source)
            .bind(quantity)
            .bind(unit_price)
            .bind(total_price)
            .bind(vat_rate)
            .bind(reference_type)
            .bind(reference_id)
            .bind(description)
            .bind(created_by)
            .fetch_one(executor)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        product_id: Uuid,
        movement_type: &str,
        source: &str,
        quantity: f64,
        unit_price: Option<f64>,
        total_price: Option<f64>,
        vat_rate: Option<f64>,
        reference_type: Option<&str>,
        reference_id: Option<Uuid>,
        description: Option<&str>,
        created_by: Uuid,
    ) -> Result<StockMovement, sqlx::Error> {
        Self::create_with_executor(
            pool, company_id, product_id, movement_type, source, quantity, unit_price,
            total_price, vat_rate, reference_type, reference_id, description, created_by,
        )
        .await
    }

    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        product_id: Option<Uuid>,
        movement_type: Option<&str>,
        source: Option<&str>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<StockMovement>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM stock_movements
            WHERE company_id = $1
            AND ($2::uuid IS NULL OR product_id = $2)
            AND ($3::text IS NULL OR movement_type = $3::movement_type)
            AND ($4::text IS NULL OR source = $4::movement_source)",
        )
        .bind(company_id)
        .bind(product_id)
        .bind(movement_type)
        .bind(source)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM stock_movements
            WHERE company_id = $1
            AND ($2::uuid IS NULL OR product_id = $2)
            AND ($3::text IS NULL OR movement_type = $3::movement_type)
            AND ($4::text IS NULL OR source = $4::movement_source)
            ORDER BY created_at DESC
            LIMIT $5 OFFSET $6",
            Self::SELECT
        );
        let movements = sqlx::query_as::<_, StockMovement>(&sql)
            .bind(company_id)
            .bind(product_id)
            .bind(movement_type)
            .bind(source)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((movements, total))
    }

    pub async fn list_by_reference_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        company_id: Uuid,
        reference_type: &str,
        reference_id: Uuid,
    ) -> Result<Vec<StockMovement>, sqlx::Error> {
        let sql = format!(
            r"SELECT {} FROM stock_movements
            WHERE reference_type = $1 AND reference_id = $2 AND company_id = $3
            ORDER BY created_at ASC",
            Self::SELECT
        );
        sqlx::query_as::<_, StockMovement>(&sql)
            .bind(reference_type)
            .bind(reference_id)
            .bind(company_id)
            .fetch_all(executor)
            .await
    }

    pub async fn list_by_reference(
        pool: &PgPool,
        company_id: Uuid,
        reference_type: &str,
        reference_id: Uuid,
    ) -> Result<Vec<StockMovement>, sqlx::Error> {
        Self::list_by_reference_with_executor(pool, company_id, reference_type, reference_id).await
    }

    pub async fn delete_by_reference_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        company_id: Uuid,
        reference_type: &str,
        reference_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            "DELETE FROM stock_movements
            WHERE reference_type = $1 AND reference_id = $2 AND company_id = $3",
        )
        .bind(reference_type)
        .bind(reference_id)
        .bind(company_id)
        .execute(executor)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn delete_by_reference(
        pool: &PgPool,
        company_id: Uuid,
        reference_type: &str,
        reference_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        Self::delete_by_reference_with_executor(pool, company_id, reference_type, reference_id)
            .await
    }
}
