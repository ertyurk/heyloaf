use serde::{Deserialize, Serialize};
use std::fmt;
use std::str::FromStr;

/// Generic API response wrapper.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct ApiResponse<T: Serialize> {
    pub data: T,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn new(data: T) -> Self {
        Self { data }
    }
}

/// Pagination query parameters.
#[derive(Debug, Clone, Deserialize, utoipa::IntoParams)]
pub struct PaginationParams {
    #[serde(default = "default_page")]
    pub page: Option<u32>,
    #[serde(default = "default_per_page")]
    pub per_page: Option<u32>,
}

fn default_page() -> Option<u32> {
    Some(1)
}

fn default_per_page() -> Option<u32> {
    Some(20)
}

impl PaginationParams {
    #[must_use]
    pub fn page(&self) -> u32 {
        self.page.unwrap_or(1).max(1)
    }

    #[must_use]
    pub fn per_page(&self) -> u32 {
        self.per_page.unwrap_or(20).clamp(1, 100)
    }

    #[must_use]
    pub fn offset(&self) -> u32 {
        (self.page() - 1) * self.per_page()
    }
}

/// Paginated response wrapper.
#[derive(Debug, Clone, Serialize, Deserialize, utoipa::ToSchema)]
pub struct PaginatedResponse<T: Serialize> {
    pub data: Vec<T>,
    pub total: i64,
    pub page: u32,
    pub per_page: u32,
    pub total_pages: u32,
}

impl<T: Serialize> PaginatedResponse<T> {
    #[must_use]
    pub fn new(data: Vec<T>, total: i64, page: u32, per_page: u32) -> Self {
        let total_pages = if per_page == 0 {
            0
        } else {
            (total as u32).div_ceil(per_page)
        };
        Self {
            data,
            total,
            page,
            per_page,
            total_pages,
        }
    }
}

/// Supported languages.
#[derive(Debug, Default, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Language {
    #[default]
    En,
    Tr,
}

impl fmt::Display for Language {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Language::En => write!(f, "en"),
            Language::Tr => write!(f, "tr"),
        }
    }
}

impl FromStr for Language {
    type Err = String;

    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "en" => Ok(Language::En),
            "tr" => Ok(Language::Tr),
            other => Err(format!("Unknown language: {other}")),
        }
    }
}

/// User roles.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Admin,
    Manager,
    User,
    Cashier,
}

/// Permission levels for module access.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum PermissionLevel {
    Admin,
    Editor,
    Viewer,
    None,
}

/// Application modules.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum Module {
    Products,
    Stock,
    Production,
    Pos,
    Sales,
    Purchase,
    Finance,
    Reports,
    Settings,
}

/// Product type classification.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProductType {
    Raw,
    Semi,
    Finished,
    Commercial,
    Consumable,
}

/// Product lifecycle status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum ProductStatus {
    Draft,
    Inactive,
    Active,
}

/// Stock availability status.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize, utoipa::ToSchema)]
#[serde(rename_all = "snake_case")]
pub enum StockStatus {
    InStock,
    OutOfStock,
    NoStockRequired,
}
