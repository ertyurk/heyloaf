use chrono::NaiveDate;
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::transaction::Transaction;

pub struct TransactionRepository;

impl TransactionRepository {
    const SELECT: &str = r"id, company_id, contact_id,
        transaction_type::text, amount, date, payment_method_id,
        reference_type, reference_id, balance_after, description, created_at";

    #[expect(clippy::too_many_arguments)]
    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        contact_id: Option<Uuid>,
        transaction_type: Option<&str>,
        date_from: Option<NaiveDate>,
        date_to: Option<NaiveDate>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<Transaction>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM transactions
            WHERE company_id = $1
            AND ($2::uuid IS NULL OR contact_id = $2)
            AND ($3::text IS NULL OR transaction_type = $3::transaction_type)
            AND ($4::date IS NULL OR date >= $4)
            AND ($5::date IS NULL OR date <= $5)",
        )
        .bind(company_id)
        .bind(contact_id)
        .bind(transaction_type)
        .bind(date_from)
        .bind(date_to)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM transactions
            WHERE company_id = $1
            AND ($2::uuid IS NULL OR contact_id = $2)
            AND ($3::text IS NULL OR transaction_type = $3::transaction_type)
            AND ($4::date IS NULL OR date >= $4)
            AND ($5::date IS NULL OR date <= $5)
            ORDER BY date DESC, created_at DESC
            LIMIT $6 OFFSET $7",
            Self::SELECT
        );
        let transactions = sqlx::query_as::<_, Transaction>(&sql)
            .bind(company_id)
            .bind(contact_id)
            .bind(transaction_type)
            .bind(date_from)
            .bind(date_to)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((transactions, total))
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        contact_id: Option<Uuid>,
        transaction_type: &str,
        amount: f64,
        date: NaiveDate,
        payment_method_id: Option<Uuid>,
        reference_type: Option<&str>,
        reference_id: Option<Uuid>,
        balance_after: f64,
        description: Option<&str>,
    ) -> Result<Transaction, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO transactions (company_id, contact_id, transaction_type,
                amount, date, payment_method_id, reference_type, reference_id,
                balance_after, description)
            VALUES ($1, $2, $3::transaction_type, $4, $5, $6, $7, $8, $9, $10)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Transaction>(&sql)
            .bind(company_id)
            .bind(contact_id)
            .bind(transaction_type)
            .bind(amount)
            .bind(date)
            .bind(payment_method_id)
            .bind(reference_type)
            .bind(reference_id)
            .bind(balance_after)
            .bind(description)
            .fetch_one(pool)
            .await
    }
}
