use argon2::password_hash::SaltString;
use argon2::password_hash::rand_core::OsRng;
use argon2::{Argon2, PasswordHasher};
use heyloaf_dal::repositories::category::CategoryRepository;
use heyloaf_dal::repositories::company::CompanyRepository;
use heyloaf_dal::repositories::currency::CurrencyRepository;
use heyloaf_dal::repositories::payment_method::PaymentMethodRepository;
use heyloaf_dal::repositories::price_list::PriceListRepository;
use heyloaf_dal::repositories::product::ProductRepository;
use heyloaf_dal::repositories::user::UserRepository;

pub async fn run() -> anyhow::Result<()> {
    let database_url = std::env::var("DATABASE_URL")?;
    let pool = heyloaf_dal::create_pool(&database_url).await?;

    println!("Seeding development data...");

    // Create company
    let company = CompanyRepository::create(&pool, "Demo Bakery", "TRY", 20.0, "tr").await?;
    println!("  Created company: {} ({})", company.name, company.id);

    // Create admin user
    let salt = SaltString::generate(&mut OsRng);
    let password_hash = Argon2::default()
        .hash_password(b"admin123", &salt)
        .map_err(|e| anyhow::anyhow!("Password hashing failed: {e}"))?
        .to_string();

    let admin =
        UserRepository::create(&pool, "Admin", "admin@heyloaf.com", &password_hash, true).await?;
    println!("  Created admin user: {} ({})", admin.email, admin.id);

    let _uc = UserRepository::add_to_company(&pool, admin.id, company.id, "admin").await?;
    println!("  Assigned admin to company");

    // Create currencies
    let _try_currency =
        CurrencyRepository::create(&pool, company.id, "TRY", "Turkish Lira", "₺", 1.0, true)
            .await?;
    let _usd =
        CurrencyRepository::create(&pool, company.id, "USD", "US Dollar", "$", 0.03, false).await?;
    let _eur =
        CurrencyRepository::create(&pool, company.id, "EUR", "Euro", "€", 0.028, false).await?;
    println!("  Created 3 currencies");

    // Create payment methods
    let _cash = PaymentMethodRepository::create(&pool, company.id, "Cash", true, 0).await?;
    let _card = PaymentMethodRepository::create(&pool, company.id, "Credit Card", false, 1).await?;
    let _transfer =
        PaymentMethodRepository::create(&pool, company.id, "Bank Transfer", false, 2).await?;
    println!("  Created 3 payment methods");

    // Create default price list
    let _price_list = PriceListRepository::create(
        &pool,
        company.id,
        "Default POS Prices",
        "pos",
        None,
        None,
        true,
    )
    .await?;
    println!("  Created default price list");

    // Create categories
    let raw_cat = CategoryRepository::create(
        &pool,
        company.id,
        "Raw Materials",
        Some("Basic ingredients"),
        None,
        0,
        false,
    )
    .await?;
    let finished_cat = CategoryRepository::create(
        &pool,
        company.id,
        "Baked Goods",
        Some("Finished products"),
        None,
        1,
        true,
    )
    .await?;
    let drinks_cat = CategoryRepository::create(
        &pool,
        company.id,
        "Drinks",
        Some("Beverages"),
        None,
        2,
        true,
    )
    .await?;
    println!("  Created 3 categories");

    // Create products
    let _flour = ProductRepository::create(
        &pool,
        company.id,
        "Flour",
        Some("RAW-001"),
        None,
        Some(raw_cat.id),
        "raw",
        "kg",
        Some(20.0),
        true,
    )
    .await?;
    let _sugar = ProductRepository::create(
        &pool,
        company.id,
        "Sugar",
        Some("RAW-002"),
        None,
        Some(raw_cat.id),
        "raw",
        "kg",
        Some(20.0),
        true,
    )
    .await?;
    let _butter = ProductRepository::create(
        &pool,
        company.id,
        "Butter",
        Some("RAW-003"),
        None,
        Some(raw_cat.id),
        "raw",
        "kg",
        Some(20.0),
        true,
    )
    .await?;
    let _croissant = ProductRepository::create(
        &pool,
        company.id,
        "Croissant",
        Some("FIN-001"),
        None,
        Some(finished_cat.id),
        "finished",
        "piece",
        Some(20.0),
        true,
    )
    .await?;
    let _bread = ProductRepository::create(
        &pool,
        company.id,
        "Sourdough Bread",
        Some("FIN-002"),
        None,
        Some(finished_cat.id),
        "finished",
        "piece",
        Some(20.0),
        true,
    )
    .await?;
    let _water = ProductRepository::create(
        &pool,
        company.id,
        "Bottled Water",
        Some("COM-001"),
        None,
        Some(drinks_cat.id),
        "commercial",
        "piece",
        Some(20.0),
        true,
    )
    .await?;
    println!("  Created 6 products");

    println!("Seed complete!");
    println!();
    println!("Login credentials:");
    println!("  Email: admin@heyloaf.com");
    println!("  Password: admin123");

    Ok(())
}
