use sqlx::PgPool;
use uuid::Uuid;

use crate::models::price_list::PriceList;

pub struct PriceListRepository;

impl PriceListRepository {
    const SELECT: &str = r"id, company_id, name, channel_type::text,
        marketplace_channel_id, city, is_active, is_default,
        created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<PriceList>, sqlx::Error> {
        let sql = format!("SELECT {} FROM price_lists WHERE id = $1", Self::SELECT);
        sqlx::query_as::<_, PriceList>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(pool: &PgPool, company_id: Uuid) -> Result<Vec<PriceList>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM price_lists WHERE company_id = $1 ORDER BY created_at DESC",
            Self::SELECT
        );
        sqlx::query_as::<_, PriceList>(&sql)
            .bind(company_id)
            .fetch_all(pool)
            .await
    }

    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        name: &str,
        channel_type: &str,
        marketplace_channel_id: Option<Uuid>,
        city: Option<&str>,
        is_default: bool,
    ) -> Result<PriceList, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO price_lists
                (company_id, name, channel_type, marketplace_channel_id, city, is_default)
            VALUES ($1, $2, $3::channel_type, $4, $5, $6)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PriceList>(&sql)
            .bind(company_id)
            .bind(name)
            .bind(channel_type)
            .bind(marketplace_channel_id)
            .bind(city)
            .bind(is_default)
            .fetch_one(pool)
            .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: &str,
        channel_type: &str,
        marketplace_channel_id: Option<Uuid>,
        city: Option<&str>,
        is_active: bool,
    ) -> Result<PriceList, sqlx::Error> {
        let sql = format!(
            r"UPDATE price_lists SET
                name = $2, channel_type = $3::channel_type,
                marketplace_channel_id = $4, city = $5, is_active = $6
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PriceList>(&sql)
            .bind(id)
            .bind(name)
            .bind(channel_type)
            .bind(marketplace_channel_id)
            .bind(city)
            .bind(is_active)
            .fetch_one(pool)
            .await
    }

    pub async fn set_default(
        pool: &PgPool,
        company_id: Uuid,
        id: Uuid,
    ) -> Result<PriceList, sqlx::Error> {
        // Clear previous default
        sqlx::query(
            "UPDATE price_lists SET is_default = false WHERE company_id = $1 AND is_default = true",
        )
        .bind(company_id)
        .execute(pool)
        .await?;

        // Set new default
        let sql = format!(
            r"UPDATE price_lists SET is_default = true
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PriceList>(&sql)
            .bind(id)
            .fetch_one(pool)
            .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM price_lists WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
