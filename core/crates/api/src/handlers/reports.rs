use axum::extract::{Query, State};
use axum::{Extension, Json};
use chrono::NaiveDate;
use heyloaf_common::errors::AppError;
use heyloaf_common::types::ApiResponse;
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;

use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

// --- Response types ---

#[derive(Debug, Serialize, FromRow, ToSchema)]
pub struct HourlySales {
    pub hour: i32,
    pub total: f64,
    pub count: i64,
}

#[derive(Debug, Serialize, FromRow, ToSchema)]
pub struct StockTurnover {
    pub product_id: uuid::Uuid,
    pub product_name: String,
    pub turnover_rate: f64,
}

#[derive(Debug, Serialize, FromRow, ToSchema)]
pub struct ProfitMargin {
    pub product_id: uuid::Uuid,
    pub product_name: String,
    pub selling_price: f64,
    pub cost: f64,
    pub margin_percent: f64,
}

// --- Query params ---

#[derive(Debug, Deserialize)]
pub struct HourlySalesParams {
    pub date: NaiveDate,
}

#[derive(Debug, Deserialize)]
pub struct StockTurnoverParams {
    #[serde(default = "default_days")]
    pub days: i32,
}

const MAX_REPORT_DAYS: i32 = 365;

fn default_days() -> i32 {
    30
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/reports/hourly-sales",
    tag = "reports",
    security(("bearer" = [])),
    params(
        ("date" = NaiveDate, Query, description = "Date in YYYY-MM-DD format"),
    ),
    responses((status = 200, body = inline(ApiResponse<Vec<HourlySales>>)))
)]
pub async fn hourly_sales(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<HourlySalesParams>,
) -> Result<Json<ApiResponse<Vec<HourlySales>>>, AppError> {
    let rows = sqlx::query_as::<_, HourlySales>(
        r"SELECT
            EXTRACT(HOUR FROM created_at)::int AS hour,
            COALESCE(SUM(total), 0) AS total,
            COUNT(*) AS count
        FROM orders
        WHERE company_id = $1
            AND created_at::date = $2
            AND status = 'completed'
        GROUP BY hour
        ORDER BY hour",
    )
    .bind(ctx.company_id)
    .bind(params.date)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(rows)))
}

#[utoipa::path(
    get,
    path = "/api/reports/stock-turnover",
    tag = "reports",
    security(("bearer" = [])),
    params(
        ("days" = Option<i32>, Query, description = "Number of days (default 30)"),
    ),
    responses((status = 200, body = inline(ApiResponse<Vec<StockTurnover>>)))
)]
pub async fn stock_turnover(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<StockTurnoverParams>,
) -> Result<Json<ApiResponse<Vec<StockTurnover>>>, AppError> {
    let days = params.days.clamp(1, MAX_REPORT_DAYS);

    let rows = sqlx::query_as::<_, StockTurnover>(
        r"SELECT
            p.id AS product_id,
            p.name AS product_name,
            CASE
                WHEN COALESCE(s.quantity, 0) = 0 THEN 0
                ELSE COALESCE(sold.total_sold, 0) / s.quantity
            END AS turnover_rate
        FROM products p
        LEFT JOIN stock s ON s.product_id = p.id AND s.company_id = p.company_id
        LEFT JOIN (
            SELECT product_id, SUM(quantity) AS total_sold
            FROM stock_movements
            WHERE company_id = $1
                AND movement_type = 'out'
                AND source = 'sale'
                AND created_at >= NOW() - make_interval(days => $2)
            GROUP BY product_id
        ) sold ON sold.product_id = p.id
        WHERE p.company_id = $1
            AND p.stock_tracking = true
        ORDER BY turnover_rate DESC",
    )
    .bind(ctx.company_id)
    .bind(days)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(rows)))
}

#[utoipa::path(
    get,
    path = "/api/reports/profit-margins",
    tag = "reports",
    security(("bearer" = [])),
    responses((status = 200, body = inline(ApiResponse<Vec<ProfitMargin>>)))
)]
pub async fn profit_margins(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
) -> Result<Json<ApiResponse<Vec<ProfitMargin>>>, AppError> {
    let rows = sqlx::query_as::<_, ProfitMargin>(
        r"SELECT
            p.id AS product_id,
            p.name AS product_name,
            COALESCE(pli.price, 0) AS selling_price,
            COALESCE(p.last_purchase_price, p.calculated_cost, 0) AS cost,
            CASE
                WHEN COALESCE(pli.price, 0) = 0 THEN 0
                ELSE ((pli.price - COALESCE(p.last_purchase_price, p.calculated_cost, 0))
                      / pli.price) * 100
            END AS margin_percent
        FROM products p
        LEFT JOIN LATERAL (
            SELECT pl2.id FROM price_lists pl2
            WHERE pl2.company_id = p.company_id AND pl2.is_default = true
            ORDER BY pl2.updated_at DESC LIMIT 1
        ) pl ON true
        LEFT JOIN price_list_items pli ON pli.price_list_id = pl.id AND pli.product_id = p.id
        WHERE p.company_id = $1
            AND p.status = 'active'
        ORDER BY margin_percent DESC",
    )
    .bind(ctx.company_id)
    .fetch_all(&state.pool)
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(ApiResponse::new(rows)))
}
