-- Batch B: assigned_by, wastage columns on generations.
-- Run in Supabase SQL Editor.

ALTER TABLE generations ADD COLUMN IF NOT EXISTS assigned_by UUID REFERENCES auth.users(id);
ALTER TABLE generations ADD COLUMN IF NOT EXISTS is_waste BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS wasted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE generations ADD COLUMN IF NOT EXISTS wasted_by UUID REFERENCES auth.users(id);
