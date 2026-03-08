use heyloaf_dal::repositories::company::CompanyRepository;

pub async fn run(name: &str, currency: &str, tax_rate: f64, language: &str) -> anyhow::Result<()> {
    let database_url = std::env::var("DATABASE_URL")?;
    let pool = heyloaf_dal::create_pool(&database_url).await?;

    let company = CompanyRepository::create(&pool, name, currency, tax_rate, language).await?;
    println!("Created company: {} (id: {})", company.name, company.id);

    Ok(())
}
