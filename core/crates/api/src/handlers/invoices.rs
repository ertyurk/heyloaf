use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use chrono::NaiveDate;
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{ApiResponse, PaginatedResponse, PaginationParams};
use heyloaf_dal::models::invoice::Invoice;
use heyloaf_dal::repositories::contact::ContactRepository;
use heyloaf_dal::repositories::invoice::InvoiceRepository;
use heyloaf_dal::repositories::transaction::TransactionRepository;
use heyloaf_services::audit_service::AuditBuilder;
use heyloaf_services::stock_service::StockService;
use serde::Deserialize;
use utoipa::ToSchema;
use uuid::Uuid;
use validator::Validate;

use crate::extractors::validated::ValidatedJson;
use crate::middleware::auth::AuthUser;
use crate::middleware::company_guard::CompanyContext;
use crate::state::AppState;

// --- Request types ---

#[derive(Debug, Deserialize)]
pub struct InvoiceListParams {
    pub invoice_type: Option<String>,
    pub status: Option<String>,
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateInvoiceRequest {
    #[validate(length(min = 1, message = "Invoice type is required"))]
    pub invoice_type: String,
    pub contact_id: Option<Uuid>,
    pub date: NaiveDate,
    pub due_date: Option<NaiveDate>,
    #[serde(default = "default_currency")]
    pub currency_code: String,
    #[serde(default = "default_exchange_rate")]
    pub exchange_rate: f64,
    pub tax_number: Option<String>,
    pub tax_office: Option<String>,
    pub notes: Option<String>,
    pub line_items: serde_json::Value,
    pub subtotal: f64,
    pub tax_total: f64,
    pub grand_total: f64,
    pub base_currency_total: f64,
}

fn default_currency() -> String {
    "TRY".to_string()
}

fn default_exchange_rate() -> f64 {
    1.0
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateInvoiceRequest {
    pub contact_id: Option<Uuid>,
    pub date: NaiveDate,
    pub due_date: Option<NaiveDate>,
    #[serde(default = "default_currency")]
    pub currency_code: String,
    #[serde(default = "default_exchange_rate")]
    pub exchange_rate: f64,
    pub tax_number: Option<String>,
    pub tax_office: Option<String>,
    pub notes: Option<String>,
    pub line_items: serde_json::Value,
    pub subtotal: f64,
    pub tax_total: f64,
    pub grand_total: f64,
    pub base_currency_total: f64,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateInvoiceStatusRequest {
    #[validate(length(min = 1, message = "Status is required"))]
    pub status: String,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/invoices",
    tag = "invoices",
    security(("bearer" = [])),
    params(
        ("invoice_type" = Option<String>, Query, description = "Filter by invoice type"),
        ("status" = Option<String>, Query, description = "Filter by status"),
        ("date_from" = Option<NaiveDate>, Query, description = "Filter by start date"),
        ("date_to" = Option<NaiveDate>, Query, description = "Filter by end date"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<Invoice>)))
)]
pub async fn list_invoices(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<InvoiceListParams>,
) -> Result<Json<PaginatedResponse<Invoice>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (invoices, total) = InvoiceRepository::list(
        &state.pool,
        ctx.company_id,
        params.invoice_type.as_deref(),
        params.status.as_deref(),
        params.date_from,
        params.date_to,
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(
        invoices, total, page, per_page,
    )))
}

