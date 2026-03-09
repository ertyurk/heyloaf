use chrono::{DateTime, Utc};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::order::{Order, OrderItem};

/// (product_id, product_name, variant_name, quantity, unit_price, vat_rate, line_total)
pub type OrderItemTuple = (Option<Uuid>, String, Option<String>, f64, f64, f64, f64);

pub struct OrderRepository;

impl OrderRepository {
    const SELECT: &str = r"id, company_id, order_number, status::text,
        cashier_id, shift_id, terminal_id, subtotal, tax_total, total,
        payment_method_id, notes, created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Order>, sqlx::Error> {
        let sql = format!("SELECT {} FROM orders WHERE id = $1", Self::SELECT);
        sqlx::query_as::<_, Order>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        status: Option<&str>,
        cashier_id: Option<Uuid>,
        date_from: Option<DateTime<Utc>>,
        date_to: Option<DateTime<Utc>>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<Order>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM orders
            WHERE company_id = $1
            AND ($2::text IS NULL OR status = $2::order_status)
            AND ($3::uuid IS NULL OR cashier_id = $3)
            AND ($4::timestamptz IS NULL OR created_at >= $4)
            AND ($5::timestamptz IS NULL OR created_at <= $5)",
        )
        .bind(company_id)
        .bind(status)
        .bind(cashier_id)
        .bind(date_from)
        .bind(date_to)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM orders
            WHERE company_id = $1
            AND ($2::text IS NULL OR status = $2::order_status)
            AND ($3::uuid IS NULL OR cashier_id = $3)
            AND ($4::timestamptz IS NULL OR created_at >= $4)
            AND ($5::timestamptz IS NULL OR created_at <= $5)
            ORDER BY created_at DESC
            LIMIT $6 OFFSET $7",
            Self::SELECT
        );
        let orders = sqlx::query_as::<_, Order>(&sql)
            .bind(company_id)
            .bind(status)
            .bind(cashier_id)
            .bind(date_from)
            .bind(date_to)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((orders, total))
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        company_id: Uuid,
        order_number: &str,
        cashier_id: Uuid,
        shift_id: Option<Uuid>,
        terminal_id: Option<Uuid>,
        subtotal: f64,
        tax_total: f64,
        total: f64,
        payment_method_id: Option<Uuid>,
        notes: Option<&str>,
    ) -> Result<Order, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO orders
                (company_id, order_number, cashier_id, shift_id, terminal_id,
                 subtotal, tax_total, total, payment_method_id, notes)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Order>(&sql)
            .bind(company_id)
            .bind(order_number)
            .bind(cashier_id)
            .bind(shift_id)
            .bind(terminal_id)
            .bind(subtotal)
            .bind(tax_total)
            .bind(total)
            .bind(payment_method_id)
            .bind(notes)
            .fetch_one(executor)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        order_number: &str,
        cashier_id: Uuid,
        shift_id: Option<Uuid>,
        terminal_id: Option<Uuid>,
        subtotal: f64,
        tax_total: f64,
        total: f64,
        payment_method_id: Option<Uuid>,
        notes: Option<&str>,
    ) -> Result<Order, sqlx::Error> {
        Self::create_with_executor(
            pool, company_id, order_number, cashier_id, shift_id, terminal_id,
            subtotal, tax_total, total, payment_method_id, notes,
        )
        .await
    }

    pub async fn update_status_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        id: Uuid,
        company_id: Uuid,
        status: &str,
    ) -> Result<Order, sqlx::Error> {
        let sql = format!(
            r"UPDATE orders SET status = $2::order_status
            WHERE id = $1 AND company_id = $3
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Order>(&sql)
            .bind(id)
            .bind(status)
            .bind(company_id)
            .fetch_one(executor)
            .await
    }

    pub async fn update_status(
        pool: &PgPool,
        id: Uuid,
        company_id: Uuid,
        status: &str,
    ) -> Result<Order, sqlx::Error> {
        Self::update_status_with_executor(pool, id, company_id, status).await
    }

    pub async fn update_status_with_notes_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        id: Uuid,
        company_id: Uuid,
        status: &str,
        notes: &str,
    ) -> Result<Order, sqlx::Error> {
        let sql = format!(
            r"UPDATE orders SET status = $2::order_status, notes = $3
            WHERE id = $1 AND company_id = $4
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Order>(&sql)
            .bind(id)
            .bind(status)
            .bind(notes)
            .bind(company_id)
            .fetch_one(executor)
            .await
    }

    pub async fn update_status_with_notes(
        pool: &PgPool,
        id: Uuid,
        company_id: Uuid,
        status: &str,
        notes: &str,
    ) -> Result<Order, sqlx::Error> {
        Self::update_status_with_notes_executor(pool, id, company_id, status, notes).await
    }

    pub async fn next_number_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        company_id: Uuid,
    ) -> Result<String, sqlx::Error> {
        let today = Utc::now().format("%Y%m%d").to_string();

        let next: i64 = sqlx::query_scalar(
            r"INSERT INTO counters (company_id, counter_type, last_value)
            VALUES ($1, 'order', 1)
            ON CONFLICT (company_id, counter_type)
            DO UPDATE SET last_value = counters.last_value + 1
            RETURNING last_value",
        )
        .bind(company_id)
        .fetch_one(executor)
        .await?;

        Ok(format!("ORD-{today}-{next:04}"))
    }

    pub async fn next_number(pool: &PgPool, company_id: Uuid) -> Result<String, sqlx::Error> {
        Self::next_number_with_executor(pool, company_id).await
    }
}

