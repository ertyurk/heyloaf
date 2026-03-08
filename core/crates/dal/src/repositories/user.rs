use sqlx::PgPool;
use uuid::Uuid;

use crate::models::user::{CompanyUser, User, UserCompany};

pub struct UserRepository;

impl UserRepository {
    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE id = $1")
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn find_by_email(pool: &PgPool, email: &str) -> Result<Option<User>, sqlx::Error> {
        sqlx::query_as::<_, User>("SELECT * FROM users WHERE LOWER(email) = LOWER($1)")
            .bind(email)
            .fetch_optional(pool)
            .await
    }

    pub async fn create(
        pool: &PgPool,
        name: &str,
        email: &str,
        password_hash: &str,
        is_super_admin: bool,
    ) -> Result<User, sqlx::Error> {
        sqlx::query_as::<_, User>(
            r"INSERT INTO users (name, email, password_hash, is_super_admin)
            VALUES ($1, $2, $3, $4)
            RETURNING *",
        )
        .bind(name)
        .bind(email)
        .bind(password_hash)
        .bind(is_super_admin)
        .fetch_one(pool)
        .await
    }

    const UC_SELECT: &str =
        "id, user_id, company_id, role::text, permissions, is_active, created_at, updated_at";

    pub async fn get_user_companies(
        pool: &PgPool,
        user_id: Uuid,
    ) -> Result<Vec<UserCompany>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM user_companies WHERE user_id = $1 AND is_active = true",
            Self::UC_SELECT
        );
        sqlx::query_as::<_, UserCompany>(&sql)
            .bind(user_id)
            .fetch_all(pool)
            .await
    }

    pub async fn get_user_company(
        pool: &PgPool,
        user_id: Uuid,
        company_id: Uuid,
    ) -> Result<Option<UserCompany>, sqlx::Error> {
        let sql = format!(
            "SELECT {} FROM user_companies WHERE user_id = $1 AND company_id = $2 AND is_active = true",
            Self::UC_SELECT
        );
        sqlx::query_as::<_, UserCompany>(&sql)
            .bind(user_id)
            .bind(company_id)
            .fetch_optional(pool)
            .await
    }

    pub async fn add_to_company(
        pool: &PgPool,
        user_id: Uuid,
        company_id: Uuid,
        role: &str,
    ) -> Result<UserCompany, sqlx::Error> {
        let sql = format!(
            "INSERT INTO user_companies (user_id, company_id, role) VALUES ($1, $2, $3::user_role) RETURNING {}",
            Self::UC_SELECT
        );
        sqlx::query_as::<_, UserCompany>(&sql)
            .bind(user_id)
            .bind(company_id)
            .bind(role)
            .fetch_one(pool)
            .await
    }

    pub async fn list_by_company(
        pool: &PgPool,
        company_id: Uuid,
    ) -> Result<Vec<CompanyUser>, sqlx::Error> {
        sqlx::query_as::<_, CompanyUser>(
            r"SELECT u.id AS user_id, u.name, u.email,
                uc.role::text, uc.permissions, uc.is_active,
                uc.created_at AS joined_at
            FROM user_companies uc
            JOIN users u ON u.id = uc.user_id
            WHERE uc.company_id = $1
            ORDER BY uc.created_at DESC",
        )
        .bind(company_id)
        .fetch_all(pool)
        .await
    }

    pub async fn update_role(
        pool: &PgPool,
        user_id: Uuid,
        company_id: Uuid,
        role: &str,
    ) -> Result<UserCompany, sqlx::Error> {
        let sql = format!(
            r"UPDATE user_companies SET role = $3::user_role
            WHERE user_id = $1 AND company_id = $2
            RETURNING {}",
            Self::UC_SELECT
        );
        sqlx::query_as::<_, UserCompany>(&sql)
            .bind(user_id)
            .bind(company_id)
            .bind(role)
            .fetch_one(pool)
            .await
    }

    pub async fn deactivate_from_company(
        pool: &PgPool,
        user_id: Uuid,
        company_id: Uuid,
    ) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE user_companies SET is_active = false WHERE user_id = $1 AND company_id = $2",
        )
        .bind(user_id)
        .bind(company_id)
        .execute(pool)
        .await?;
        Ok(())
    }
}
