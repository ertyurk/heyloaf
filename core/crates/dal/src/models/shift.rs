use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct Shift {
    pub id: Uuid,
    pub company_id: Uuid,
    pub terminal_id: Option<Uuid>,
    pub cashier_id: Uuid,
    pub opening_balance: f64,
    pub closing_balance: Option<f64>,
    pub expected_balance: Option<f64>,
    pub status: String,
    pub opened_at: DateTime<Utc>,
    pub closed_at: Option<DateTime<Utc>>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
