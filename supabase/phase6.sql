-- Phase 6 migrations — idempotent.

-- Video types: add display_order for sorting
ALTER TABLE video_types
  ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- Org settings: add description field
ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS description TEXT;

-- "Leave org" for members: self-removal policy (non-master only)
DROP POLICY IF EXISTS "Member can leave org" ON memberships;
CREATE POLICY "Member can leave org" ON memberships
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    AND role != 'master'
  );
