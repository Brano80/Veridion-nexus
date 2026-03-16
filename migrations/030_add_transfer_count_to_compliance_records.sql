-- Add transfer_count to compliance_records for review queue burst grouping.
-- When multiple transfers to the same destination+partner occur before review, they are grouped.
ALTER TABLE compliance_records ADD COLUMN IF NOT EXISTS transfer_count INTEGER NOT NULL DEFAULT 1;
