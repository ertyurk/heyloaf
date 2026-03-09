use heyloaf_common::config::Config;
use heyloaf_services::audit_service::AuditService;
use heyloaf_services::notification_service::NotificationService;
use sqlx::PgPool;
use std::sync::Arc;

#[derive(Clone)]
pub struct AppState {
    pub pool: PgPool,
    pub config: Arc<Config>,
    pub audit: AuditService,
    pub notifications: NotificationService,
}

impl AppState {
    pub fn new(pool: PgPool, config: Config) -> Self {
        let audit = AuditService::new(pool.clone());
        let notifications = NotificationService::new(pool.clone());
        Self {
            pool,
            config: Arc::new(config),
            audit,
            notifications,
        }
    }
}
