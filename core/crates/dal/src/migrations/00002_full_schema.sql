-- 00002: Full schema — remaining 18 tables for all features
-- Tables: payment_methods, currencies, marketplace_channels, price_lists,
--         price_list_items, contacts, invoices, stock, stock_movements,
--         stock_counts, pos_terminals, shifts, orders, order_items,
--         transactions, production_records, production_sessions, notifications

-- ─── Enums ──────────────────────────────────────────────────────────────────

CREATE TYPE contact_type AS ENUM ('supplier', 'customer', 'both');
CREATE TYPE contact_status AS ENUM ('active', 'inactive');
CREATE TYPE invoice_type AS ENUM ('purchase', 'sales');
CREATE TYPE invoice_status AS ENUM ('draft', 'pending', 'paid', 'overdue', 'cancelled');
CREATE TYPE movement_type AS ENUM ('in', 'out', 'transfer', 'adjustment');
CREATE TYPE movement_source AS ENUM ('purchase', 'sale', 'production', 'return', 'adjustment', 'transfer', 'manual', 'stock_count');
CREATE TYPE order_status AS ENUM ('completed', 'voided', 'returned');
CREATE TYPE shift_status AS ENUM ('open', 'closed');
CREATE TYPE channel_type AS ENUM ('pos', 'marketplace', 'wholesale', 'online');
CREATE TYPE transaction_type AS ENUM ('invoice', 'payment', 'receipt', 'purchase');
CREATE TYPE notification_type AS ENUM ('low_stock', 'overdue_invoice');

-- ─── Payment Methods ────────────────────────────────────────────────────────

