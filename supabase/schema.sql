-- Eigen — Phase 0 schema. Run this once in your Supabase SQL Editor.
--
-- `generations` is recreated to match the CLI-based adapter
-- (display_name, result_url, media_type, hf_created_at, …). This is safe in
-- Phase 0 because there is no real data yet. `clients` is preserved.

DROP TABLE IF EXISTS generations;

-- TABLE: clients (who you sell to)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  industry TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- TABLE: generations (the credit ledger)
CREATE TABLE generations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT NOT NULL UNIQUE,         -- job id from HF, dedupe key
  display_name TEXT NOT NULL,               -- "Kling v3.0", "Nano Banana 2", etc.
  job_set_type TEXT,                        -- "kling3_0", "nano_banana_flash", etc.
  result_url TEXT NOT NULL,                 -- CloudFront URL (video or image)
  media_type TEXT NOT NULL DEFAULT 'image', -- 'image' or 'video'
  prompt TEXT,                              -- params.prompt, truncated
  credits NUMERIC(12,4) NOT NULL DEFAULT 0, -- NEVER float. 0 = free model
  hf_created_at TIMESTAMP WITH TIME ZONE,   -- when HF created this job
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL, -- NULL = unassigned
  assigned_at TIMESTAMP WITH TIME ZONE,
  synced_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- SEED test clients (you'll assign your real generations to these)
INSERT INTO clients (name, industry) VALUES
  ('Cream Centre', 'Food & Beverage'),
  ('Canvas Strategies', 'Marketing Agency'),
  ('XPOLL', 'Content & News'),
  ('INKD', 'Video Production'),
  ('DIREKT', 'Creative Studio')
  ON CONFLICT (name) DO NOTHING;

-- Phase 0 is public (no auth yet) and uses the anon key directly, so RLS must
-- be OFF. If RLS is enabled with no policies, reads silently return [] and
-- writes fail with "violates row-level security policy". Phase 1 adds auth +
-- proper per-org RLS policies and turns this back on.
ALTER TABLE clients DISABLE ROW LEVEL SECURITY;
ALTER TABLE generations DISABLE ROW LEVEL SECURITY;
