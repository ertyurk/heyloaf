use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use heyloaf_common::errors::AppError;
use heyloaf_dal::repositories::notification::NotificationRepository;
use heyloaf_dal::repositories::stock::StockRepository;
use sqlx::PgPool;
use uuid::Uuid;

/// Minimum interval between notification checks for the same company.
const RATE_LIMIT_SECS: u64 = 300; // 5 minutes

#[derive(Clone)]
pub struct NotificationService {
    pool: PgPool,
    /// Tracks the last time low_stock was checked per company.
    low_stock_last_check: Arc<Mutex<HashMap<Uuid, Instant>>>,
    /// Tracks the last time overdue_invoices was checked per company.
    overdue_last_check: Arc<Mutex<HashMap<Uuid, Instant>>>,
}

impl NotificationService {
    #[must_use]
    pub fn new(pool: PgPool) -> Self {
        Self {
            pool,
            low_stock_last_check: Arc::new(Mutex::new(HashMap::new())),
            overdue_last_check: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    /// Returns `true` if the check should be skipped (was done recently).
    fn rate_limited(cache: &Mutex<HashMap<Uuid, Instant>>, company_id: Uuid) -> bool {
        let mut map = cache.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(last) = map.get(&company_id)
            && last.elapsed().as_secs() < RATE_LIMIT_SECS
        {
            return true;
        }
        map.insert(company_id, Instant::now());
        false
    }

    /// Check all products with low stock and create notifications for any
    /// that don't already have an unread low-stock notification.
    /// Skips the check if it was done for the same company within the last 5 minutes.
    pub async fn check_low_stock(&self, company_id: Uuid) -> Result<(), AppError> {
        if Self::rate_limited(&self.low_stock_last_check, company_id) {
            return Ok(());
        }

        let low_stock_items = StockRepository::list_low_stock(&self.pool, company_id)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        for item in &low_stock_items {
            let already_notified = NotificationRepository::exists_unread(
                &self.pool,
                company_id,
                "low_stock",
                item.product_id,
            )
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            if already_notified {
                continue;
            }

            let title = format!("Low stock: product {}", item.product_id);
            let message = format!(
                "Stock for product {} is at {}, which is at or below \
                 the minimum level of {}.",
                item.product_id,
                item.quantity,
                item.min_level.unwrap_or(0.0),
            );

            if let Err(e) = NotificationRepository::create(
                &self.pool,
                company_id,
                None,
                "low_stock",
                &title,
                &message,
                Some("low_stock"),
                Some(item.product_id),
            )
            .await
            {
                tracing::error!(
                    error = %e,
                    product_id = %item.product_id,
                    "Failed to create low stock notification"
                );
            }
        }

        Ok(())
    }

    /// Check all pending invoices with a due date in the past and create
    /// notifications for any that don't already have an unread overdue
    /// notification.
    /// Skips the check if it was done for the same company within the last 5 minutes.
    pub async fn check_overdue_invoices(&self, company_id: Uuid) -> Result<(), AppError> {
        if Self::rate_limited(&self.overdue_last_check, company_id) {
            return Ok(());
        }

        let overdue_invoices: Vec<OverdueInvoice> = sqlx::query_as::<_, OverdueInvoice>(
            r"SELECT id, invoice_number FROM invoices
                WHERE company_id = $1
                AND status = 'pending'
                AND due_date IS NOT NULL
                AND due_date < CURRENT_DATE",
        )
        .bind(company_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        for invoice in &overdue_invoices {
            let already_notified = NotificationRepository::exists_unread(
                &self.pool,
                company_id,
                "overdue_invoice",
                invoice.id,
            )
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            if already_notified {
                continue;
            }

            let title = format!("Overdue: {}", invoice.invoice_number);
            let message = format!(
                "Invoice {} is past its due date and still pending.",
                invoice.invoice_number,
            );

            if let Err(e) = NotificationRepository::create(
                &self.pool,
                company_id,
                None,
                "overdue_invoice",
                &title,
                &message,
                Some("overdue_invoice"),
                Some(invoice.id),
            )
            .await
            {
                tracing::error!(
                    error = %e,
                    invoice_id = %invoice.id,
                    "Failed to create overdue invoice notification"
                );
            }
        }

        Ok(())
    }
}

#[derive(sqlx::FromRow)]
struct OverdueInvoice {
    id: Uuid,
    invoice_number: String,
}
