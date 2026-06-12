-- Invitations: master can pre-approve emails so they skip the pending queue.

CREATE TABLE IF NOT EXISTS invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role membership_role NOT NULL DEFAULT 'creator',
  invited_by UUID NOT NULL REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  used_at TIMESTAMP WITH TIME ZONE,  -- set when the invitee joins
  UNIQUE(org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

-- RLS
ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org masters can manage invitations" ON invitations;
CREATE POLICY "Org masters can manage invitations" ON invitations
  FOR ALL TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()))
  WITH CHECK (org_id IN (SELECT user_active_org_ids()));

-- Override request_join_org to auto-accept if invitation exists
CREATE OR REPLACE FUNCTION request_join_org(
  target_org_id UUID,
  user_full_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_membership_id UUID;
  current_user_id UUID;
  inv RECORD;
  user_email TEXT;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Check if there's a pending invitation for this user's email
  SELECT email INTO user_email FROM auth.users WHERE id = current_user_id;

  SELECT i.id, i.role INTO inv
  FROM invitations i
  WHERE i.org_id = target_org_id
    AND i.email = user_email
    AND i.used_at IS NULL
  LIMIT 1;

  IF FOUND THEN
    -- Auto-approve: invitation exists
    INSERT INTO memberships (org_id, user_id, role, status, full_name, approved_at, approved_by)
    VALUES (target_org_id, current_user_id, inv.role, 'active', user_full_name, NOW(), current_user_id)
    RETURNING id INTO new_membership_id;

    UPDATE invitations SET used_at = NOW() WHERE id = inv.id;
  ELSE
    -- No invitation: go to pending as before
    INSERT INTO memberships (org_id, user_id, role, status, full_name)
    VALUES (target_org_id, current_user_id, 'creator', 'pending', user_full_name)
    RETURNING id INTO new_membership_id;
  END IF;

  RETURN new_membership_id;
END;
$$;
