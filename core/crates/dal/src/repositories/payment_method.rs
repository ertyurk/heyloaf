use sqlx::PgPool;
use uuid::Uuid;

use crate::models::payment_method::PaymentMethod;

pub struct PaymentMethodRepository;

impl PaymentMethodRepository {
    const SELECT: &str = r"id, company_id, name, is_default, is_active,
        display_order, created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<PaymentMethod>, sqlx::Error> {
        let sql = format!("SELECT {} FROM payment_methods WHERE id = $1", Self::SELECT);
        sqlx::query_as::<_, PaymentMethod>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(pool: &PgPool, company_id: Uuid) -> Result<Vec<PaymentMethod>, sqlx::Error> {
        let sql = format!(
            r"SELECT {} FROM payment_methods
            WHERE company_id = $1
            ORDER BY display_order, name",
            Self::SELECT
        );
        sqlx::query_as::<_, PaymentMethod>(&sql)
            .bind(company_id)
            .fetch_all(pool)
            .await
    }

    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        name: &str,
        is_default: bool,
        display_order: i32,
    ) -> Result<PaymentMethod, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO payment_methods (company_id, name, is_default, display_order)
            VALUES ($1, $2, $3, $4)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PaymentMethod>(&sql)
            .bind(company_id)
            .bind(name)
            .bind(is_default)
            .bind(display_order)
            .fetch_one(pool)
            .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: &str,
        is_active: bool,
        display_order: i32,
    ) -> Result<PaymentMethod, sqlx::Error> {
        let sql = format!(
            r"UPDATE payment_methods SET
                name = $2, is_active = $3, display_order = $4
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PaymentMethod>(&sql)
            .bind(id)
            .bind(name)
            .bind(is_active)
            .bind(display_order)
            .fetch_one(pool)
            .await
    }

    pub async fn set_default(
        pool: &PgPool,
        company_id: Uuid,
        id: Uuid,
    ) -> Result<PaymentMethod, sqlx::Error> {
        // Clear existing default first
        sqlx::query(
            r"UPDATE payment_methods SET is_default = false
            WHERE company_id = $1 AND is_default = true",
        )
        .bind(company_id)
        .execute(pool)
        .await?;

        let sql = format!(
            r"UPDATE payment_methods SET is_default = true
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PaymentMethod>(&sql)
            .bind(id)
            .fetch_one(pool)
            .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM payment_methods WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
