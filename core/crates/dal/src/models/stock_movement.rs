use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct StockMovement {
    pub id: Uuid,
    pub company_id: Uuid,
    pub product_id: Uuid,
    pub movement_type: String,
    pub source: String,
    pub quantity: f64,
    pub unit_price: Option<f64>,
    pub total_price: Option<f64>,
    pub vat_rate: Option<f64>,
    pub reference_type: Option<String>,
    pub reference_id: Option<Uuid>,
    pub description: Option<String>,
    pub created_by: Uuid,
    pub created_at: DateTime<Utc>,
}
