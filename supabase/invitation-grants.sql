-- Store HF connection grants alongside invitations so master picks them
-- in ONE step when inviting a user. Auto-create the grants when invitation
-- is accepted.

ALTER TABLE invitations
  ADD COLUMN IF NOT EXISTS connection_ids UUID[] DEFAULT '{}'::UUID[];

-- Override request_join_org again to also create HF grants from invitation
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
  conn_id UUID;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT email INTO user_email FROM auth.users WHERE id = current_user_id;

  SELECT i.id, i.role, i.connection_ids INTO inv
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

    -- Create HF grants from invitation
    IF inv.connection_ids IS NOT NULL AND array_length(inv.connection_ids, 1) > 0 THEN
      FOREACH conn_id IN ARRAY inv.connection_ids LOOP
        INSERT INTO hf_connection_grants (org_id, connection_id, user_id)
        VALUES (target_org_id, conn_id, current_user_id)
        ON CONFLICT (connection_id, user_id) DO NOTHING;
      END LOOP;
    END IF;

    UPDATE invitations SET used_at = NOW() WHERE id = inv.id;
  ELSE
    INSERT INTO memberships (org_id, user_id, role, status, full_name)
    VALUES (target_org_id, current_user_id, 'creator', 'pending', user_full_name)
    RETURNING id INTO new_membership_id;
  END IF;

  RETURN new_membership_id;
END;
$$;

-- New RPC: approve a pending membership AND grant HF accounts in one transaction
CREATE OR REPLACE FUNCTION approve_membership_with_grants(
  p_membership_id UUID,
  p_role membership_role,
  p_connection_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  current_user_id UUID;
  target_org_id UUID;
  target_user_id UUID;
  conn_id UUID;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  -- Verify caller is master in the target org
  SELECT org_id, user_id INTO target_org_id, target_user_id
  FROM memberships
  WHERE id = p_membership_id;

  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'Membership not found';
  END IF;

  IF user_role_in_org(target_org_id) != 'master' THEN
    RAISE EXCEPTION 'Only master can approve';
  END IF;

  -- Approve membership
  UPDATE memberships
  SET status = 'active',
      role = p_role,
      approved_at = NOW(),
      approved_by = current_user_id
  WHERE id = p_membership_id;

  -- Create HF grants
  IF p_connection_ids IS NOT NULL AND array_length(p_connection_ids, 1) > 0 THEN
    FOREACH conn_id IN ARRAY p_connection_ids LOOP
      INSERT INTO hf_connection_grants (org_id, connection_id, user_id)
      VALUES (target_org_id, conn_id, target_user_id)
      ON CONFLICT (connection_id, user_id) DO NOTHING;
    END LOOP;
  END IF;
END;
$$;
