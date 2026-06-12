-- Multi-creator support for works.
-- A work can now be co-owned by any number of active org members. The
-- existing works.creator_id stays as the "primary creator" pointer (used by
-- dashboard / reports / display fallback) but the work_creators join table
-- is the source of truth for "is user X assigned to this work".

CREATE TABLE IF NOT EXISTS work_creators (
  work_id UUID NOT NULL REFERENCES works(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id),
  added_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  PRIMARY KEY (work_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_work_creators_user
  ON work_creators(user_id);

-- Backfill: every existing work's primary creator becomes their first row.
INSERT INTO work_creators (work_id, user_id, added_by, added_at)
SELECT
  w.id,
  w.creator_id,
  w.created_by,
  COALESCE(w.created_at, NOW())
FROM works w
WHERE w.creator_id IS NOT NULL
ON CONFLICT DO NOTHING;

-- ===== RLS =====
ALTER TABLE work_creators ENABLE ROW LEVEL SECURITY;

-- Helper: is the work in the caller's active org?
-- (Reuses the existing user_active_org_ids() helper from phase1.sql.)
DROP POLICY IF EXISTS "Read work_creators in own org" ON work_creators;
CREATE POLICY "Read work_creators in own org" ON work_creators
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works w
      WHERE w.id = work_creators.work_id
        AND w.org_id IN (SELECT user_active_org_ids())
    )
  );

-- Insert / Delete: master + manager only. Same gate as works.edit in rbac.ts.
DROP POLICY IF EXISTS "Master/manager insert work_creators" ON work_creators;
CREATE POLICY "Master/manager insert work_creators" ON work_creators
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM works w
      WHERE w.id = work_creators.work_id
        AND w.org_id IN (SELECT user_active_org_ids())
        AND user_role_in_org(w.org_id) IN ('master', 'manager')
    )
  );

DROP POLICY IF EXISTS "Master/manager delete work_creators" ON work_creators;
CREATE POLICY "Master/manager delete work_creators" ON work_creators
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM works w
      WHERE w.id = work_creators.work_id
        AND w.org_id IN (SELECT user_active_org_ids())
        AND user_role_in_org(w.org_id) IN ('master', 'manager')
    )
  );
