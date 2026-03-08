use sqlx::PgPool;
use uuid::Uuid;

use crate::models::product::Product;

pub struct ProductRepository;

impl ProductRepository {
    const SELECT: &str = r"id, company_id, name, code, barcode, category_id,
        product_type::text, status::text, stock_status::text,
        unit_of_measure, sale_unit_type, plu_type, plu_code, scale_enabled,
        tax_rate, stock_tracking, min_stock_level, last_purchase_price,
        calculated_cost, image_url, recipe, purchase_options,
        created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Product>, sqlx::Error> {
        let sql = format!("SELECT {} FROM products WHERE id = $1", Self::SELECT);
        sqlx::query_as::<_, Product>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        product_type: Option<&str>,
        status: Option<&str>,
        category_id: Option<Uuid>,
        search: Option<&str>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<Product>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;
        let search_pattern = search.map(|s| format!("%{}%", s.to_lowercase()));

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM products
            WHERE company_id = $1
            AND ($2::text IS NULL OR product_type = $2::product_type)
            AND ($3::text IS NULL OR status = $3::product_status)
            AND ($4::uuid IS NULL OR category_id = $4)
            AND ($5::text IS NULL OR LOWER(name) LIKE $5 OR LOWER(code) LIKE $5 OR barcode LIKE $5)",
        )
        .bind(company_id)
        .bind(product_type)
        .bind(status)
        .bind(category_id)
        .bind(&search_pattern)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM products
            WHERE company_id = $1
            AND ($2::text IS NULL OR product_type = $2::product_type)
            AND ($3::text IS NULL OR status = $3::product_status)
            AND ($4::uuid IS NULL OR category_id = $4)
            AND ($5::text IS NULL OR LOWER(name) LIKE $5 OR LOWER(code) LIKE $5 OR barcode LIKE $5)
            ORDER BY created_at DESC
            LIMIT $6 OFFSET $7",
            Self::SELECT
        );
        let products = sqlx::query_as::<_, Product>(&sql)
            .bind(company_id)
            .bind(product_type)
            .bind(status)
            .bind(category_id)
            .bind(&search_pattern)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((products, total))
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        name: &str,
        code: Option<&str>,
        barcode: Option<&str>,
        category_id: Option<Uuid>,
        product_type: &str,
        unit_of_measure: &str,
        tax_rate: Option<f64>,
        stock_tracking: bool,
    ) -> Result<Product, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO products (company_id, name, code, barcode, category_id, product_type, unit_of_measure, tax_rate, stock_tracking)
            VALUES ($1, $2, $3, $4, $5, $6::product_type, $7, $8, $9)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Product>(&sql)
            .bind(company_id)
            .bind(name)
            .bind(code)
            .bind(barcode)
            .bind(category_id)
            .bind(product_type)
            .bind(unit_of_measure)
            .bind(tax_rate)
            .bind(stock_tracking)
            .fetch_one(pool)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: &str,
        code: Option<&str>,
        barcode: Option<&str>,
        category_id: Option<Uuid>,
        status: &str,
        stock_status: &str,
        unit_of_measure: &str,
        sale_unit_type: Option<&str>,
        plu_type: Option<&str>,
        plu_code: Option<&str>,
        scale_enabled: bool,
        tax_rate: Option<f64>,
        stock_tracking: bool,
        min_stock_level: Option<f64>,
        image_url: Option<&str>,
    ) -> Result<Product, sqlx::Error> {
        let sql = format!(
            r"UPDATE products SET
                name = $2, code = $3, barcode = $4, category_id = $5,
                status = $6::product_status, stock_status = $7::stock_status,
                unit_of_measure = $8, sale_unit_type = $9, plu_type = $10,
                plu_code = $11, scale_enabled = $12, tax_rate = $13,
                stock_tracking = $14, min_stock_level = $15, image_url = $16
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Product>(&sql)
            .bind(id)
            .bind(name)
            .bind(code)
            .bind(barcode)
            .bind(category_id)
            .bind(status)
            .bind(stock_status)
            .bind(unit_of_measure)
            .bind(sale_unit_type)
            .bind(plu_type)
            .bind(plu_code)
            .bind(scale_enabled)
            .bind(tax_rate)
            .bind(stock_tracking)
            .bind(min_stock_level)
            .bind(image_url)
            .fetch_one(pool)
            .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM products WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn bulk_update_status(
        pool: &PgPool,
        ids: &[Uuid],
        status: &str,
    ) -> Result<u64, sqlx::Error> {
        let result =
            sqlx::query("UPDATE products SET status = $2::product_status WHERE id = ANY($1)")
                .bind(ids)
                .bind(status)
                .execute(pool)
                .await?;
        Ok(result.rows_affected())
    }

    pub async fn bulk_update_category(
        pool: &PgPool,
        ids: &[Uuid],
        category_id: Option<Uuid>,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query("UPDATE products SET category_id = $2 WHERE id = ANY($1)")
            .bind(ids)
            .bind(category_id)
            .execute(pool)
            .await?;
        Ok(result.rows_affected())
    }
}
