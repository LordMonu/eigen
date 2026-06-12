-- Eigen Studio — Phase 5 migration. Paste into Supabase SQL Editor. Idempotent.
-- Relies on existing helpers from phase1.sql: user_active_org_ids(),
-- user_role_in_org(check_org_id UUID).
--
-- generation_outcomes is the proprietary training corpus for the Tier-2 scorer
-- (Phase 6). One row per blueprint + publication = the creator's recorded
-- real-world performance. `went_viral` is a HUMAN judgment, not computed —
-- it's a creator-supplied label.

CREATE TABLE IF NOT EXISTS generation_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  blueprint_id UUID REFERENCES prompt_blueprints(id) ON DELETE SET NULL,
  platform TEXT,
  published_url TEXT,
  published_at DATE,
  views BIGINT NOT NULL DEFAULT 0,
  watch_time_avg_seconds NUMERIC(8,2),
  shares BIGINT NOT NULL DEFAULT 0,
  saves BIGINT NOT NULL DEFAULT 0,
  comments BIGINT NOT NULL DEFAULT 0,
  likes BIGINT NOT NULL DEFAULT 0,
  went_viral BOOLEAN NOT NULL DEFAULT false,
  recorded_by UUID REFERENCES auth.users(id),
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_outcomes_org       ON generation_outcomes(org_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_outcomes_blueprint ON generation_outcomes(blueprint_id);

ALTER TABLE generation_outcomes ENABLE ROW LEVEL SECURITY;

-- Any active member of the org can SEE outcomes. They're shared training data.
DROP POLICY IF EXISTS "read outcomes" ON generation_outcomes;
CREATE POLICY "read outcomes" ON generation_outcomes FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

-- Any active member can INSERT — recording performance is a creator action.
DROP POLICY IF EXISTS "insert outcomes" ON generation_outcomes;
CREATE POLICY "insert outcomes" ON generation_outcomes FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT user_active_org_ids()));

-- UPDATE: the recorder can amend their own row; master/manager can fix anyone's.
DROP POLICY IF EXISTS "update outcomes" ON generation_outcomes;
CREATE POLICY "update outcomes" ON generation_outcomes FOR UPDATE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids())
    AND (recorded_by = auth.uid() OR user_role_in_org(org_id) IN ('master','manager')));

-- DELETE: master/manager only. Outcomes are training data — creators shouldn't
-- silently erase their failures.
DROP POLICY IF EXISTS "delete outcomes" ON generation_outcomes;
CREATE POLICY "delete outcomes" ON generation_outcomes FOR DELETE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) IN ('master','manager'));
