use sqlx::PgPool;
use uuid::Uuid;

use crate::models::production_session::ProductionSession;

pub struct ProductionSessionRepository;

impl ProductionSessionRepository {
    const SELECT: &str = r"id, company_id, name, status, items, completed_at,
        completed_by, created_at, updated_at";

    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<ProductionSession>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM production_sessions WHERE id = $1",
            Self::SELECT
        );
        sqlx::query_as::<_, ProductionSession>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        status: Option<&str>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<ProductionSession>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM production_sessions
            WHERE company_id = $1
            AND ($2::text IS NULL OR status = $2)",
        )
        .bind(company_id)
        .bind(status)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM production_sessions
            WHERE company_id = $1
            AND ($2::text IS NULL OR status = $2)
            ORDER BY created_at DESC
            LIMIT $3 OFFSET $4",
            Self::SELECT
        );
        let sessions = sqlx::query_as::<_, ProductionSession>(&sql)
            .bind(company_id)
            .bind(status)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((sessions, total))
    }

    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        name: Option<&str>,
    ) -> Result<ProductionSession, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO production_sessions (company_id, name)
            VALUES ($1, $2)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, ProductionSession>(&sql)
            .bind(company_id)
            .bind(name)
            .fetch_one(pool)
            .await
    }

    pub async fn add_item(
        pool: &PgPool,
        id: Uuid,
        item: &serde_json::Value,
    ) -> Result<ProductionSession, sqlx::Error> {
        let sql = format!(
            r"UPDATE production_sessions SET
                items = items || $2::jsonb
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, ProductionSession>(&sql)
            .bind(id)
            .bind(item)
            .fetch_one(pool)
            .await
    }

    pub async fn complete_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        id: Uuid,
        completed_by: Uuid,
    ) -> Result<ProductionSession, sqlx::Error> {
        let sql = format!(
            r"UPDATE production_sessions SET
                status = 'completed', completed_at = now(), completed_by = $2
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, ProductionSession>(&sql)
            .bind(id)
            .bind(completed_by)
            .fetch_one(executor)
            .await
    }

    pub async fn complete(
        pool: &PgPool,
        id: Uuid,
        completed_by: Uuid,
    ) -> Result<ProductionSession, sqlx::Error> {
        Self::complete_with_executor(pool, id, completed_by).await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM production_sessions WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