CREATE TABLE payment_methods (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    is_default  BOOLEAN NOT NULL DEFAULT false,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_payment_methods_default
    ON payment_methods (company_id) WHERE is_default = true;

CREATE INDEX idx_payment_methods_company ON payment_methods (company_id);

CREATE TRIGGER set_updated_at_payment_methods
    BEFORE UPDATE ON payment_methods
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Currencies ─────────────────────────────────────────────────────────────

CREATE TABLE currencies (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code          TEXT NOT NULL,
    name          TEXT NOT NULL,
    symbol        TEXT NOT NULL DEFAULT '',
    exchange_rate DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    is_base       BOOLEAN NOT NULL DEFAULT false,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_currencies_code_company
    ON currencies (company_id, code);

CREATE UNIQUE INDEX idx_currencies_base
    ON currencies (company_id) WHERE is_base = true;

CREATE TRIGGER set_updated_at_currencies
    BEFORE UPDATE ON currencies
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Marketplace Channels ───────────────────────────────────────────────────

CREATE TABLE marketplace_channels (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    code        TEXT NOT NULL,
    name        TEXT NOT NULL,
    is_active   BOOLEAN NOT NULL DEFAULT true,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_marketplace_channels_code_company
    ON marketplace_channels (company_id, code);

CREATE TRIGGER set_updated_at_marketplace_channels
    BEFORE UPDATE ON marketplace_channels
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Price Lists ────────────────────────────────────────────────────────────

CREATE TABLE price_lists (
    id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id             UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name                   TEXT NOT NULL,
    channel_type           channel_type NOT NULL DEFAULT 'pos',
    marketplace_channel_id UUID REFERENCES marketplace_channels(id) ON DELETE SET NULL,
    city                   TEXT,
    is_active              BOOLEAN NOT NULL DEFAULT true,
    is_default             BOOLEAN NOT NULL DEFAULT false,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_price_lists_default
    ON price_lists (company_id) WHERE is_default = true;

CREATE INDEX idx_price_lists_company ON price_lists (company_id);

CREATE TRIGGER set_updated_at_price_lists
    BEFORE UPDATE ON price_lists
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Price List Items ───────────────────────────────────────────────────────

CREATE TABLE price_list_items (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    price_list_id UUID NOT NULL REFERENCES price_lists(id) ON DELETE CASCADE,
    product_id    UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    price         DOUBLE PRECISION NOT NULL DEFAULT 0,
    vat_rate      DOUBLE PRECISION,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_price_list_items_unique
    ON price_list_items (price_list_id, product_id);

CREATE INDEX idx_price_list_items_product ON price_list_items (product_id);

CREATE TRIGGER set_updated_at_price_list_items
    BEFORE UPDATE ON price_list_items
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Contacts ───────────────────────────────────────────────────────────────

CREATE TABLE contacts (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name           TEXT NOT NULL,
    contact_person TEXT,
    contact_type   contact_type NOT NULL DEFAULT 'supplier',
    tax_number     TEXT,
    tax_office     TEXT,
    phone          TEXT,
    email          TEXT,
    address        TEXT,
    balance        DOUBLE PRECISION NOT NULL DEFAULT 0,
    credit_limit   DOUBLE PRECISION,
    notes          TEXT,
    status         contact_status NOT NULL DEFAULT 'active',
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_contacts_name_company
    ON contacts (company_id, LOWER(name)) WHERE status = 'active';

CREATE INDEX idx_contacts_company ON contacts (company_id);
CREATE INDEX idx_contacts_type ON contacts (company_id, contact_type);

CREATE TRIGGER set_updated_at_contacts
    BEFORE UPDATE ON contacts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Invoices ───────────────────────────────────────────────────────────────

CREATE SEQUENCE invoice_purchase_seq;
CREATE SEQUENCE invoice_sales_seq;

CREATE TABLE invoices (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    invoice_number      TEXT NOT NULL,
    invoice_type        invoice_type NOT NULL,
    contact_id          UUID REFERENCES contacts(id) ON DELETE SET NULL,
    date                DATE NOT NULL DEFAULT CURRENT_DATE,
    due_date            DATE,
    currency_code       TEXT NOT NULL DEFAULT 'TRY',
    exchange_rate       DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    tax_number          TEXT,
    tax_office          TEXT,
    status              invoice_status NOT NULL DEFAULT 'draft',
    notes               TEXT,
    line_items          JSONB NOT NULL DEFAULT '[]',
    subtotal            DOUBLE PRECISION NOT NULL DEFAULT 0,
    tax_total           DOUBLE PRECISION NOT NULL DEFAULT 0,
    grand_total         DOUBLE PRECISION NOT NULL DEFAULT 0,
    base_currency_total DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_invoices_number_company
    ON invoices (company_id, invoice_number);

CREATE INDEX idx_invoices_company ON invoices (company_id);
CREATE INDEX idx_invoices_contact ON invoices (contact_id);
CREATE INDEX idx_invoices_type ON invoices (company_id, invoice_type);
CREATE INDEX idx_invoices_status ON invoices (company_id, status);
CREATE INDEX idx_invoices_date ON invoices (company_id, date);

CREATE TRIGGER set_updated_at_invoices
    BEFORE UPDATE ON invoices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Stock ──────────────────────────────────────────────────────────────────

CREATE TABLE stock (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id        UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    quantity          DOUBLE PRECISION NOT NULL DEFAULT 0,
    min_level         DOUBLE PRECISION,
    max_level         DOUBLE PRECISION,
    reserved_quantity DOUBLE PRECISION NOT NULL DEFAULT 0,
    location          TEXT,
    last_movement_at  TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_stock_product_company
    ON stock (company_id, product_id);

CREATE TRIGGER set_updated_at_stock
    BEFORE UPDATE ON stock
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Stock Movements ────────────────────────────────────────────────────────

CREATE TABLE stock_movements (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id     UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id     UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    movement_type  movement_type NOT NULL,
    source         movement_source NOT NULL,
    quantity       DOUBLE PRECISION NOT NULL,
    unit_price     DOUBLE PRECISION,
    total_price    DOUBLE PRECISION,
    vat_rate       DOUBLE PRECISION,
    reference_type TEXT,
    reference_id   UUID,
    description    TEXT,
    created_by     UUID NOT NULL REFERENCES users(id),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_movements_company ON stock_movements (company_id);
CREATE INDEX idx_stock_movements_product ON stock_movements (company_id, product_id);
CREATE INDEX idx_stock_movements_reference ON stock_movements (reference_type, reference_id);
CREATE INDEX idx_stock_movements_created ON stock_movements (company_id, created_at);

-- ─── Stock Counts ───────────────────────────────────────────────────────────

CREATE TABLE stock_counts (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    counted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    counted_by  UUID NOT NULL REFERENCES users(id),
    notes       TEXT,
    items       JSONB NOT NULL DEFAULT '[]',
    status      TEXT NOT NULL DEFAULT 'draft',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_stock_counts_company ON stock_counts (company_id);

CREATE TRIGGER set_updated_at_stock_counts
    BEFORE UPDATE ON stock_counts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── POS Terminals ──────────────────────────────────────────────────────────

CREATE TABLE pos_terminals (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name          TEXT NOT NULL,
    price_list_id UUID REFERENCES price_lists(id) ON DELETE SET NULL,
    is_active     BOOLEAN NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pos_terminals_company ON pos_terminals (company_id);

CREATE TRIGGER set_updated_at_pos_terminals
    BEFORE UPDATE ON pos_terminals
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Shifts ─────────────────────────────────────────────────────────────────

CREATE TABLE shifts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    terminal_id      UUID REFERENCES pos_terminals(id) ON DELETE SET NULL,
    cashier_id       UUID NOT NULL REFERENCES users(id),
    opening_balance  DOUBLE PRECISION NOT NULL DEFAULT 0,
    closing_balance  DOUBLE PRECISION,
    expected_balance DOUBLE PRECISION,
    status           shift_status NOT NULL DEFAULT 'open',
    opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at        TIMESTAMPTZ,
    notes            TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_shifts_company ON shifts (company_id);
CREATE INDEX idx_shifts_cashier ON shifts (company_id, cashier_id);
CREATE INDEX idx_shifts_status ON shifts (company_id, status);

CREATE TRIGGER set_updated_at_shifts
    BEFORE UPDATE ON shifts
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Orders ─────────────────────────────────────────────────────────────────

CREATE TABLE orders (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    order_number      TEXT NOT NULL,
    status            order_status NOT NULL DEFAULT 'completed',
    cashier_id        UUID NOT NULL REFERENCES users(id),
    shift_id          UUID REFERENCES shifts(id) ON DELETE SET NULL,
    terminal_id       UUID REFERENCES pos_terminals(id) ON DELETE SET NULL,
    subtotal          DOUBLE PRECISION NOT NULL DEFAULT 0,
    tax_total         DOUBLE PRECISION NOT NULL DEFAULT 0,
    total             DOUBLE PRECISION NOT NULL DEFAULT 0,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    notes             TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_orders_number_company
    ON orders (company_id, order_number);

CREATE INDEX idx_orders_company ON orders (company_id);
CREATE INDEX idx_orders_cashier ON orders (company_id, cashier_id);
CREATE INDEX idx_orders_status ON orders (company_id, status);
CREATE INDEX idx_orders_date ON orders (company_id, created_at);

CREATE TRIGGER set_updated_at_orders
    BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Order Items ────────────────────────────────────────────────────────────

CREATE TABLE order_items (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id     UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id   UUID REFERENCES products(id) ON DELETE SET NULL,
    product_name TEXT NOT NULL,
    variant_name TEXT,
    quantity     DOUBLE PRECISION NOT NULL DEFAULT 1,
    unit_price   DOUBLE PRECISION NOT NULL DEFAULT 0,
    vat_rate     DOUBLE PRECISION NOT NULL DEFAULT 0,
    line_total   DOUBLE PRECISION NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_items_order ON order_items (order_id);
CREATE INDEX idx_order_items_product ON order_items (product_id);

-- ─── Transactions ───────────────────────────────────────────────────────────

CREATE TABLE transactions (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    contact_id        UUID REFERENCES contacts(id) ON DELETE SET NULL,
    transaction_type  transaction_type NOT NULL,
    amount            DOUBLE PRECISION NOT NULL DEFAULT 0,
    date              DATE NOT NULL DEFAULT CURRENT_DATE,
    payment_method_id UUID REFERENCES payment_methods(id) ON DELETE SET NULL,
    reference_type    TEXT,
    reference_id      UUID,
    balance_after     DOUBLE PRECISION NOT NULL DEFAULT 0,
    description       TEXT,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_transactions_company ON transactions (company_id);
CREATE INDEX idx_transactions_contact ON transactions (company_id, contact_id);
CREATE INDEX idx_transactions_date ON transactions (company_id, date);
CREATE INDEX idx_transactions_reference ON transactions (reference_type, reference_id);

-- ─── Production Records ────────────────────────────────────────────────────

CREATE TABLE production_records (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    product_id   UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    variant_name TEXT,
    quantity     DOUBLE PRECISION NOT NULL DEFAULT 1,
    unit         TEXT NOT NULL DEFAULT 'adet',
    batch_size   DOUBLE PRECISION NOT NULL DEFAULT 1,
    materials    JSONB NOT NULL DEFAULT '[]',
    notes        TEXT,
    produced_by  UUID NOT NULL REFERENCES users(id),
    produced_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_production_records_company ON production_records (company_id);
CREATE INDEX idx_production_records_product ON production_records (company_id, product_id);
CREATE INDEX idx_production_records_date ON production_records (company_id, produced_at);

CREATE TRIGGER set_updated_at_production_records
    BEFORE UPDATE ON production_records
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Production Sessions ────────────────────────────────────────────────────

CREATE TABLE production_sessions (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    name         TEXT,
    status       TEXT NOT NULL DEFAULT 'open',
    items        JSONB NOT NULL DEFAULT '[]',
    completed_at TIMESTAMPTZ,
    completed_by UUID REFERENCES users(id),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_production_sessions_company ON production_sessions (company_id);
CREATE INDEX idx_production_sessions_status ON production_sessions (company_id, status);

CREATE TRIGGER set_updated_at_production_sessions
    BEFORE UPDATE ON production_sessions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ─── Notifications ──────────────────────────────────────────────────────────

CREATE TABLE notifications (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id        UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id           UUID REFERENCES users(id) ON DELETE CASCADE,
    notification_type notification_type NOT NULL,
    title             TEXT NOT NULL,
    message           TEXT NOT NULL DEFAULT '',
    is_read           BOOLEAN NOT NULL DEFAULT false,
    entity_type       TEXT,
    entity_id         UUID,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_notifications_user ON notifications (company_id, user_id, is_read);
CREATE INDEX idx_notifications_created ON notifications (company_id, created_at);

-- ─── RLS Policies ───────────────────────────────────────────────────────────

ALTER TABLE payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE price_list_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE pos_terminals ENABLE ROW LEVEL SECURITY;
ALTER TABLE shifts ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS policies (application-layer enforcement for now, DB-level as defense-in-depth)
CREATE POLICY company_isolation_payment_methods ON payment_methods
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_currencies ON currencies
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_marketplace_channels ON marketplace_channels
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_price_lists ON price_lists
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_price_list_items ON price_list_items
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_contacts ON contacts
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_invoices ON invoices
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_stock ON stock
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_stock_movements ON stock_movements
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_stock_counts ON stock_counts
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_pos_terminals ON pos_terminals
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_shifts ON shifts
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_orders ON orders
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_transactions ON transactions
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_production_records ON production_records
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_production_sessions ON production_sessions
    USING (company_id = get_current_company_id());
CREATE POLICY company_isolation_notifications ON notifications
    USING (company_id = get_current_company_id());
