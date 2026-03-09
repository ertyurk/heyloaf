use axum::extract::{Path, Query, State};
use axum::{Extension, Json};
use chrono::NaiveDate;
use heyloaf_common::errors::AppError;
use heyloaf_common::types::{ApiResponse, PaginatedResponse, PaginationParams};
use heyloaf_dal::models::contact::Contact;
use heyloaf_dal::models::transaction::Transaction;
use heyloaf_dal::repositories::contact::ContactRepository;
use heyloaf_dal::repositories::transaction::TransactionRepository;
use heyloaf_services::audit_service::AuditBuilder;
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
pub struct ContactListParams {
    pub contact_type: Option<String>,
    pub status: Option<String>,
    pub search: Option<String>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct CreateContactRequest {
    #[validate(length(min = 1, message = "Contact name is required"))]
    pub name: String,
    pub contact_person: Option<String>,
    #[validate(length(min = 1, message = "Contact type is required"))]
    pub contact_type: String,
    pub tax_number: Option<String>,
    pub tax_office: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub credit_limit: Option<f64>,
    pub notes: Option<String>,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct UpdateContactRequest {
    #[validate(length(min = 1, message = "Contact name is required"))]
    pub name: String,
    pub contact_person: Option<String>,
    #[validate(length(min = 1, message = "Contact type is required"))]
    pub contact_type: String,
    pub tax_number: Option<String>,
    pub tax_office: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub credit_limit: Option<f64>,
    pub notes: Option<String>,
    #[validate(length(min = 1, message = "Status is required"))]
    pub status: String,
}

#[derive(Debug, Deserialize)]
pub struct ContactTransactionListParams {
    pub transaction_type: Option<String>,
    pub date_from: Option<NaiveDate>,
    pub date_to: Option<NaiveDate>,
    #[serde(flatten)]
    pub pagination: PaginationParams,
}

#[derive(Debug, Deserialize, Validate, ToSchema)]
pub struct RecordPaymentRequest {
    #[validate(range(min = 0.01, message = "Amount must be greater than zero"))]
    pub amount: f64,
    pub payment_method_id: Option<Uuid>,
    pub description: Option<String>,
    pub date: Option<NaiveDate>,
}

// --- Handlers ---

#[utoipa::path(
    get,
    path = "/api/contacts",
    tag = "contacts",
    security(("bearer" = [])),
    params(
        ("contact_type" = Option<String>, Query, description = "Filter by contact type"),
        ("status" = Option<String>, Query, description = "Filter by status"),
        ("search" = Option<String>, Query, description = "Search by name, contact person, phone, or email"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<Contact>)))
)]
pub async fn list_contacts(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Query(params): Query<ContactListParams>,
) -> Result<Json<PaginatedResponse<Contact>>, AppError> {
    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (contacts, total) = ContactRepository::list(
        &state.pool,
        ctx.company_id,
        params.contact_type.as_deref(),
        params.status.as_deref(),
        params.search.as_deref(),
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(
        contacts, total, page, per_page,
    )))
}

#[utoipa::path(
    get,
    path = "/api/contacts/{id}",
    tag = "contacts",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Contact ID")),
    responses((status = 200, body = inline(ApiResponse<Contact>)))
)]
pub async fn get_contact(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<Contact>>, AppError> {
    let contact = ContactRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Contact not found".into()))?;

    if contact.company_id != ctx.company_id {
        return Err(AppError::NotFound("Contact not found".into()));
    }

    Ok(Json(ApiResponse::new(contact)))
}

#[utoipa::path(
    post,
    path = "/api/contacts",
    tag = "contacts",
    security(("bearer" = [])),
    request_body = CreateContactRequest,
    responses((status = 200, body = inline(ApiResponse<Contact>)))
)]
pub async fn create_contact(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    ValidatedJson(body): ValidatedJson<CreateContactRequest>,
) -> Result<Json<ApiResponse<Contact>>, AppError> {
    let contact = ContactRepository::create(
        &state.pool,
        ctx.company_id,
        &body.name,
        body.contact_person.as_deref(),
        &body.contact_type,
        body.tax_number.as_deref(),
        body.tax_office.as_deref(),
        body.phone.as_deref(),
        body.email.as_deref(),
        body.address.as_deref(),
        body.credit_limit,
        body.notes.as_deref(),
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("contact", contact.id)
        .action("create")
        .after(&contact)
        .emit();

    Ok(Json(ApiResponse::new(contact)))
}

#[utoipa::path(
    put,
    path = "/api/contacts/{id}",
    tag = "contacts",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Contact ID")),
    request_body = UpdateContactRequest,
    responses((status = 200, body = inline(ApiResponse<Contact>)))
)]
pub async fn update_contact(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<UpdateContactRequest>,
) -> Result<Json<ApiResponse<Contact>>, AppError> {
    let existing = ContactRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Contact not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Contact not found".into()));
    }

    let contact = ContactRepository::update(
        &state.pool,
        id,
        ctx.company_id,
        &body.name,
        body.contact_person.as_deref(),
        &body.contact_type,
        body.tax_number.as_deref(),
        body.tax_office.as_deref(),
        body.phone.as_deref(),
        body.email.as_deref(),
        body.address.as_deref(),
        body.credit_limit,
        body.notes.as_deref(),
        &body.status,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("contact", contact.id)
        .action("update")
        .before(&existing)
        .after(&contact)
        .emit();

    Ok(Json(ApiResponse::new(contact)))
}

