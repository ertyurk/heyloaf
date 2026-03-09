use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct Order {
    pub id: Uuid,
    pub company_id: Uuid,
    pub order_number: String,
    pub status: String,
    pub cashier_id: Uuid,
    pub shift_id: Option<Uuid>,
    pub terminal_id: Option<Uuid>,
    pub subtotal: f64,
    pub tax_total: f64,
    pub total: f64,
    pub payment_method_id: Option<Uuid>,
    pub notes: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct OrderItem {
    pub id: Uuid,
    pub order_id: Uuid,
    pub product_id: Option<Uuid>,
    pub product_name: String,
    pub variant_name: Option<String>,
    pub quantity: f64,
    pub unit_price: f64,
    pub vat_rate: f64,
    pub line_total: f64,
    pub returned_quantity: f64,
    pub created_at: DateTime<Utc>,
}