#[utoipa::path(
    get,
    path = "/api/invoices/{id}",
    tag = "invoices",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Invoice ID")),
    responses((status = 200, body = inline(ApiResponse<Invoice>)))
)]
pub async fn get_invoice(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Invoice>>, AppError> {
    let invoice = InvoiceRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Invoice not found".into()))?;

    if invoice.company_id != ctx.company_id {
        return Err(AppError::NotFound("Invoice not found".into()));
    }

    Ok(Json(ApiResponse::new(invoice)))
}

#[utoipa::path(
    post,
    path = "/api/invoices",
    tag = "invoices",
    security(("bearer" = [])),
    request_body = CreateInvoiceRequest,
    responses((status = 200, body = inline(ApiResponse<Invoice>)))
)]
pub async fn create_invoice(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateInvoiceRequest>,
) -> Result<Json<ApiResponse<Invoice>>, AppError> {
    // Validate invoice_type against known values
    if body.invoice_type != "purchase" && body.invoice_type != "sale" {
        return Err(AppError::Validation {
            field: "invoice_type".into(),
            message: format!(
                "Unknown invoice type '{}'. Must be 'purchase' or 'sale'",
                body.invoice_type
            ),
        });
    }

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    let invoice_number =
        InvoiceRepository::next_number_with_executor(&mut *tx, ctx.company_id, &body.invoice_type)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    let invoice = InvoiceRepository::create_with_executor(
        &mut *tx,
        ctx.company_id,
        &invoice_number,
        &body.invoice_type,
        body.contact_id,
        body.date,
        body.due_date,
        &body.currency_code,
        body.exchange_rate,
        body.tax_number.as_deref(),
        body.tax_office.as_deref(),
        body.notes.as_deref(),
        &body.line_items,
        body.subtotal,
        body.tax_total,
        body.grand_total,
        body.base_currency_total,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    // Stock movements for purchase/sale invoices
    record_invoice_stock_movements_tx(&mut tx, ctx.company_id, &invoice, auth.user_id).await?;

    // Contact balance update
    let new_balance = apply_invoice_contact_balance_tx(&mut tx, &invoice).await?;

    // Create transaction record for the invoice
    create_invoice_transaction_tx(&mut tx, ctx.company_id, &invoice, new_balance).await?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("invoice", invoice.id)
        .action("create")
        .after(&invoice)
        .emit();

    Ok(Json(ApiResponse::new(invoice)))
}

#[utoipa::path(
    put,
    path = "/api/invoices/{id}",
    tag = "invoices",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Invoice ID")),
    request_body = UpdateInvoiceRequest,
    responses((status = 200, body = inline(ApiResponse<Invoice>)))
)]
pub async fn update_invoice(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdateInvoiceRequest>,
) -> Result<Json<ApiResponse<Invoice>>, AppError> {
    let existing = InvoiceRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Invoice not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Invoice not found".into()));
    }

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    // Reverse old stock movements
    StockService::reverse_movements_tx(&mut tx, "invoice", id, auth.user_id).await?;

    // Reverse old contact balance
    reverse_invoice_contact_balance_tx(&mut tx, &existing).await?;

    // Remove old transaction record
    TransactionRepository::delete_by_reference_with_executor(&mut *tx, "invoice", id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    let invoice = InvoiceRepository::update_with_executor(
        &mut *tx,
        id,
        body.contact_id,
        body.date,
        body.due_date,
        &body.currency_code,
        body.exchange_rate,
        body.tax_number.as_deref(),
        body.tax_office.as_deref(),
        body.notes.as_deref(),
        &body.line_items,
        body.subtotal,
        body.tax_total,
        body.grand_total,
        body.base_currency_total,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    // Re-apply stock movements for new data
    record_invoice_stock_movements_tx(&mut tx, ctx.company_id, &invoice, auth.user_id).await?;

    // Re-apply contact balance
    let new_balance = apply_invoice_contact_balance_tx(&mut tx, &invoice).await?;

    // Create new transaction record
    create_invoice_transaction_tx(&mut tx, ctx.company_id, &invoice, new_balance).await?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("invoice", invoice.id)
        .action("update")
        .before(&existing)
        .after(&invoice)
        .emit();

    Ok(Json(ApiResponse::new(invoice)))
}

#[utoipa::path(
    put,
    path = "/api/invoices/{id}/status",
    tag = "invoices",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Invoice ID")),
    request_body = UpdateInvoiceStatusRequest,
    responses((status = 200, body = inline(ApiResponse<Invoice>)))
)]
pub async fn update_invoice_status(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdateInvoiceStatusRequest>,
) -> Result<Json<ApiResponse<Invoice>>, AppError> {
    let existing = InvoiceRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Invoice not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Invoice not found".into()));
    }

    // Valid status transitions: draft -> pending, pending -> paid/cancelled, paid -> (none)
    let valid_transition = matches!(
        (existing.status.as_str(), body.status.as_str()),
        ("draft", "pending" | "cancelled") | ("pending", "paid" | "cancelled")
    );

    if !valid_transition {
        return Err(AppError::BadRequest(format!(
            "Invalid status transition from '{}' to '{}'",
            existing.status, body.status
        )));
    }

    let invoice = InvoiceRepository::update_status(&state.pool, id, &body.status)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("invoice", invoice.id)
        .action("update_status")
        .before(&existing)
        .after(&invoice)
        .emit();

    Ok(Json(ApiResponse::new(invoice)))
}

