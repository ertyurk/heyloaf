use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct Transaction {
    pub id: Uuid,
    pub company_id: Uuid,
    pub contact_id: Option<Uuid>,
    pub transaction_type: String,
    pub amount: f64,
    pub date: NaiveDate,
    pub payment_method_id: Option<Uuid>,
    pub reference_type: Option<String>,
    pub reference_id: Option<Uuid>,
    pub balance_after: f64,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}
