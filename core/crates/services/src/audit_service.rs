use heyloaf_dal::repositories::audit::AuditRepository;
use sqlx::PgPool;
use uuid::Uuid;

#[derive(Clone)]
pub struct AuditService {
    pool: PgPool,
}

impl AuditService {
    #[must_use]
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }

    /// Fire-and-forget audit log. Never blocks the caller, never propagates errors.
    pub fn log(
        &self,
        company_id: Uuid,
        entity_type: String,
        entity_id: Uuid,
        action: String,
        changes: Option<serde_json::Value>,
        user_id: Uuid,
    ) {
        let pool = self.pool.clone();
        tokio::spawn(async move {
            if let Err(e) = AuditRepository::create(
                &pool,
                company_id,
                &entity_type,
                entity_id,
                &action,
                changes,
                user_id,
            )
            .await
            {
                tracing::error!(error = %e, "Failed to write audit log");
            }
        });
    }
}

/// Builder for constructing audit entries ergonomically
pub struct AuditBuilder {
    service: AuditService,
    company_id: Uuid,
    user_id: Uuid,
    entity_type: Option<String>,
    entity_id: Option<Uuid>,
    action: Option<String>,
    before: Option<serde_json::Value>,
    after: Option<serde_json::Value>,
}

impl AuditBuilder {
    #[must_use]
    pub fn new(service: AuditService, company_id: Uuid, user_id: Uuid) -> Self {
        Self {
            service,
            company_id,
            user_id,
            entity_type: None,
            entity_id: None,
            action: None,
            before: None,
            after: None,
        }
    }

    #[must_use]
    pub fn entity(mut self, entity_type: &str, entity_id: Uuid) -> Self {
        self.entity_type = Some(entity_type.to_string());
        self.entity_id = Some(entity_id);
        self
    }

    #[must_use]
    pub fn action(mut self, action: &str) -> Self {
        self.action = Some(action.to_string());
        self
    }

    pub fn before<T: serde::Serialize>(mut self, value: &T) -> Self {
        self.before = serde_json::to_value(value).ok();
        self
    }

    pub fn after<T: serde::Serialize>(mut self, value: &T) -> Self {
        self.after = serde_json::to_value(value).ok();
        self
    }

    /// Fire-and-forget. Logs the audit entry without blocking.
    pub fn emit(self) {
        let Some(entity_type) = self.entity_type else {
            return;
        };
        let Some(entity_id) = self.entity_id else {
            return;
        };
        let Some(action) = self.action else { return };

        let changes = match (&self.before, &self.after) {
            (Some(before), Some(after)) => Some(serde_json::json!({
                "before": before,
                "after": after,
            })),
            (None, Some(after)) => Some(serde_json::json!({ "after": after })),
            (Some(before), None) => Some(serde_json::json!({ "before": before })),
            (None, None) => None,
        };

        self.service.log(
            self.company_id,
            entity_type,
            entity_id,
            action,
            changes,
            self.user_id,
        );
    }
}
