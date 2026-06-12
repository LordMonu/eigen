-- Add is_default flag to clients (used for the R&D client that cannot be deleted)
-- Run this in Supabase SQL Editor

ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT FALSE;
