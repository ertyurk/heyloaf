use crate::types::Language;

/// Keys for translatable error messages.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrorKey {
    InvalidCredentials,
    UserNotFound,
    ProductNotFound,
    CategoryNotFound,
    CompanyNotFound,
    DuplicateEmail,
    DuplicateProductCode,
    DuplicateCategoryName,
    Unauthorized,
    Forbidden,
    InternalError,
    ValidationError,
}

/// Translate an error key into a human-readable string for the given language.
#[must_use]
pub fn translate(key: ErrorKey, lang: Language) -> &'static str {
    match (key, lang) {
        // InvalidCredentials
        (ErrorKey::InvalidCredentials, Language::En) => "Invalid email or password",
        (ErrorKey::InvalidCredentials, Language::Tr) => "Ge\u{00e7}ersiz e-posta veya \u{015f}ifre",

        // UserNotFound
        (ErrorKey::UserNotFound, Language::En) => "User not found",
        (ErrorKey::UserNotFound, Language::Tr) => "Kullan\u{0131}c\u{0131} bulunamad\u{0131}",

        // ProductNotFound
        (ErrorKey::ProductNotFound, Language::En) => "Product not found",
        (ErrorKey::ProductNotFound, Language::Tr) => "\u{00dc}r\u{00fc}n bulunamad\u{0131}",

        // CategoryNotFound
        (ErrorKey::CategoryNotFound, Language::En) => "Category not found",
        (ErrorKey::CategoryNotFound, Language::Tr) => "Kategori bulunamad\u{0131}",

        // CompanyNotFound
        (ErrorKey::CompanyNotFound, Language::En) => "Company not found",
        (ErrorKey::CompanyNotFound, Language::Tr) => "\u{015e}irket bulunamad\u{0131}",

        // DuplicateEmail
        (ErrorKey::DuplicateEmail, Language::En) => "Email address is already in use",
        (ErrorKey::DuplicateEmail, Language::Tr) => {
            "Bu e-posta adresi zaten kullan\u{0131}l\u{0131}yor"
        }

        // DuplicateProductCode
        (ErrorKey::DuplicateProductCode, Language::En) => "Product code already exists",
        (ErrorKey::DuplicateProductCode, Language::Tr) => "\u{00dc}r\u{00fc}n kodu zaten mevcut",

        // DuplicateCategoryName
        (ErrorKey::DuplicateCategoryName, Language::En) => "Category name already exists",
        (ErrorKey::DuplicateCategoryName, Language::Tr) => "Kategori ad\u{0131} zaten mevcut",

        // Unauthorized
        (ErrorKey::Unauthorized, Language::En) => "You are not authorized to perform this action",
        (ErrorKey::Unauthorized, Language::Tr) => "Bu i\u{015f}lemi yapmaya yetkiniz yok",

        // Forbidden
        (ErrorKey::Forbidden, Language::En) => "Access denied",
        (ErrorKey::Forbidden, Language::Tr) => "Eri\u{015f}im reddedildi",

        // InternalError
        (ErrorKey::InternalError, Language::En) => "An internal error occurred",
        (ErrorKey::InternalError, Language::Tr) => "Dahili bir hata olu\u{015f}tu",

        // ValidationError
        (ErrorKey::ValidationError, Language::En) => "Validation failed",
        (ErrorKey::ValidationError, Language::Tr) => {
            "Do\u{011f}rulama ba\u{015f}ar\u{0131}s\u{0131}z oldu"
        }
    }
}
