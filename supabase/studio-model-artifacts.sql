-- supabase/studio-model-artifacts.sql — Studio Phase 7 (XGBoost).
-- Paste into Supabase SQL Editor. Idempotent.
--
-- One row per model_type. The Python training script
-- (scripts/train_virality_model.py) upserts a serialized XGBoost booster
-- + metrics + feature column list keyed by model_type. The Next.js scorer
-- doesn't read this table yet (Tier 2a retrieval-augmented from Phase 6
-- still runs); a future inference endpoint will load the latest artifact
-- for predictions.
--
-- Why no RLS:
--   This table is only read/written by the OFFLINE training pipeline which
--   uses SUPABASE_SERVICE_ROLE_KEY (the only thing in the codebase that
--   does). No app surface exposes it. If/when an in-app inference flow is
--   added it should ship with a SECURITY DEFINER read RPC scoped to the
--   caller's active orgs — not RLS, since model artifacts are organization-
--   agnostic for now.

CREATE TABLE IF NOT EXISTS studio_model_artifacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  model_type TEXT NOT NULL UNIQUE,            -- e.g. 'xgboost_v1'
  artifact_json JSONB NOT NULL,               -- includes serialized booster
  trained_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_model_artifacts_trained_at
  ON studio_model_artifacts(trained_at DESC);

-- Explicitly OFF — training pipeline uses service role and no authenticated
-- session reads this table.
ALTER TABLE studio_model_artifacts DISABLE ROW LEVEL SECURITY;
