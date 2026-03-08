use sqlx::PgPool;
use uuid::Uuid;

use crate::models::contact::Contact;

pub struct ContactRepository;

impl ContactRepository {
    const SELECT: &str = r"id, company_id, name, contact_person,
        contact_type::text, tax_number, tax_office, phone, email, address,
        balance, credit_limit, notes, status::text, created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<Contact>, sqlx::Error> {
        let sql = format!("SELECT {} FROM contacts WHERE id = $1", Self::SELECT);
        sqlx::query_as::<_, Contact>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(
        pool: &PgPool,
        company_id: Uuid,
        contact_type: Option<&str>,
        status: Option<&str>,
        search: Option<&str>,
        page: u32,
        per_page: u32,
    ) -> Result<(Vec<Contact>, i64), sqlx::Error> {
        let offset = (page.saturating_sub(1)) * per_page;
        let search_pattern = search.map(|s| format!("%{}%", s.to_lowercase()));

        let total: i64 = sqlx::query_scalar(
            r"SELECT COUNT(*) FROM contacts
            WHERE company_id = $1
            AND ($2::text IS NULL OR contact_type = $2::contact_type)
            AND ($3::text IS NULL OR status = $3::contact_status)
            AND ($4::text IS NULL OR LOWER(name) LIKE $4 OR LOWER(contact_person) LIKE $4
                OR LOWER(phone) LIKE $4 OR LOWER(email) LIKE $4)",
        )
        .bind(company_id)
        .bind(contact_type)
        .bind(status)
        .bind(&search_pattern)
        .fetch_one(pool)
        .await?;

        let sql = format!(
            r"SELECT {} FROM contacts
            WHERE company_id = $1
            AND ($2::text IS NULL OR contact_type = $2::contact_type)
            AND ($3::text IS NULL OR status = $3::contact_status)
            AND ($4::text IS NULL OR LOWER(name) LIKE $4 OR LOWER(contact_person) LIKE $4
                OR LOWER(phone) LIKE $4 OR LOWER(email) LIKE $4)
            ORDER BY created_at DESC
            LIMIT $5 OFFSET $6",
            Self::SELECT
        );
        let contacts = sqlx::query_as::<_, Contact>(&sql)
            .bind(company_id)
            .bind(contact_type)
            .bind(status)
            .bind(&search_pattern)
            .bind(i64::from(per_page))
            .bind(i64::from(offset))
            .fetch_all(pool)
            .await?;

        Ok((contacts, total))
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        name: &str,
        contact_person: Option<&str>,
        contact_type: &str,
        tax_number: Option<&str>,
        tax_office: Option<&str>,
        phone: Option<&str>,
        email: Option<&str>,
        address: Option<&str>,
        credit_limit: Option<f64>,
        notes: Option<&str>,
    ) -> Result<Contact, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO contacts (company_id, name, contact_person, contact_type,
                tax_number, tax_office, phone, email, address, credit_limit, notes)
            VALUES ($1, $2, $3, $4::contact_type, $5, $6, $7, $8, $9, $10, $11)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Contact>(&sql)
            .bind(company_id)
            .bind(name)
            .bind(contact_person)
            .bind(contact_type)
            .bind(tax_number)
            .bind(tax_office)
            .bind(phone)
            .bind(email)
            .bind(address)
            .bind(credit_limit)
            .bind(notes)
            .fetch_one(pool)
            .await
    }

    #[expect(clippy::too_many_arguments)]
    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: &str,
        contact_person: Option<&str>,
        contact_type: &str,
        tax_number: Option<&str>,
        tax_office: Option<&str>,
        phone: Option<&str>,
        email: Option<&str>,
        address: Option<&str>,
        credit_limit: Option<f64>,
        notes: Option<&str>,
        status: &str,
    ) -> Result<Contact, sqlx::Error> {
        let sql = format!(
            r"UPDATE contacts SET
                name = $2, contact_person = $3, contact_type = $4::contact_type,
                tax_number = $5, tax_office = $6, phone = $7, email = $8,
                address = $9, credit_limit = $10, notes = $11,
                status = $12::contact_status
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Contact>(&sql)
            .bind(id)
            .bind(name)
            .bind(contact_person)
            .bind(contact_type)
            .bind(tax_number)
            .bind(tax_office)
            .bind(phone)
            .bind(email)
            .bind(address)
            .bind(credit_limit)
            .bind(notes)
            .bind(status)
            .fetch_one(pool)
            .await
    }

    pub async fn update_balance_with_executor<'e>(
        executor: impl sqlx::PgExecutor<'e>,
        id: Uuid,
        delta: f64,
    ) -> Result<Contact, sqlx::Error> {
        let sql = format!(
            r"UPDATE contacts SET balance = balance + $2
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, Contact>(&sql)
            .bind(id)
            .bind(delta)
            .fetch_one(executor)
            .await
    }

    pub async fn update_balance(
        pool: &PgPool,
        id: Uuid,
        delta: f64,
    ) -> Result<Contact, sqlx::Error> {
        Self::update_balance_with_executor(pool, id, delta).await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM contacts WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }

    pub async fn has_invoices(pool: &PgPool, id: Uuid) -> Result<bool, sqlx::Error> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM invoices WHERE contact_id = $1")
            .bind(id)
            .fetch_one(pool)
            .await?;
        Ok(count > 0)
    }
}
