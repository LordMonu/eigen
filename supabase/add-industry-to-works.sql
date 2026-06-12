-- Add industry column to works table
ALTER TABLE works ADD COLUMN IF NOT EXISTS industry TEXT;