#[utoipa::path(
    delete,
    path = "/api/contacts/{id}",
    tag = "contacts",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Contact ID")),
    responses((status = 200))
)]
pub async fn delete_contact(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let existing = ContactRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Contact not found".into()))?;

    if existing.company_id != ctx.company_id {
        return Err(AppError::NotFound("Contact not found".into()));
    }

    let has_invoices = ContactRepository::has_invoices(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    if has_invoices {
        return Err(AppError::BadRequest(
            "Cannot delete contact with existing invoices".into(),
        ));
    }

    ContactRepository::delete(&state.pool, id, ctx.company_id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("contact", id)
        .action("delete")
        .before(&existing)
        .emit();

    Ok(Json(ApiResponse::new(serde_json::json!({
        "message": "Contact deleted successfully"
    }))))
}

#[utoipa::path(
    get,
    path = "/api/contacts/{id}/transactions",
    tag = "contacts",
    security(("bearer" = [])),
    params(
        ("id" = Uuid, Path, description = "Contact ID"),
        ("transaction_type" = Option<String>, Query, description = "Filter by transaction type"),
        ("date_from" = Option<NaiveDate>, Query, description = "Filter by start date"),
        ("date_to" = Option<NaiveDate>, Query, description = "Filter by end date"),
        ("page" = Option<u32>, Query, description = "Page number"),
        ("per_page" = Option<u32>, Query, description = "Items per page"),
    ),
    responses((status = 200, body = inline(PaginatedResponse<Transaction>)))
)]
pub async fn list_contact_transactions(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Path(id): Path<Uuid>,
    Query(params): Query<ContactTransactionListParams>,
) -> Result<Json<PaginatedResponse<Transaction>>, AppError> {
    let contact = ContactRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Contact not found".into()))?;

    if contact.company_id != ctx.company_id {
        return Err(AppError::NotFound("Contact not found".into()));
    }

    let page = params.pagination.page();
    let per_page = params.pagination.per_page();

    let (transactions, total) = TransactionRepository::list(
        &state.pool,
        ctx.company_id,
        Some(id),
        params.transaction_type.as_deref(),
        params.date_from,
        params.date_to,
        page,
        per_page,
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    Ok(Json(PaginatedResponse::new(
        transactions,
        total,
        page,
        per_page,
    )))
}

#[utoipa::path(
    post,
    path = "/api/contacts/{id}/payment",
    tag = "contacts",
    security(("bearer" = [])),
    params(("id" = Uuid, Path, description = "Contact ID")),
    request_body = RecordPaymentRequest,
    responses((status = 200, body = inline(ApiResponse<Transaction>)))
)]
pub async fn record_payment(
    State(state): State<AppState>,
    Extension(ctx): Extension<CompanyContext>,
    Extension(auth): Extension<AuthUser>,
    Path(id): Path<Uuid>,
    ValidatedJson(body): ValidatedJson<RecordPaymentRequest>,
) -> Result<Json<ApiResponse<Transaction>>, AppError> {
    let contact = ContactRepository::find_by_id(&state.pool, id)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?
        .ok_or_else(|| AppError::NotFound("Contact not found".into()))?;

    if contact.company_id != ctx.company_id {
        return Err(AppError::NotFound("Contact not found".into()));
    }

    let date = body.date.unwrap_or_else(|| chrono::Utc::now().date_naive());

    let mut tx = state.pool.begin().await.map_err(|e| {
        AppError::Database(format!("Failed to start transaction: {e}"))
    })?;

    let updated_contact =
        ContactRepository::update_balance_with_executor(&mut *tx, id, ctx.company_id, -body.amount)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

    let transaction = TransactionRepository::create_with_executor(
        &mut *tx,
        ctx.company_id,
        Some(id),
        "payment",
        body.amount,
        date,
        body.payment_method_id,
        None,
        None,
        updated_contact.balance,
        body.description.as_deref(),
    )
    .await
    .map_err(|e| AppError::Database(e.to_string()))?;

    tx.commit().await.map_err(|e| {
        AppError::Database(format!("Failed to commit transaction: {e}"))
    })?;

    AuditBuilder::new(state.audit.clone(), ctx.company_id, auth.user_id)
        .entity("transaction", transaction.id)
        .action("create")
        .after(&transaction)
        .emit();

    Ok(Json(ApiResponse::new(transaction)))
}
