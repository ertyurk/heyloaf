-- Per-company counters table to replace global PostgreSQL sequences.
-- Provides tenant-isolated numbering for invoices, orders, etc.
CREATE TABLE IF NOT EXISTS counters (
    company_id UUID NOT NULL REFERENCES companies(id),
    counter_type TEXT NOT NULL,
    last_value BIGINT NOT NULL DEFAULT 0,
    PRIMARY KEY (company_id, counter_type)
);
