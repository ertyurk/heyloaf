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

    /// Record a stock movement and update the stock quantity accordingly.
    /// For movement_type "in", quantity is added; for "out", quantity is subtracted.
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
        let total_price = unit_price.map(|up| up * quantity);

        let quantity_delta = match movement_type {
            "in" => quantity,
            "out" => -quantity,
            "adjustment" => quantity, // adjustment can be positive or negative
            _ => quantity,
        };

        let movement = StockMovementRepository::create(
            &self.pool,
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

        StockRepository::upsert(&self.pool, company_id, product_id, quantity_delta)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(movement)
    }

    /// Reverse all movements for a given reference by creating opposite movements,
    /// then delete the original movements.
    pub async fn reverse_movements(
        &self,
        reference_type: &str,
        reference_id: Uuid,
        user_id: Uuid,
    ) -> Result<u64, AppError> {
        let movements =
            StockMovementRepository::list_by_reference(&self.pool, reference_type, reference_id)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;

        let count = movements.len() as u64;

        for m in &movements {
            // Create the opposite movement
            let reverse_type = match m.movement_type.as_str() {
                "in" => "out",
                "out" => "in",
                other => other,
            };

            let reverse_delta = match reverse_type {
                "in" => m.quantity,
                "out" => -m.quantity,
                _ => -m.quantity,
            };

            StockMovementRepository::create(
                &self.pool,
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

            StockRepository::upsert(&self.pool, m.company_id, m.product_id, reverse_delta)
                .await
                .map_err(|e| AppError::Database(e.to_string()))?;
        }

        StockMovementRepository::delete_by_reference(&self.pool, reference_type, reference_id)
            .await
            .map_err(|e| AppError::Database(e.to_string()))?;

        Ok(count)
    }
}
