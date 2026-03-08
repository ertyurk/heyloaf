use sqlx::PgPool;
use uuid::Uuid;

use crate::models::category::Category;

pub struct CategoryRepository;

impl CategoryRepository {
    const SELECT: &str = "id, company_id, name, description, parent_id, display_order, pos_visible, status::text, depth, created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Category>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM product_categories WHERE id = $1",
            Self::SELECT
        );
        sqlx::query_as::<_, Category>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(pool: &PgPool, company_id: Uuid) -> Result<Vec<Category>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM product_categories WHERE company_id = $1 ORDER BY display_order, name",
            Self::SELECT
        );
        sqlx::query_as::<_, Category>(&sql)
            .bind(company_id)
            .fetch_all(pool)
            .await
    }

    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        name: &str,
        description: Option<&str>,
        parent_id: Option<Uuid>,
        display_order: i32,
        pos_visible: bool,
    ) -> Result<Category, sqlx::Error> {
        let depth = if let Some(pid) = parent_id {
            let parent =
                sqlx::query_scalar::<_, i32>("SELECT depth FROM product_categories WHERE id = $1")
                    .bind(pid)
                    .fetch_one(pool)
                    .await?;
            parent + 1
        } else {
            0
        };

        let sql = format!(
            r"INSERT INTO product_categories (company_id, name, description, parent_id, display_order, pos_visible, depth)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Category>(&sql)
            .bind(company_id)
            .bind(name)
            .bind(description)
            .bind(parent_id)
            .bind(display_order)
            .bind(pos_visible)
            .bind(depth)
            .fetch_one(pool)
            .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: &str,
        description: Option<&str>,
        display_order: i32,
        pos_visible: bool,
    ) -> Result<Category, sqlx::Error> {
        let sql = format!(
            r"UPDATE product_categories SET name = $2, description = $3, display_order = $4, pos_visible = $5
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Category>(&sql)
            .bind(id)
            .bind(name)
            .bind(description)
            .bind(display_order)
            .bind(pos_visible)
            .fetch_one(pool)
            .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM product_categories WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn has_children(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let count: i64 =
            sqlx::query_scalar("SELECT COUNT(*) FROM product_categories WHERE parent_id = $1")
                .bind(id)
                .fetch_one(pool)
                .await?;
        Ok(count > 0)
    }

    pub async fn has_products(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM products WHERE category_id = $1")
            .bind(id)
            .fetch_one(pool)
            .await?;
        Ok(count > 0)
    }
}
