use argon2::password_hash::SaltString;
use argon2::password_hash::rand_core::OsRng;
use argon2::{Argon2, PasswordHasher};
use heyloaf_dal::repositories::user::UserRepository;

pub async fn run(
    name: &str,
    email: &str,
    password: &str,
    company_id: Option<uuid::Uuid>,
    role: &str,
    super_admin: bool,
) -> anyhow::Result<()> {
    let database_url = std::env::var("DATABASE_URL")?;
    let pool = heyloaf_dal::create_pool(&database_url).await?;

    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| anyhow::anyhow!("Password hashing failed: {e}"))?
        .to_string();

    let user = UserRepository::create(&pool, name, email, &password_hash, super_admin).await?;
    println!("Created user: {} (id: {})", user.name, user.id);

    if let Some(cid) = company_id {
        let uc = UserRepository::add_to_company(&pool, user.id, cid, role).await?;
        println!(
            "Assigned to company {} with role {}",
            uc.company_id, uc.role
        );
    }

    Ok(())
}
