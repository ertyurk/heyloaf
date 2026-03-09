use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::invoice::Invoice;

pub struct InvoiceRepository;

impl InvoiceRepository {
    const SELECT: &str = r"id, company_id, invoice_number,
        invoice_type::text, contact_id, date, due_date, currency_code,
        exchange_rate, tax_number, tax_office, status::text, notes,
        line_items, subtotal, tax_total, grand_total, base_currency_total,
        created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Invoice>, sqlx::Error> {
        let sql = format!("SELECT {} FROM invoices WHERE id = $1", Self::SELECT);
        sqlx::query_as::<_, Invoice>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        invoice_type: Option<&str>,
        status: Option<&str>,
        date_from: Option<NaiveDate>,
        date_to: Option<NaiveDate>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<Invoice>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM invoices
            WHERE company_id = $1
            AND ($2::text IS NULL OR invoice_type = $2::invoice_type)
            AND ($3::text IS NULL OR status = $3::invoice_status)
            AND ($4::date IS NULL OR date >= $4)
            AND ($5::date IS NULL OR date <= $5)",
        )
        .bind(company_id)
        .bind(invoice_type)
        .bind(status)
        .bind(date_from)
        .bind(date_to)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM invoices
            WHERE company_id = $1
            AND ($2::text IS NULL OR invoice_type = $2::invoice_type)
            AND ($3::text IS NULL OR status = $3::invoice_status)
            AND ($4::date IS NULL OR date >= $4)
            AND ($5::date IS NULL OR date <= $5)
            ORDER BY date DESC, created_at DESC
            LIMIT $6 OFFSET $7",
            Self::SELECT
        );
        let invoices = sqlx::query_as::<_, Invoice>(&sql)
            .bind(company_id)
            .bind(invoice_type)
            .bind(status)
            .bind(date_from)
            .bind(date_to)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((invoices, total))
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        company_id: Uuid,
        invoice_number: &str,
        invoice_type: &str,
        contact_id: Option<Uuid>,
        date: NaiveDate,
        due_date: Option<NaiveDate>,
        currency_code: &str,
        exchange_rate: f64,
        tax_number: Option<&str>,
        tax_office: Option<&str>,
        notes: Option<&str>,
        line_items: &serde_json::Value,
        subtotal: f64,
        tax_total: f64,
        grand_total: f64,
        base_currency_total: f64,
    ) -> Result<Invoice, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO invoices (company_id, invoice_number, invoice_type,
                contact_id, date, due_date, currency_code, exchange_rate,
                tax_number, tax_office, notes, line_items,
                subtotal, tax_total, grand_total, base_currency_total)
            VALUES ($1, $2, $3::invoice_type, $4, $5, $6, $7, $8,
                $9, $10, $11, $12, $13, $14, $15, $16)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Invoice>(&sql)
            .bind(company_id)
            .bind(invoice_number)
            .bind(invoice_type)
            .bind(contact_id)
            .bind(date)
            .bind(due_date)
            .bind(currency_code)
            .bind(exchange_rate)
            .bind(tax_number)
            .bind(tax_office)
            .bind(notes)
            .bind(line_items)
            .bind(subtotal)
            .bind(tax_total)
            .bind(grand_total)
            .bind(base_currency_total)
            .fetch_one(executor)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        invoice_number: &str,
        invoice_type: &str,
        contact_id: Option<Uuid>,
        date: NaiveDate,
        due_date: Option<NaiveDate>,
        currency_code: &str,
        exchange_rate: f64,
        tax_number: Option<&str>,
        tax_office: Option<&str>,
        notes: Option<&str>,
        line_items: &serde_json::Value,
        subtotal: f64,
        tax_total: f64,
        grand_total: f64,
        base_currency_total: f64,
    ) -> Result<Invoice, sqlx::Error> {
        Self::create_with_executor(
            pool, company_id, invoice_number, invoice_type, contact_id, date, due_date,
            currency_code, exchange_rate, tax_number, tax_office, notes, line_items,
            subtotal, tax_total, grand_total, base_currency_total,
        )
        .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn update_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        id: Uuid,
        contact_id: Option<Uuid>,
        date: NaiveDate,
        due_date: Option<NaiveDate>,
        currency_code: &str,
        exchange_rate: f64,
        tax_number: Option<&str>,
        tax_office: Option<&str>,
        notes: Option<&str>,
        line_items: &serde_json::Value,
        subtotal: f64,
        tax_total: f64,
        grand_total: f64,
        base_currency_total: f64,
    ) -> Result<Invoice, sqlx::Error> {
        let sql = format!(
            r"UPDATE invoices SET
                contact_id = $2, date = $3, due_date = $4,
                currency_code = $5, exchange_rate = $6,
                tax_number = $7, tax_office = $8, notes = $9,
                line_items = $10, subtotal = $11, tax_total = $12,
                grand_total = $13, base_currency_total = $14
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Invoice>(&sql)
            .bind(id)
            .bind(contact_id)
            .bind(date)
            .bind(due_date)
            .bind(currency_code)
            .bind(exchange_rate)
            .bind(tax_number)
            .bind(tax_office)
            .bind(notes)
            .bind(line_items)
            .bind(subtotal)
            .bind(tax_total)
            .bind(grand_total)
            .bind(base_currency_total)
            .fetch_one(executor)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        contact_id: Option<Uuid>,
        date: NaiveDate,
        due_date: Option<NaiveDate>,
        currency_code: &str,
        exchange_rate: f64,
        tax_number: Option<&str>,
        tax_office: Option<&str>,
        notes: Option<&str>,
        line_items: &serde_json::Value,
        subtotal: f64,
        tax_total: f64,
        grand_total: f64,
        base_currency_total: f64,
    ) -> Result<Invoice, sqlx::Error> {
        Self::update_with_executor(
            pool, id, contact_id, date, due_date, currency_code, exchange_rate,
            tax_number, tax_office, notes, line_items, subtotal, tax_total,
            grand_total, base_currency_total,
        )
        .await
    }

    pub async fn update_status(
        pool: &PgPool,
        id: Uuid,
        status: &str,
    ) -> Result<Invoice, sqlx::Error> {
        let sql = format!(
            r"UPDATE invoices SET status = $2::invoice_status
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Invoice>(&sql)
            .bind(id)
            .bind(status)
            .fetch_one(pool)
            .await
    }

    pub async fn delete_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM invoices WHERE id = $1")
            .bind(id)
            .execute(executor)
            .await?;
        Ok(())
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        Self::delete_with_executor(pool, id).await
    }

    pub async fn next_number_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        company_id: Uuid,
        invoice_type: &str,
    ) -> Result<String, sqlx::Error> {
        let (prefix, counter_type) = match invoice_type {
            "purchase" => ("AL", "invoice_purchase"),
            _ => ("ST", "invoice_sales"),
        };

        let year = chrono::Utc::now().format("%Y");

        let next: i64 = sqlx::query_scalar(
            r"INSERT INTO counters (company_id, counter_type, last_value)
            VALUES ($1, $2, 1)
            ON CONFLICT (company_id, counter_type)
            DO UPDATE SET last_value = counters.last_value + 1
            RETURNING last_value",
        )
        .bind(company_id)
        .bind(counter_type)
        .fetch_one(executor)
        .await?;

        Ok(format!("{prefix}-{year}-{next:06}"))
    }

    pub async fn next_number(
        pool: &PgPool,
        company_id: Uuid,
        invoice_type: &str,
    ) -> Result<String, sqlx::Error> {
        Self::next_number_with_executor(pool, company_id, invoice_type).await
    }
}
