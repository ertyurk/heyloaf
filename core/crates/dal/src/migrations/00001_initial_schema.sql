-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Custom types
CREATE TYPE product_type AS ENUM ('raw', 'semi', 'finished', 'commercial', 'consumable');
CREATE TYPE product_status AS ENUM ('draft', 'inactive', 'active');
CREATE TYPE stock_status AS ENUM ('in_stock', 'out_of_stock', 'no_stock_required');
CREATE TYPE user_role AS ENUM ('admin', 'manager', 'user', 'cashier');

-- Trigger function for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Companies
CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    tax_number TEXT,
    tax_office TEXT,
    address TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    logo_url TEXT,
    default_currency TEXT NOT NULL DEFAULT 'TRY',
    default_tax_rate DOUBLE PRECISION NOT NULL DEFAULT 20.00,
    default_language TEXT NOT NULL DEFAULT 'tr',
    timezone TEXT NOT NULL DEFAULT 'Europe/Istanbul',
    settings JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER companies_updated_at
    BEFORE UPDATE ON companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Users
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    metadata JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- User-Company junction
CREATE TABLE user_companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    role user_role NOT NULL DEFAULT 'user',
    permissions JSONB NOT NULL DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, company_id)
);

CREATE TRIGGER user_companies_updated_at
    BEFORE UPDATE ON user_companies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Product Categories (hierarchical, max 5 depth)
CREATE TABLE product_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    parent_id UUID REFERENCES product_categories(id) ON DELETE RESTRICT,
    display_order INT NOT NULL DEFAULT 0,
    pos_visible BOOLEAN NOT NULL DEFAULT TRUE,
    status product_status NOT NULL DEFAULT 'active',
    depth INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT check_category_depth CHECK (depth <= 5)
);

CREATE TRIGGER product_categories_updated_at
    BEFORE UPDATE ON product_categories
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Partial unique index: name unique per company among active categories
CREATE UNIQUE INDEX idx_categories_unique_name
    ON product_categories(company_id, LOWER(name))
    WHERE status = 'active';

CREATE INDEX idx_categories_company ON product_categories(company_id);
CREATE INDEX idx_categories_parent ON product_categories(parent_id);

-- Products
CREATE TABLE products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    code TEXT,
    barcode TEXT,
    category_id UUID REFERENCES product_categories(id) ON DELETE SET NULL,
    product_type product_type NOT NULL,
    status product_status NOT NULL DEFAULT 'draft',
    stock_status stock_status NOT NULL DEFAULT 'no_stock_required',
    unit_of_measure TEXT NOT NULL DEFAULT 'piece',
    sale_unit_type TEXT,
    plu_type TEXT,
    plu_code TEXT,
    scale_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    tax_rate DOUBLE PRECISION,
    stock_tracking BOOLEAN NOT NULL DEFAULT TRUE,
    min_stock_level DOUBLE PRECISION,
    last_purchase_price DOUBLE PRECISION,
    calculated_cost DOUBLE PRECISION,
    image_url TEXT,
    recipe JSONB,
    purchase_options JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER products_updated_at
    BEFORE UPDATE ON products
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Partial unique index: code unique per company among active products
CREATE UNIQUE INDEX idx_products_unique_code
    ON products(company_id, LOWER(code))
    WHERE status = 'active' AND code IS NOT NULL;

CREATE INDEX idx_products_company ON products(company_id);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_type ON products(company_id, product_type);
CREATE INDEX idx_products_status ON products(company_id, status);
CREATE INDEX idx_products_barcode ON products(company_id, barcode) WHERE barcode IS NOT NULL;

-- Audit logs
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    entity_type TEXT NOT NULL,
    entity_id UUID NOT NULL,
    action TEXT NOT NULL,
    changes JSONB,
    user_id UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_logs_company ON audit_logs(company_id);
CREATE INDEX idx_audit_logs_created ON audit_logs(created_at DESC);

-- RLS helper function
CREATE OR REPLACE FUNCTION get_current_company_id() RETURNS UUID AS $$
    SELECT NULLIF(current_setting('app.current_company_id', true), '')::UUID;
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Enable RLS on all business tables
ALTER TABLE product_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY company_isolation_categories ON product_categories
    USING (company_id = get_current_company_id());

CREATE POLICY company_isolation_products ON products
    USING (company_id = get_current_company_id());

CREATE POLICY company_isolation_audit ON audit_logs
    USING (company_id = get_current_company_id());
