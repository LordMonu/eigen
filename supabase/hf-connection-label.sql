-- Add hf_connection_label to generations for easy account identification

ALTER TABLE generations
  ADD COLUMN IF NOT EXISTS hf_connection_label TEXT;

CREATE INDEX IF NOT EXISTS idx_generations_hf_label
  ON generations(hf_connection_label);
