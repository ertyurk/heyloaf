use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use utoipa::ToSchema;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow, ToSchema)]
pub struct Product {
    pub id: Uuid,
    pub company_id: Uuid,
    pub name: String,
    pub code: Option<String>,
    pub barcode: Option<String>,
    pub category_id: Option<Uuid>,
    pub product_type: String,
    pub status: String,
    pub stock_status: String,
    pub unit_of_measure: String,
    pub sale_unit_type: Option<String>,
    pub plu_type: Option<String>,
    pub plu_code: Option<String>,
    pub scale_enabled: bool,
    pub tax_rate: Option<f64>,
    pub stock_tracking: bool,
    pub min_stock_level: Option<f64>,
    pub last_purchase_price: Option<f64>,
    pub calculated_cost: Option<f64>,
    pub image_url: Option<String>,
    pub recipe: Option<serde_json::Value>,
    pub purchase_options: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}