#[utoipa::path(
    delete,
    path = "/api/invoices/{id}",
    tag = "invoices",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Invoice ID")),
    responses((status = 200))
)]
pub async fn delete_invoice(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = InvoiceRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Invoice not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Invoice not found".into()));
    }

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    // Reverse stock movements
    StockService::reverse_movements_tx(&mut tx, "invoice", id, auth.user_id).await?;

    // Reverse contact balance
    reverse_invoice_contact_balance_tx(&mut tx, &existing).await?;

    // Remove transaction record
    TransactionRepository::delete_by_reference_with_executor(&mut *tx, "invoice", id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    InvoiceRepository::delete_with_executor(&mut *tx, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("invoice", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Invoice deleted successfully"
    }))))
}

// --- Stock & balance helpers (transactional) ---

/// For purchase invoices, record stock-in for each line item that has a
/// `product_id`. For sales invoices, record stock-out.
async fn record_invoice_stock_movements_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    company_id: Uuid,
    invoice: &Invoice,
    user_id: Uuid,
) -> Result<(), AppError> {
    let items = match invoice.line_items.as_array() {
        Some(arr) => arr,
        None => return Ok(()),
    };

    let (movement_type, source) = match invoice.invoice_type.as_str() {
        "purchase" => ("in", "purchase"),
        "sale" => ("out", "sale"),
        _ => return Ok(()),
    };

    for item in items {
        let Some(product_id) = item
            .get("product_id")
            .and_then(serde_json::Value::as_str)
            .and_then(|s| s.parse::<Uuid>().ok())
        else {
            continue;
        };

        let quantity = item
            .get("quantity")
            .and_then(serde_json::Value::as_f64)
            .unwrap_or(0.0);
        let unit_price = item.get("unit_price").and_then(serde_json::Value::as_f64);
        let vat_rate = item.get("vat_rate").and_then(serde_json::Value::as_f64);
        let description = item
            .get("description")
            .and_then(serde_json::Value::as_str)
            .unwrap_or("");

        StockService::record_movement_tx(
            tx,
            company_id,
            product_id,
            movement_type,
            source,
            quantity,
            unit_price,
            vat_rate,
            Some("invoice"),
            Some(invoice.id),
            Some(description),
            user_id,
        )
        .await?;
    }

    Ok(())
}

/// Apply contact balance delta for the invoice within a transaction.
/// Purchase  -> positive delta (you owe the supplier more).
/// Sale      -> negative delta (customer owes you, reducing their balance).
/// Returns the new balance if a contact was updated.
async fn apply_invoice_contact_balance_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    invoice: &Invoice,
) -> Result<Option<f64>, AppError> {
    let Some(contact_id) = invoice.contact_id else {
        return Ok(None);
    };

    let delta = match invoice.invoice_type.as_str() {
        "purchase" => invoice.grand_total,
        "sale" => -invoice.grand_total,
        _ => return Ok(None),
    };

    let updated = ContactRepository::update_balance_with_executor(&mut **tx, contact_id, delta)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Some(updated.balance))
}

/// Create a transaction record for the given invoice within a DB transaction.
async fn create_invoice_transaction_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    company_id: Uuid,
    invoice: &Invoice,
    balance_after: Option<f64>,
) -> Result<(), AppError> {
    let transaction_type = match invoice.invoice_type.as_str() {
        "purchase" => "purchase",
        "sale" => "invoice",
        _ => return Ok(()),
    };

    let description = format!("Invoice {}", invoice.invoice_number);

    TransactionRepository::create_with_executor(
        &mut **tx,
        company_id,
        invoice.contact_id,
        transaction_type,
        invoice.grand_total,
        invoice.date,
        None,
        Some("invoice"),
        Some(invoice.id),
        balance_after.unwrap_or(0.0),
        Some(description.as_str()),
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(())
}

/// Reverse the contact balance that was applied by the given invoice,
/// within a transaction.
async fn reverse_invoice_contact_balance_tx(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    invoice: &Invoice,
) -> Result<(), AppError> {
    let Some(contact_id) = invoice.contact_id else {
        return Ok(());
    };

    let delta = match invoice.invoice_type.as_str() {
        "purchase" => -invoice.grand_total,
        "sale" => invoice.grand_total,
        _ => return Ok(()),
    };

    ContactRepository::update_balance_with_executor(&mut **tx, contact_id, delta)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(())
}
