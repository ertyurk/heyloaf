use sqlx::PgPool;
use uuid::Uuid;

use crate::models::shift::Shift;

pub struct ShiftRepository;

impl ShiftRepository {
    const SELECT: &str = r"id, company_id, terminal_id, cashier_id,
        opening_balance, closing_balance, expected_balance,
        status::text, opened_at, closed_at, notes,
        created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Shift>, sqlx::Error> {
        let sql = format!("SELECT {} FROM shifts WHERE id = $1", Self::SELECT);
        sqlx::query_as::<_, Shift>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn find_open(
        pool: &PgPool,
        company_id: Uuid,
        cashier_id: Uuid,
    ) -> Result<Option<Shift>, sqlx::Error> {
        let sql = format!(
            r"SELECT {} FROM shifts
            WHERE company_id = $1
            AND cashier_id = $2
            AND status = 'open'
            ORDER BY opened_at DESC
            LIMIT 1",
            Self::SELECT
        );
        sqlx::query_as::<_, Shift>(&sql)
            .bind(company_id)
            .bind(cashier_id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        status: Option<&str>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<Shift>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM shifts
            WHERE company_id = $1
            AND ($2::text IS NULL OR status = $2::shift_status)",
        )
        .bind(company_id)
        .bind(status)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM shifts
            WHERE company_id = $1
            AND ($2::text IS NULL OR status = $2::shift_status)
            ORDER BY opened_at DESC
            LIMIT $3 OFFSET $4",
            Self::SELECT
        );
        let shifts = sqlx::query_as::<_, Shift>(&sql)
            .bind(company_id)
            .bind(status)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((shifts, total))
    }

    pub async fn open(
        pool: &PgPool,
        company_id: Uuid,
        cashier_id: Uuid,
        terminal_id: Option<Uuid>,
        opening_balance: f64,
    ) -> Result<Shift, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO shifts (company_id, cashier_id, terminal_id, opening_balance)
            VALUES ($1, $2, $3, $4)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Shift>(&sql)
            .bind(company_id)
            .bind(cashier_id)
            .bind(terminal_id)
            .bind(opening_balance)
            .fetch_one(pool)
            .await
    }

    pub async fn close(
        pool: &PgPool,
        id: Uuid,
        closing_balance: f64,
        expected_balance: Option<f64>,
        notes: Option<&str>,
    ) -> Result<Shift, sqlx::Error> {
        let sql = format!(
            r"UPDATE shifts SET
                status = 'closed'::shift_status,
                closing_balance = $2,
                expected_balance = $3,
                notes = $4,
                closed_at = now()
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Shift>(&sql)
            .bind(id)
            .bind(closing_balance)
            .bind(expected_balance)
            .bind(notes)
            .fetch_one(pool)
            .await
    }
}
