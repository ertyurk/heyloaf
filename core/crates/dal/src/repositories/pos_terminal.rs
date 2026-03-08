use sqlx::PgPool;
use uuid::Uuid;

use crate::models::pos_terminal::PosTerminal;

pub struct PosTerminalRepository;

impl PosTerminalRepository {
    const SELECT: &str = r"id, company_id, name, price_list_id, is_active,
        created_at, updated_at";

    pub async fn find_by_id(pool: &PgPool, id: Uuid) -> Result<Option<PosTerminal>, sqlx::Error> {
        let sql = format!("SELECT {} FROM pos_terminals WHERE id = $1", Self::SELECT);
        sqlx::query_as::<_, PosTerminal>(&sql)
            .bind(id)
            .fetch_optional(pool)
            .await
    }

    pub async fn list(pool: &PgPool, company_id: Uuid) -> Result<Vec<PosTerminal>, sqlx::Error> {
        let sql = format!(
            r"SELECT {} FROM pos_terminals
            WHERE company_id = $1
            ORDER BY name",
            Self::SELECT
        );
        sqlx::query_as::<_, PosTerminal>(&sql)
            .bind(company_id)
            .fetch_all(pool)
            .await
    }

    pub async fn create(
        pool: &PgPool,
        company_id: Uuid,
        name: &str,
        price_list_id: Option<Uuid>,
    ) -> Result<PosTerminal, sqlx::Error> {
        let sql = format!(
            r"INSERT INTO pos_terminals (company_id, name, price_list_id)
            VALUES ($1, $2, $3)
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PosTerminal>(&sql)
            .bind(company_id)
            .bind(name)
            .bind(price_list_id)
            .fetch_one(pool)
            .await
    }

    pub async fn update(
        pool: &PgPool,
        id: Uuid,
        name: &str,
        price_list_id: Option<Uuid>,
        is_active: bool,
    ) -> Result<PosTerminal, sqlx::Error> {
        let sql = format!(
            r"UPDATE pos_terminals SET
                name = $2, price_list_id = $3, is_active = $4
            WHERE id = $1
            RETURNING {}",
            Self::SELECT
        );
        sqlx::query_as::<_, PosTerminal>(&sql)
            .bind(id)
            .bind(name)
            .bind(price_list_id)
            .bind(is_active)
            .fetch_one(pool)
            .await
    }

    pub async fn delete(pool: &PgPool, id: Uuid) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM pos_terminals WHERE id = $1")
            .bind(id)
            .execute(pool)
            .await?;
        Ok(())
    }
}
