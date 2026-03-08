use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct Stock {
    pub id: Uuid,
    pub company_id: Uuid,
    pub product_id: Uuid,
    pub quantity: f64,
    pub min_level: Option<f64>,
    pub max_level: Option<f64>,
    pub reserved_quantity: f64,
    pub location: Option<String>,
    pub last_movement_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
