use sqlx::PgPool;
use uuid::Uuid;

use crate::models::marketplace_channel::MarketplaceChannel;

pub struct MarketplaceChannelRepository;

impl MarketplaceChannelRepository {
    const SELECT: &str = r"id, company_id, code, name, is_active, created_at, updated_at";

    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<MarketplaceChannel>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM marketplace_channels WHERE id = $1",
            Self::SELECT
        );
        sqlx::query_as::<_, MarketplaceChannel>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
    ) -> Result<Vec<MarketplaceChannel>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM marketplace_channels WHERE company_id = $1 ORDER BY created_at DESC",
            Self::SELECT
        );
        sqlx::query_as::<_, MarketplaceChannel>(&sql)
            .bind(company_id)
            .fetch_all(pool)
            .await
    }

    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        code: &str,
        name: &str,
    ) -> Result<MarketplaceChannel, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO marketplace_channels (company_id, code, name)
            VALUES ($1, $2, $3)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, MarketplaceChannel>(&sql)
            .bind(company_id)
            .bind(code)
            .bind(name)
            .fetch_one(pool)
            .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        code: &str,
        name: &str,
        is_active: bool,
    ) -> Result<MarketplaceChannel, sqlx::Error> {
        let sql = format!(
            r"UPDATE marketplace_channels SET code = $2, name = $3, is_active = $4
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, MarketplaceChannel>(&sql)
            .bind(id)
            .bind(code)
            .bind(name)
            .bind(is_active)
            .fetch_one(pool)
            .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM marketplace_channels WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn has_price_lists(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let count: i64 = sqlx::query_scalar(
            "SELECT COUNT(*) FROM price_lists WHERE marketplace_channel_id = $1",
        )
        .bind(id)
        .fetch_one(pool)
        .await?;
        Ok(count > 0)
    }
}