pub struct OrderItemRepository;

impl OrderItemRepository {
    const SELECT: &str = r"id, order_id, product_id, product_name, variant_name,
        quantity, unit_price, vat_rate, line_total, returned_quantity, created_at";

    pub async fn find_by_id(
        pool: &PgPool,
        id: Uuid,
    ) -> Result<Option<OrderItem>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM order_items WHERE id = $1",
            Self::SELECT
        );
        sqlx::query_as::<_, OrderItem>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list_by_order(
        pool: &PgPool,
        order_id: Uuid,
    ) -> Result<Vec<OrderItem>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM order_items WHERE order_id = $1 ORDER BY created_at",
            Self::SELECT
        );
        sqlx::query_as::<_, OrderItem>(&sql)
            .bind(order_id)
            .fetch_all(pool)
            .await
    }

    pub async fn list_by_order_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        order_id: Uuid,
    ) -> Result<Vec<OrderItem>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM order_items WHERE order_id = $1 ORDER BY created_at",
            Self::SELECT
        );
        sqlx::query_as::<_, OrderItem>(&sql)
            .bind(order_id)
            .fetch_all(executor)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        order_id: Uuid,
        product_id: Option<Uuid>,
        product_name: &str,
        variant_name: Option<&str>,
        quantity: f64,
        unit_price: f64,
        vat_rate: f64,
        line_total: f64,
    ) -> Result<OrderItem, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO order_items
                (order_id, product_id, product_name, variant_name,
                 quantity, unit_price, vat_rate, line_total)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, OrderItem>(&sql)
            .bind(order_id)
            .bind(product_id)
            .bind(product_name)
            .bind(variant_name)
            .bind(quantity)
            .bind(unit_price)
            .bind(vat_rate)
            .bind(line_total)
            .fetch_one(pool)
            .await
    }

    /// Batch-insert order items. Each tuple:
    /// (product_id, product_name, variant_name, quantity, unit_price, vat_rate, line_total)
    pub async fn create_batch_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        order_id: Uuid,
        items: &[OrderItemTuple],
    ) -> Result<Vec<OrderItem>, sqlx::Error> {
        if items.is_empty() {
            return Ok(vec![]);
        }

        let mut product_ids: Vec<Option<Uuid>> = Vec::with_capacity(items.len());
        let mut product_names: Vec<String> = Vec::with_capacity(items.len());
        let mut variant_names: Vec<Option<String>> = Vec::with_capacity(items.len());
        let mut quantities: Vec<f64> = Vec::with_capacity(items.len());
        let mut unit_prices: Vec<f64> = Vec::with_capacity(items.len());
        let mut vat_rates: Vec<f64> = Vec::with_capacity(items.len());
        let mut line_totals: Vec<f64> = Vec::with_capacity(items.len());

        for item in items {
            product_ids.push(item.0);
            product_names.push(item.1.clone());
            variant_names.push(item.2.clone());
            quantities.push(item.3);
            unit_prices.push(item.4);
            vat_rates.push(item.5);
            line_totals.push(item.6);
        }

        let sql = format!(
            r"INSERT INTO order_items
                (order_id, product_id, product_name, variant_name,
                 quantity, unit_price, vat_rate, line_total)
            SELECT $1,
                   unnest($2::uuid[]),
                   unnest($3::text[]),
                   unnest($4::text[]),
                   unnest($5::float8[]),
                   unnest($6::float8[]),
                   unnest($7::float8[]),
                   unnest($8::float8[])
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, OrderItem>(&sql)
            .bind(order_id)
            .bind(&product_ids)
            .bind(&product_names)
            .bind(&variant_names)
            .bind(&quantities)
            .bind(&unit_prices)
            .bind(&vat_rates)
            .bind(&line_totals)
            .fetch_all(executor)
            .await
    }

    /// Batch-insert order items. Each tuple:
    /// (product_id, product_name, variant_name, quantity, unit_price, vat_rate, line_total)
    pub async fn create_batch(
        pool: &PgPool,
        order_id: Uuid,
        items: &[OrderItemTuple],
    ) -> Result<Vec<OrderItem>, sqlx::Error> {
        Self::create_batch_with_executor(pool, order_id, items).await
    }

    pub async fn update_returned_quantity_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        id: Uuid,
        returned_quantity: f64,
    ) -> Result<OrderItem, sqlx::Error> {
        let sql = format!(
            r"UPDATE order_items SET returned_quantity = $2
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, OrderItem>(&sql)
            .bind(id)
            .bind(returned_quantity)
            .fetch_one(executor)
            .await
    }
}
