-- Eigen Studio — Phase 2 migration. Paste into Supabase SQL Editor. Idempotent.
-- Adds virality_scores per blueprint. Relies on existing helpers from
-- phase1.sql: user_active_org_ids().
--
-- Note: `summary` TEXT was added (vs. the original plan) so the per-score
-- verdict paragraph survives a page refresh. The route inserts it; the page
-- selects it; the panel renders it.

CREATE TABLE IF NOT EXISTS virality_scores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  blueprint_id UUID NOT NULL REFERENCES prompt_blueprints(id) ON DELETE CASCADE,
  tier SMALLINT NOT NULL DEFAULT 1,
  overall_score NUMERIC(5,2) NOT NULL,
  factor_breakdown JSONB NOT NULL,
  attention_curve JSONB,
  suggested_fixes JSONB,
  summary TEXT,
  enhancement_possible BOOLEAN NOT NULL DEFAULT true,
  model_version TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Idempotent for upgrades where `summary` was missing.
ALTER TABLE virality_scores ADD COLUMN IF NOT EXISTS summary TEXT;

CREATE INDEX IF NOT EXISTS idx_scores_blueprint
  ON virality_scores(blueprint_id, created_at DESC);

-- One tier-1 score per blueprint. The route checks for an existing row before
-- calling Gemini, but this index is the durable defense: two concurrent
-- requests (two tabs, double-mount, retry storm) both inserting will see
-- exactly one survive and the loser gets a duplicate-key error the route
-- can handle by re-reading. Tier > 1 is reserved for Phase 3 re-scoring of
-- enhanced variants, so this constraint is scoped to tier = 1.
CREATE UNIQUE INDEX IF NOT EXISTS idx_scores_blueprint_tier1_unique
  ON virality_scores(blueprint_id) WHERE tier = 1;

ALTER TABLE virality_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read scores" ON virality_scores;
CREATE POLICY "read scores" ON virality_scores FOR SELECT TO authenticated
  USING (blueprint_id IN (
    SELECT id FROM prompt_blueprints WHERE org_id IN (SELECT user_active_org_ids())
  ));

DROP POLICY IF EXISTS "insert scores" ON virality_scores;
CREATE POLICY "insert scores" ON virality_scores FOR INSERT TO authenticated
  WITH CHECK (blueprint_id IN (
    SELECT id FROM prompt_blueprints WHERE org_id IN (SELECT user_active_org_ids())
  ));
