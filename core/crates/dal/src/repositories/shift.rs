use serde::Serialize;
use sqlx::{FromRow, PgPool};
use utoipa::ToSchema;
use uuid::Uuid;

use crate::models::shift::Shift;

#[derive(Debug, Clone, Serialize, FromRow, ToSchema)]
pub struct PaymentMethodSummary {
    pub method_name: String,
    pub count: i64,
    pub total: f64,
}

#[derive(Debug, Clone, Serialize, FromRow)]
pub struct ShiftOrderStats {
    pub total_sales: f64,
    pub total_orders: i64,
    pub total_items_sold: i64,
    pub voided_orders: i64,
    pub returned_orders: i64,
    pub cash_sales: f64,
}

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
        company_id: Uuid,
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
            WHERE id = $1 AND company_id = $5
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Shift>(&sql)
            .bind(id)
            .bind(closing_balance)
            .bind(expected_balance)
            .bind(notes)
            .bind(company_id)
            .fetch_one(pool)
            .await
    }

    /// Aggregate order stats for a shift (completed orders only for totals,
    /// plus counts of voided/returned).
    pub async fn order_stats(
        pool: &PgPool,
        shift_id: Uuid,
        default_cash_method_id: Option<Uuid>,
    ) -> Result<ShiftOrderStats, sqlx::Error> {
        let row = sqlx::query_as::<_, ShiftOrderStats>(
            r"SELECT
                COALESCE(SUM(CASE WHEN status = 'completed' THEN total ELSE 0 END), 0)
                    AS total_sales,
                COUNT(*) FILTER (WHERE status = 'completed')
                    AS total_orders,
                COALESCE(
                    (SELECT SUM(oi.quantity)::bigint
                     FROM order_items oi
                     JOIN orders o2 ON o2.id = oi.order_id
                     WHERE o2.shift_id = $1 AND o2.status = 'completed'),
                    0
                ) AS total_items_sold,
                COUNT(*) FILTER (WHERE status = 'voided')
                    AS voided_orders,
                COUNT(*) FILTER (WHERE status = 'returned')
                    AS returned_orders,
                COALESCE(SUM(
                    CASE WHEN status = 'completed'
                         AND payment_method_id = $2
                    THEN total ELSE 0 END
                ), 0) AS cash_sales
            FROM orders
            WHERE shift_id = $1",
        )
        .bind(shift_id)
        .bind(default_cash_method_id)
        .fetch_one(pool)
        .await?;

        Ok(row)
    }

    /// Payment method breakdown for a shift (completed orders only).
    pub async fn payment_method_breakdown(
        pool: &PgPool,
        shift_id: Uuid,
    ) -> Result<Vec<PaymentMethodSummary>, sqlx::Error> {
        sqlx::query_as::<_, PaymentMethodSummary>(
            r"SELECT
                COALESCE(pm.name, 'Unknown') AS method_name,
                COUNT(*) AS count,
                COALESCE(SUM(o.total), 0) AS total
            FROM orders o
            LEFT JOIN payment_methods pm ON pm.id = o.payment_method_id
            WHERE o.shift_id = $1 AND o.status = 'completed'
            GROUP BY pm.name
            ORDER BY total DESC",
        )
        .bind(shift_id)
        .fetch_all(pool)
        .await
    }

    /// Find the "Cash" payment method for a company (first method whose name
    /// case-insensitively matches "cash", or the default method).
    pub async fn find_cash_payment_method_id(
        pool: &PgPool,
        company_id: Uuid,
    ) -> Result<Option<Uuid>, sqlx::Error> {
        let id: Option<Uuid> = sqlx::query_scalar(
            r"SELECT id FROM payment_methods
            WHERE company_id = $1
            ORDER BY (LOWER(name) = 'cash') DESC, is_default DESC
            LIMIT 1",
        )
        .bind(company_id)
        .fetch_optional(pool)
        .await?;

        Ok(id)
    }
}
