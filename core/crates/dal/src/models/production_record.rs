use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct ProductionRecord {
    pub id: Uuid,
    pub company_id: Uuid,
    pub product_id: Uuid,
    pub variant_name: Option<String>,
    pub quantity: f64,
    pub unit: String,
    pub batch_size: f64,
    pub materials: serde_json::Value,
    pub notes: Option<String>,
    pub produced_by: Uuid,
    pub produced_at: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
