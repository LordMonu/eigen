-- ============================================================================
-- EIGEN — PER-ACCOUNT HIGGSFIELD ACCESS FOR CREATORS
-- Run once in the Supabase SQL Editor (after hf-connections.sql).
--
-- Master/manager can use ALL connected HF accounts. Creators can use only the
-- accounts a master grants them. Each generation is tagged with its source
-- account so visibility (RLS) follows the grant automatically.
-- ============================================================================

-- 1) Tag generations with their source HF connection.
ALTER TABLE generations
  ADD COLUMN IF NOT EXISTS hf_connection_id UUID
    REFERENCES hf_connections(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_generations_hf_connection
  ON generations(hf_connection_id);

-- 2) Allow MULTIPLE enabled accounts per org (drop the one-active unique index).
DROP INDEX IF EXISTS idx_hf_connections_one_active;

-- 3) Per-creator access grants.
CREATE TABLE IF NOT EXISTS hf_connection_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  connection_id UUID NOT NULL REFERENCES hf_connections(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(connection_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_hf_grants_user ON hf_connection_grants(user_id);
CREATE INDEX IF NOT EXISTS idx_hf_grants_conn ON hf_connection_grants(connection_id);

ALTER TABLE hf_connection_grants ENABLE ROW LEVEL SECURITY;

-- Read: any active org member (creators read their own; master reads all to manage).
DROP POLICY IF EXISTS "Read org hf grants" ON hf_connection_grants;
CREATE POLICY "Read org hf grants" ON hf_connection_grants
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

-- Insert / Delete: master only.
DROP POLICY IF EXISTS "Master insert hf grants" ON hf_connection_grants;
CREATE POLICY "Master insert hf grants" ON hf_connection_grants
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) = 'master'
  );

DROP POLICY IF EXISTS "Master delete hf grants" ON hf_connection_grants;
CREATE POLICY "Master delete hf grants" ON hf_connection_grants
  FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) = 'master'
  );

-- 4) Re-scope generations RLS: master/manager see/assign all; creators only
--    generations from accounts granted to them.
DROP POLICY IF EXISTS "Read org generations" ON generations;
CREATE POLICY "Read org generations" ON generations
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND (
      user_role_in_org(org_id) IN ('master', 'manager')
      OR hf_connection_id IN (
        SELECT connection_id FROM hf_connection_grants WHERE user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "Update org generations" ON generations;
CREATE POLICY "Update org generations" ON generations
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND (
      user_role_in_org(org_id) IN ('master', 'manager')
      OR hf_connection_id IN (
        SELECT connection_id FROM hf_connection_grants WHERE user_id = auth.uid()
      )
    )
  );

-- Insert policy: any active member can sync into their org.
-- The sync route validates they only pull from accounts they have access to.
DROP POLICY IF EXISTS "Insert org generations" ON generations;
CREATE POLICY "Insert org generations" ON generations
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT user_active_org_ids())
  );

-- ===== VERIFICATION (optional) =====
-- SELECT column_name FROM information_schema.columns
--   WHERE table_name='generations' AND column_name='hf_connection_id';
-- SELECT tablename FROM pg_tables WHERE tablename='hf_connection_grants';
