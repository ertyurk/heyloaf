use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct StockCount {
    pub id: Uuid,
    pub company_id: Uuid,
    pub counted_at: DateTime<Utc>,
    pub counted_by: Uuid,
    pub notes: Option<String>,
    pub items: serde_json::Value,
    pub status: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
