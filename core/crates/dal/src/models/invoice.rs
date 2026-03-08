use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct Invoice {
    pub id: Uuid,
    pub company_id: Uuid,
    pub invoice_number: String,
    pub invoice_type: String,
    pub contact_id: Option<Uuid>,
    pub date: NaiveDate,
    pub due_date: Option<NaiveDate>,
    pub currency_code: String,
    pub exchange_rate: f64,
    pub tax_number: Option<String>,
    pub tax_office: Option<String>,
    pub status: String,
    pub notes: Option<String>,
    pub line_items: serde_json::Value,
    pub subtotal: f64,
    pub tax_total: f64,
    pub grand_total: f64,
    pub base_currency_total: f64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
