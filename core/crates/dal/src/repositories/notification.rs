use sqlx::PgPool;
use uuid::Uuid;

use crate::models::notification::Notification;

pub struct NotificationRepository;

impl NotificationRepository {
    const SELECT: &str = r"id, company_id, user_id, notification_type::text,
        title, message, is_read, entity_type, entity_id, created_at";

    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        user_id: Option<Uuid>,
        is_read: Option<bool>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<Notification>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM notifications
            WHERE company_id = $1
            AND ($2::uuid IS NULL OR user_id = $2)
            AND ($3::bool IS NULL OR is_read = $3)",
        )
        .bind(company_id)
        .bind(user_id)
        .bind(is_read)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM notifications
            WHERE company_id = $1
            AND ($2::uuid IS NULL OR user_id = $2)
            AND ($3::bool IS NULL OR is_read = $3)
            ORDER BY created_at DESC
            LIMIT $4 OFFSET $5",
            Self::SELECT
        );
        let notifications = sqlx::query_as::<_, Notification>(&sql)
            .bind(company_id)
            .bind(user_id)
            .bind(is_read)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((notifications, total))
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        user_id: Option<Uuid>,
        notification_type: &str,
        title: &str,
        message: &str,
        entity_type: Option<&str>,
        entity_id: Option<Uuid>,
    ) -> Result<Notification, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO notifications
                (company_id, user_id, notification_type, title, message,
                 entity_type, entity_id)
            VALUES ($1, $2, $3::notification_type, $4, $5, $6, $7)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Notification>(&sql)
            .bind(company_id)
            .bind(user_id)
            .bind(notification_type)
            .bind(title)
            .bind(message)
            .bind(entity_type)
            .bind(entity_id)
            .fetch_one(pool)
            .await
    }

    pub async fn mark_read(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("UPDATE notifications SET is_read = true WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn mark_all_read(
        pool: &PgPool,
        company_id: Uuid,
        user_id: Uuid,
    ) -> Result<u64, sqlx::Error> {
        let result = sqlx::query(
            r"UPDATE notifications SET is_read = true
            WHERE company_id = $1 AND user_id = $2 AND is_read = false",
        )
        .bind(company_id)
        .bind(user_id)
        .execute(pool)
        .await?;
        Ok(result.rows_affected())
    }

    pub async fn count_unread(
        pool: &PgPool,
        company_id: Uuid,
        user_id: Uuid,
    ) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar(
            r"SELECT COUNT(*) FROM notifications
            WHERE company_id = $1 AND user_id = $2 AND is_read = false",
        )
        .bind(company_id)
        .bind(user_id)
        .fetch_one(pool)
        .await
    }

    /// Check if an unread notification already exists for a given entity.
    pub async fn exists_unread(
        pool: &PgPool,
        company_id: Uuid,
        entity_type: &str,
        entity_id: Uuid,
    ) -> Result<bool, sqlx::Error> {
        let count: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM notifications
            WHERE company_id = $1
            AND entity_type = $2
            AND entity_id = $3
            AND is_read = false",
        )
        .bind(company_id)
        .bind(entity_type)
        .bind(entity_id)
        .fetch_one(pool)
        .await?;

        Ok(count > 0)
    }
}
