-- Add is_irrelevant flag to generations
-- Run this in Supabase SQL Editor

ALTER TABLE generations
  ADD COLUMN IF NOT EXISTS is_irrelevant BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for filtering irrelevant out of unassigned pool
CREATE INDEX IF NOT EXISTS generations_is_irrelevant_idx ON generations (is_irrelevant);
