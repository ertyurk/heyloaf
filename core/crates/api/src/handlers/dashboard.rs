use axum::extract::State;
use axum::{Extension, Json};
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use serde::Serialize;
use utoipa::ToSchema;
use uuid::Uuid;

use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

// --- Response types ---

#[derive(Debug, Serialize, ToSchema)]
pub struct DashboardData {
    pub today_sales_total: f64,
    pub today_sales_count: i64,
    pub low_stock_count: i64,
    pub outstanding_receivables: f64,
    pub outstanding_payables: f64,
    pub today_production_count: i64,
}

// --- Helpers ---
// NOTE: These inline SQL queries are intentionally placed here rather than in a
// repository because they are read-only aggregation queries that span multiple
// tables. They do not belong to any single repository per the "repos are 1:1
// with tables" convention.

async fn query_today_sales_total(
    pool: &sqlx::PgPool,
    company_id: Uuid,
) -> Result<f64, sqlx::Error> {
    let val: Option<f64> = sqlx::query_scalar(
        r"SELECT COALESCE(SUM(total), 0)
        FROM orders
        WHERE company_id = $1
        AND created_at >= CURRENT_DATE
        AND status = 'completed'",
    )
    .bind(company_id)
    .fetch_one(pool)
    .await?;
    Ok(val.unwrap_or(0.0))
}

async fn query_today_sales_count(
    pool: &sqlx::PgPool,
    company_id: Uuid,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        r"SELECT COUNT(*)
        FROM orders
        WHERE company_id = $1
        AND created_at >= CURRENT_DATE
        AND status = 'completed'",
    )
    .bind(company_id)
    .fetch_one(pool)
    .await
}

async fn query_low_stock_count(pool: &sqlx::PgPool, company_id: Uuid) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        r"SELECT COUNT(*)
        FROM stock s
        JOIN products p ON p.id = s.product_id
        WHERE s.company_id = $1
        AND p.stock_tracking = true
        AND s.min_level IS NOT NULL
        AND s.quantity <= s.min_level",
    )
    .bind(company_id)
    .fetch_one(pool)
    .await
}

async fn query_outstanding_receivables(
    pool: &sqlx::PgPool,
    company_id: Uuid,
) -> Result<f64, sqlx::Error> {
    let val: Option<f64> = sqlx::query_scalar(
        r"SELECT COALESCE(SUM(balance), 0)
        FROM contacts
        WHERE company_id = $1
        AND balance > 0",
    )
    .bind(company_id)
    .fetch_one(pool)
    .await?;
    Ok(val.unwrap_or(0.0))
}

async fn query_outstanding_payables(
    pool: &sqlx::PgPool,
    company_id: Uuid,
) -> Result<f64, sqlx::Error> {
    let val: Option<f64> = sqlx::query_scalar(
        r"SELECT COALESCE(ABS(SUM(balance)), 0)
        FROM contacts
        WHERE company_id = $1
        AND balance < 0",
    )
    .bind(company_id)
    .fetch_one(pool)
    .await?;
    Ok(val.unwrap_or(0.0))
}

async fn query_today_production_count(
    pool: &sqlx::PgPool,
    company_id: Uuid,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar(
        r"SELECT COUNT(*)
        FROM production_records
        WHERE company_id = $1
        AND produced_at >= CURRENT_DATE",
    )
    .bind(company_id)
    .fetch_one(pool)
    .await
}

// --- Handler ---

#[utoipa::path(
    get,
    path = "/api/dashboard",
    tag = "dashboard",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<DashboardData>)))
)]
pub async fn get_dashboard(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<DashboardData>>, AppError> {
    let (
        today_sales_total,
        today_sales_count,
        low_stock_count,
        outstanding_receivables,
        outstanding_payables,
        today_production_count,
    ) = tokio::try_join!(
        query_today_sales_total(&state.pool, ctx.company_id),
        query_today_sales_count(&state.pool, ctx.company_id),
        query_low_stock_count(&state.pool, ctx.company_id),
        query_outstanding_receivables(&state.pool, ctx.company_id),
        query_outstanding_payables(&state.pool, ctx.company_id),
        query_today_production_count(&state.pool, ctx.company_id),
    )
    .map_err(|e| AppError::Database(e.to_string()))?;

    // Fire-and-forget: generate notifications for low stock and overdue
    // invoices on each dashboard load.
    let svc = state.notifications.clone();
    let company_id = ctx.company_id;
    tokio::spawn(async move {
        if let Err(e) = svc.check_low_stock(company_id).await {
            tracing::error!(
                error = %e,
                "Failed to check low stock notifications"
            );
        }
        if let Err(e) = svc.check_overdue_invoices(company_id).await {
            tracing::error!(
                error = %e,
                "Failed to check overdue invoice notifications"
            );
        }
    });

    Ok(Json(ApiResponse::new(DashboardData {
        today_sales_total,
        today_sales_count,
        low_stock_count,
        outstanding_receivables,
        outstanding_payables,
        today_production_count,
    })))
}
