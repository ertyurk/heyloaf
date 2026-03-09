use chrono::NaiveDate;
use heyloaf_common::escape_like;
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
    pub async fn list_all(
        pool: &PgPool,
        company_id: Uuid,
        contact_id: Option<Uuid>,
        transaction_type: Option<&str>,
        payment_method_id: Option<Uuid>,
        date_from: Option<NaiveDate>,
        date_to: Option<NaiveDate>,
        search: Option<&str>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<Transaction>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;
        let search_pattern = search.map(|s| format!("%{}%", escape_like(&s.to_lowercase())));

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM transactions
            WHERE company_id = $1
            AND ($2::uuid IS NULL OR contact_id = $2)
            AND ($3::text IS NULL OR transaction_type = $3::transaction_type)
            AND ($4::uuid IS NULL OR payment_method_id = $4)
            AND ($5::date IS NULL OR date >= $5)
            AND ($6::date IS NULL OR date <= $6)
            AND ($7::text IS NULL OR LOWER(description) LIKE $7 ESCAPE '\')",
        )
        .bind(company_id)
        .bind(contact_id)
        .bind(transaction_type)
        .bind(payment_method_id)
        .bind(date_from)
        .bind(date_to)
        .bind(&search_pattern)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM transactions
            WHERE company_id = $1
            AND ($2::uuid IS NULL OR contact_id = $2)
            AND ($3::text IS NULL OR transaction_type = $3::transaction_type)
            AND ($4::uuid IS NULL OR payment_method_id = $4)
            AND ($5::date IS NULL OR date >= $5)
            AND ($6::date IS NULL OR date <= $6)
            AND ($7::text IS NULL OR LOWER(description) LIKE $7 ESCAPE '\')
            ORDER BY date DESC, created_at DESC
            LIMIT $8 OFFSET $9",
            Self::SELECT
        );
        let transactions = sqlx::query_as::<_, Transaction>(&sql)
            .bind(company_id)
            .bind(contact_id)
            .bind(transaction_type)
            .bind(payment_method_id)
            .bind(date_from)
            .bind(date_to)
            .bind(&search_pattern)
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
        Self::create_with_executor(
            pool,
            company_id,
            contact_id,
            transaction_type,
            amount,
            date,
            payment_method_id,
            reference_type,
            reference_id,
            balance_after,
            description,
        )
        .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
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
            .fetch_one(executor)
            .await
    }

    pub async fn delete_by_reference_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        company_id: Uuid,
        reference_type: &str,
        reference_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "DELETE FROM transactions WHERE company_id = $1 AND reference_type = $2 AND reference_id = $3",
        )
        .bind(company_id)
        .bind(reference_type)
        .bind(reference_id)
        .execute(executor)
        .await?;
        Ok(())
    }
}
