use sqlx::PgPool;
use uuid::Uuid;

use crate::models::price_list_item::PriceListItem;

pub struct PriceListItemRepository;

impl PriceListItemRepository {
    const SELECT: &str = r"id, company_id, price_list_id, product_id,
        price, vat_rate, is_active, created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<PriceListItem>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM price_list_items WHERE id = $1",
            Self::SELECT
        );
        sqlx::query_as::<_, PriceListItem>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list_by_price_list(
        pool: &PgPool,
        price_list_id: Uuid,
    ) -> Result<Vec<PriceListItem>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM price_list_items WHERE price_list_id = $1 ORDER BY created_at DESC",
            Self::SELECT
        );
        sqlx::query_as::<_, PriceListItem>(&sql)
            .bind(price_list_id)
            .fetch_all(pool)
            .await
    }

    pub async fn find_by_product(
        pool: &PgPool,
        price_list_id: Uuid,
        product_id: Uuid,
    ) -> Result<Option<PriceListItem>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM price_list_items WHERE price_list_id = $1 AND product_id = $2",
            Self::SELECT
        );
        sqlx::query_as::<_, PriceListItem>(&sql)
            .bind(price_list_id)
            .bind(product_id)
            .fetch_optional(pool)
            .await
    }

    pub async fn upsert(
        pool: &PgPool,
        company_id: Uuid,
        price_list_id: Uuid,
        product_id: Uuid,
        price: f64,
        vat_rate: Option<f64>,
    ) -> Result<PriceListItem, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO price_list_items
                (company_id, price_list_id, product_id, price, vat_rate)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (price_list_id, product_id)
            DO UPDATE SET price = EXCLUDED.price, vat_rate = EXCLUDED.vat_rate
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PriceListItem>(&sql)
            .bind(company_id)
            .bind(price_list_id)
            .bind(product_id)
            .bind(price)
            .bind(vat_rate)
            .fetch_one(pool)
            .await
    }

    pub async fn update_active(
        pool: &PgPool,
        id: Uuid,
        company_id: Uuid,
        is_active: bool,
    ) -> Result<PriceListItem, sqlx::Error> {
        let sql = format!(
            r"UPDATE price_list_items SET is_active = $2
            WHERE id = $1 AND company_id = $3
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PriceListItem>(&sql)
            .bind(id)
            .bind(is_active)
            .bind(company_id)
            .fetch_one(pool)
            .await
    }

    pub async fn delete(
        pool: &PgPool,
        id: Uuid,
        company_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM price_list_items WHERE id = $1 AND company_id = $2")
            .bind(id)
            .bind(company_id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn bulk_upsert(
        pool: &PgPool,
        company_id: Uuid,
        price_list_id: Uuid,
        items: &[(Uuid, f64, Option<f64>)],
    ) -> Result<Vec<PriceListItem>, sqlx::Error> {
        let product_ids: Vec<Uuid> = items.iter().map(|(id, _, _)| *id).collect();
        let prices: Vec<f64> = items.iter().map(|(_, p, _)| *p).collect();
        let vat_rates: Vec<Option<f64>> = items.iter().map(|(_, _, v)| *v).collect();

        let sql = format!(
            r"INSERT INTO price_list_items
                (company_id, price_list_id, product_id, price, vat_rate)
            SELECT $1, $2, unnest($3::uuid[]), unnest($4::double precision[]),
                   unnest($5::double precision[])
            ON CONFLICT (price_list_id, product_id)
            DO UPDATE SET price = EXCLUDED.price, vat_rate = EXCLUDED.vat_rate
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PriceListItem>(&sql)
            .bind(company_id)
            .bind(price_list_id)
            .bind(&product_ids)
            .bind(&prices)
            .bind(&vat_rates)
            .fetch_all(pool)
            .await
    }
}
