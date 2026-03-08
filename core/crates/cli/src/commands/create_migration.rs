use std::fs;
use std::path::Path;

pub fn run(name: &str) -> anyhow::Result<()> {
    let migrations_dir = Path::new("core/crates/dal/src/migrations");
    if !migrations_dir.exists() {
        anyhow::bail!(
            "Migrations directory not found at {}",
            migrations_dir.display()
        );
    }

    // Find the highest existing migration number
    let mut max_num: u32 = 0;
    for entry in fs::read_dir(migrations_dir)? {
        let entry = entry?;
        let fname = entry.file_name();
        let fname_str = fname.to_string_lossy();
        if let Some(num_str) = fname_str.split('_').next()
            && let Ok(num) = num_str.parse::<u32>()
            && num > max_num
        {
            max_num = num;
        }
    }

    let next_num = max_num + 1;
    let sanitized_name = name.replace(' ', "_").to_lowercase();
    let filename = format!("{next_num:05}_{sanitized_name}.sql");
    let filepath = migrations_dir.join(&filename);

    fs::write(
        &filepath,
        format!(
            "-- Migration: {name}\n-- Created: {}\n\n",
            chrono::Utc::now().format("%Y-%m-%d %H:%M:%S UTC")
        ),
    )?;

    println!("Created migration: {}", filepath.display());

    Ok(())
}
