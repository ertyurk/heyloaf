use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct Contact {
    pub id: Uuid,
    pub company_id: Uuid,
    pub name: String,
    pub contact_person: Option<String>,
    pub contact_type: String,
    pub tax_number: Option<String>,
    pub tax_office: Option<String>,
    pub phone: Option<String>,
    pub email: Option<String>,
    pub address: Option<String>,
    pub balance: f64,
    pub credit_limit: Option<f64>,
    pub notes: Option<String>,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
