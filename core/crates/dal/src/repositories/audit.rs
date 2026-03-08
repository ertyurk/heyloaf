use sqlx::PgPool;
use uuid::Uuid;

use crate::models::audit::AuditLog;

pub struct AuditRepository;

impl AuditRepository {
    const SELECT: &str = r"id, company_id, entity_type, entity_id,
        action, changes, user_id, created_at";

    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        entity_type: &str,
        entity_id: Uuid,
        action: &str,
        changes: Option<serde_json::Value>,
        user_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            r"INSERT INTO audit_logs
                (company_id, entity_type, entity_id, action, changes, user_id)
            VALUES ($1, $2, $3, $4, $5, $6)",
        )
        .bind(company_id)
        .bind(entity_type)
        .bind(entity_id)
        .bind(action)
        .bind(changes)
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(())
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        entity_type: Option<&str>,
        entity_id: Option<Uuid>,
        action: Option<&str>,
        user_id: Option<Uuid>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<AuditLog>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM audit_logs
            WHERE company_id = $1
            AND ($2::text IS NULL OR entity_type = $2)
            AND ($3::uuid IS NULL OR entity_id = $3)
            AND ($4::text IS NULL OR action = $4)
            AND ($5::uuid IS NULL OR user_id = $5)",
        )
        .bind(company_id)
        .bind(entity_type)
        .bind(entity_id)
        .bind(action)
        .bind(user_id)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM audit_logs
            WHERE company_id = $1
            AND ($2::text IS NULL OR entity_type = $2)
            AND ($3::uuid IS NULL OR entity_id = $3)
            AND ($4::text IS NULL OR action = $4)
            AND ($5::uuid IS NULL OR user_id = $5)
            ORDER BY created_at DESC
            LIMIT $6 OFFSET $7",
            Self::SELECT
        );
        let logs = sqlx::query_as::<_, AuditLog>(&sql)
            .bind(company_id)
            .bind(entity_type)
            .bind(entity_id)
            .bind(action)
            .bind(user_id)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((logs, total))
    }
}
