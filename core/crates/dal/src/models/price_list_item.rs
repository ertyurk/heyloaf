use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct PriceListItem {
    pub id: Uuid,
    pub company_id: Uuid,
    pub price_list_id: Uuid,
    pub product_id: Uuid,
    pub price: f64,
    pub vat_rate: Option<f64>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
