use heyloaf_common::errors::AppError;
use heyloaf_dal::models::stock_movement::StockMovement;
use heyloaf_dal::repositories::stock::StockRepository;
use heyloaf_dal::repositories::stock_movement::StockMovementRepository;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone)]
pub struct StockService {
    pool: PgPool,
}

impl StockService {
    #[must_use]
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Record a stock movement within a transaction, updating both the
    /// stock_movements table and the stock quantity.
    #[expect(clippy::too_many_arguments)]
    pub async fn record_movement_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        company_id: Uuid,
        product_id: Uuid,
        movement_type: &str,
        source: &str,
        quantity: f64,
        unit_price: Option<f64>,
        vat_rate: Option<f64>,
        reference_type: Option<&str>,
        reference_id: Option<Uuid>,
        description: Option<&str>,
        user_id: Uuid,
    ) -> Result<StockMovement, AppError> {
        let total_price = unit_price.map(|up| up * quantity);

        if !matches!(movement_type, "in" | "out" | "adjustment") {
            return Err(AppError::BadRequest(format!(
                "Invalid movement type: '{movement_type}'. Must be 'in', 'out', or 'adjustment'"
            )));
        }

        if quantity <= 0.0 {
            return Err(AppError::BadRequest(
                "Quantity must be greater than zero".into(),
            ));
        }

        let quantity_delta = match movement_type {
            "in" => quantity,
            "out" => -quantity,
            "adjustment" => quantity,
            // Unreachable: validation above rejects unknown types
            _ => unreachable!(),
        };

        // Prevent stock from going negative on "out" movements
        if movement_type == "out" {
            let current_stock: f64 = sqlx::query_scalar(
                "SELECT COALESCE(quantity, 0) FROM stock WHERE product_id = $1 AND company_id = $2",
            )
            .bind(product_id)
            .bind(company_id)
            .fetch_optional(&mut **tx)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?
            .unwrap_or(0.0);

            if current_stock < quantity {
                return Err(AppError::BadRequest(format!(
                    "Insufficient stock: available {current_stock}, requested {quantity}"
                )));
            }
        }

        let movement = StockMovementRepository::create_with_executor(
            &mut **tx,
            company_id,
            product_id,
            movement_type,
            source,
            quantity,
            unit_price,
            total_price,
            vat_rate,
            reference_type,
            reference_id,
            description,
            user_id,
        )
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        StockRepository::upsert_with_executor(&mut **tx, company_id, product_id, quantity_delta)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(movement)
    }

    /// Record a stock movement and update the stock quantity accordingly.
    /// For movement_type "in", quantity is added; for "out", quantity is subtracted.
    /// Wraps both operations in a single transaction for atomicity.
    #[expect(clippy::too_many_arguments)]
    pub async fn record_movement(
        &self,
        company_id: Uuid,
        product_id: Uuid,
        movement_type: &str,
        source: &str,
        quantity: f64,
        unit_price: Option<f64>,
        vat_rate: Option<f64>,
        reference_type: Option<&str>,
        reference_id: Option<Uuid>,
        description: Option<&str>,
        user_id: Uuid,
    ) -> Result<StockMovement, AppError> {
        let mut tx = self.pool.begin().await.map_err(|e| {
            AppError::Database(format!("Failed to start transaction: {e}"))
        })?;

        let movement = Self::record_movement_tx(
            &mut tx,
            company_id,
            product_id,
            movement_type,
            source,
            quantity,
            unit_price,
            vat_rate,
            reference_type,
            reference_id,
            description,
            user_id,
        )
        .await?;

        tx.commit().await.map_err(|e| {
            AppError::Database(format!("Failed to commit transaction: {e}"))
        })?;

        Ok(movement)
    }

    /// Reverse all movements for a given reference within a transaction by
    /// creating opposite movements, then delete the original movements.
    pub async fn reverse_movements_tx(
        tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
        company_id: Uuid,
        reference_type: &str,
        reference_id: Uuid,
        user_id: Uuid,
    ) -> Result<u64, AppError> {
        let movements = StockMovementRepository::list_by_reference_with_executor(
            &mut **tx,
            company_id,
            reference_type,
            reference_id,
        )
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        let count = movements.len() as u64;

        for m in &movements {
            let reverse_type = match m.movement_type.as_str() {
                "in" => "out",
                "out" => "in",
                "adjustment" => "adjustment",
                other => {
                    return Err(AppError::BadRequest(format!(
                        "Cannot reverse unknown movement type: '{other}'"
                    )));
                }
            };

            let reverse_delta = match reverse_type {
                "in" => m.quantity,
                "out" => -m.quantity,
                // Reversing an adjustment negates the original delta
                _ => -m.quantity,
            };

            StockMovementRepository::create_with_executor(
                &mut **tx,
                m.company_id,
                m.product_id,
                reverse_type,
                &m.source,
                m.quantity,
                m.unit_price,
                m.total_price,
                m.vat_rate,
                Some("reversal"),
                Some(reference_id),
                Some("Automatic reversal"),
                user_id,
            )
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

            StockRepository::upsert_with_executor(
                &mut **tx,
                m.company_id,
                m.product_id,
                reverse_delta,
            )
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;
        }

        StockMovementRepository::delete_by_reference_with_executor(
            &mut **tx,
            company_id,
            reference_type,
            reference_id,
        )
        .await
        .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(count)
    }

    /// Reverse all movements for a given reference by creating opposite movements,
    /// then delete the original movements. Wraps everything in a single transaction.
    pub async fn reverse_movements(
        &self,
        company_id: Uuid,
        reference_type: &str,
        reference_id: Uuid,
        user_id: Uuid,
    ) -> Result<u64, AppError> {
        let mut tx = self.pool.begin().await.map_err(|e| {
            AppError::Database(format!("Failed to start transaction: {e}"))
        })?;

        let count =
            Self::reverse_movements_tx(&mut tx, company_id, reference_type, reference_id, user_id)
                .await?;

        tx.commit().await.map_err(|e| {
            AppError::Database(format!("Failed to commit transaction: {e}"))
        })?;

        Ok(count)
    }
}
