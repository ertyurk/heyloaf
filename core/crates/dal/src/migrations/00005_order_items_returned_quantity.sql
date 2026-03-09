-- Track returned quantities per order item to prevent double-counting partial returns.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS returned_quantity NUMERIC NOT NULL DEFAULT 0;

-- Add 'partially_returned' to the order_status enum if not already present.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'partially_returned'
        AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'order_status')
    ) THEN
        ALTER TYPE order_status ADD VALUE 'partially_returned';
    END IF;
END$$;
