-- Eigen Studio — Phase 1 migration. Paste into Supabase SQL Editor. Idempotent.
-- Relies on existing helpers from phase1.sql: user_active_org_ids(),
-- user_role_in_org(check_org_id UUID).

DO $$ BEGIN CREATE TYPE studio_media_type AS ENUM ('video','image'); EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE TABLE IF NOT EXISTS prompt_blueprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  batch_id UUID NOT NULL,                                  -- groups variants from one brief
  work_id UUID REFERENCES works(id) ON DELETE SET NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id),
  media_type studio_media_type NOT NULL,
  brief TEXT NOT NULL,
  variant_label TEXT,
  parent_blueprint_id UUID REFERENCES prompt_blueprints(id) ON DELETE SET NULL, -- enhancement lineage (Phase 3)
  schema_json JSONB NOT NULL,
  rendered_prompt TEXT NOT NULL,
  is_enhanced BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_blueprints_org   ON prompt_blueprints(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_blueprints_batch ON prompt_blueprints(batch_id);
CREATE INDEX IF NOT EXISTS idx_blueprints_creator ON prompt_blueprints(created_by);

ALTER TABLE prompt_blueprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read org blueprints" ON prompt_blueprints;
CREATE POLICY "read org blueprints" ON prompt_blueprints FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

DROP POLICY IF EXISTS "insert org blueprints" ON prompt_blueprints;
CREATE POLICY "insert org blueprints" ON prompt_blueprints FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT user_active_org_ids()));

DROP POLICY IF EXISTS "update own or privileged blueprints" ON prompt_blueprints;
CREATE POLICY "update own or privileged blueprints" ON prompt_blueprints FOR UPDATE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids())
    AND (created_by = auth.uid() OR user_role_in_org(org_id) IN ('master','manager')));

DROP POLICY IF EXISTS "delete own or privileged blueprints" ON prompt_blueprints;
CREATE POLICY "delete own or privileged blueprints" ON prompt_blueprints FOR DELETE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids())
    AND (created_by = auth.uid() OR user_role_in_org(org_id) IN ('master','manager')));
