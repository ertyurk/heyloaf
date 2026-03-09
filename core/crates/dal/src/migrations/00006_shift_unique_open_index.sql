-- Prevent TOCTOU race: only one open shift per user per company.
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_shift_per_user
    ON shifts (company_id, cashier_id) WHERE status = 'open';
