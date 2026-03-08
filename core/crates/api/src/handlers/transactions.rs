use axum::extract::{Query, State};
use axum::{Extension, Json};
use chrono::NaiveDate;
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{PaginatedResponse, PaginationParams};
use heyloaf_dal::models::transaction::Transaction;
use heyloaf_dal::repositories::transaction::TransactionRepository;
use serde::Deserialize;
use uuid::Uuid;

use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

// --- Request types ---

#[derive(Debug, Deserialize)]
pub struct TransactionListParams {
    pub contact_id: Option<Uuid>,
    #[serde(rename = "type")]
    pub transaction_type: Option<String>,
    pub payment_method_id: Option<Uuid>,
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
    pub search: Option<String>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/transactions",
    tag = "transactions",
    security(("bearer" = [])),
    params(
        ("contact_id" = Option<Uuid>, Query, description = "Filter by contact"),
        ("type" = Option<String>, Query, description = "Filter by transaction type"),
        ("payment_method_id" = Option<Uuid>, Query, description = "Filter by payment method"),
        ("date_from" = Option<NaiveDate>, Query, description = "Filter by start date"),
        ("date_to" = Option<NaiveDate>, Query, description = "Filter by end date"),
        ("search" = Option<String>, Query, description = "Search by description"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<Transaction>)))
)]
pub async fn list_transactions(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<TransactionListParams>,
) -> Result<Json<PaginatedResponse<Transaction>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (transactions, total) = TransactionRepository::list_all(
        &state.pool,
        ctx.company_id,
        params.contact_id,
        params.transaction_type.as_deref(),
        params.payment_method_id,
        params.date_from,
        params.date_to,
        params.search.as_deref(),
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(
        transactions, total, page, per_page,
    )))
}
