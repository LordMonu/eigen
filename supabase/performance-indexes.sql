-- performance-indexes.sql
-- Indexes for the high-traffic sync/detail query shapes.
-- Paste into Supabase SQL Editor. Safe to run more than once.

CREATE INDEX IF NOT EXISTS idx_generations_client_created_desc
  ON generations (client_id, hf_created_at DESC, id DESC)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_generations_sync_unassigned_all
  ON generations (hf_created_at DESC, id DESC)
  WHERE client_id IS NULL
    AND is_irrelevant = false
    AND is_waste = false
    AND media_type <> 'feature';

CREATE INDEX IF NOT EXISTS idx_generations_sync_unassigned_by_label
  ON generations (hf_connection_label, hf_created_at DESC, id DESC)
  WHERE client_id IS NULL
    AND is_irrelevant = false
    AND is_waste = false
    AND media_type <> 'feature';

CREATE INDEX IF NOT EXISTS idx_generations_sync_assigned_by_label
  ON generations (hf_connection_label, hf_created_at DESC, id DESC)
  WHERE client_id IS NOT NULL
    AND is_waste = false
    AND is_irrelevant = false;

CREATE INDEX IF NOT EXISTS idx_generations_sync_wasted_by_label
  ON generations (hf_connection_label, hf_created_at DESC, id DESC)
  WHERE is_waste = true
    AND is_irrelevant = false;

CREATE INDEX IF NOT EXISTS idx_generations_sync_rd_by_label
  ON generations (hf_connection_label, hf_created_at DESC, id DESC)
  WHERE is_irrelevant = true;
