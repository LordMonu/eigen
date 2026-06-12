-- ============================================================================
-- EIGEN — HIGGSFIELD CONNECTIONS (multi-account)
-- Run once in the Supabase SQL Editor (after phase3).
--
-- Lets a master connect MULTIPLE Higgsfield accounts per org via device-code
-- login, pick one as active, and sync from it. Tokens are stored ENCRYPTED
-- (AES-256-GCM, key in HF_TOKEN_ENC_KEY) — RLS lets org members read the row
-- (for sync) but the ciphertext is useless without the server-only key.
-- ============================================================================

CREATE TABLE IF NOT EXISTS hf_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  hf_email TEXT,
  -- AES-256-GCM ciphertext (iv:tag:data, base64). Never plaintext.
  access_token_enc TEXT NOT NULL,
  refresh_token_enc TEXT NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hf_connections_org ON hf_connections(org_id);
-- At most one active connection per org.
CREATE UNIQUE INDEX IF NOT EXISTS idx_hf_connections_one_active
  ON hf_connections(org_id) WHERE is_active;

-- updated_at trigger (function defined in phase3.sql)
DROP TRIGGER IF EXISTS set_hf_connections_updated_at ON hf_connections;
CREATE TRIGGER set_hf_connections_updated_at
  BEFORE UPDATE ON hf_connections
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ===== RLS =====
ALTER TABLE hf_connections ENABLE ROW LEVEL SECURITY;

-- Read: any active org member (sync needs the encrypted token; it's useless
-- without the server-only decryption key).
DROP POLICY IF EXISTS "Read org hf connections" ON hf_connections;
CREATE POLICY "Read org hf connections" ON hf_connections
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

-- Insert / Update / Delete: master only.
DROP POLICY IF EXISTS "Master insert hf connections" ON hf_connections;
CREATE POLICY "Master insert hf connections" ON hf_connections
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) = 'master'
  );

DROP POLICY IF EXISTS "Master update hf connections" ON hf_connections;
CREATE POLICY "Master update hf connections" ON hf_connections
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) = 'master'
  );

DROP POLICY IF EXISTS "Master delete hf connections" ON hf_connections;
CREATE POLICY "Master delete hf connections" ON hf_connections
  FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) = 'master'
  );

-- ===== TOKEN ROTATION RPC =====
-- Any active org member can sync, and a sync may refresh an expired token.
-- This SECURITY DEFINER function lets the sync route persist rotated tokens
-- (bypassing the master-only UPDATE policy) while still verifying the caller
-- is an active member of that connection's org.
CREATE OR REPLACE FUNCTION hf_rotate_tokens(
  p_id UUID,
  p_access_enc TEXT,
  p_refresh_enc TEXT,
  p_expires_at TIMESTAMP WITH TIME ZONE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  conn_org UUID;
BEGIN
  SELECT org_id INTO conn_org FROM hf_connections WHERE id = p_id;
  IF conn_org IS NULL THEN
    RAISE EXCEPTION 'Connection not found';
  END IF;
  IF conn_org NOT IN (SELECT org_id FROM memberships
                      WHERE user_id = auth.uid() AND status = 'active') THEN
    RAISE EXCEPTION 'Not a member of this org';
  END IF;

  UPDATE hf_connections
  SET access_token_enc = p_access_enc,
      refresh_token_enc = p_refresh_enc,
      expires_at = p_expires_at
  WHERE id = p_id;
END;
$$;

-- ===== VERIFICATION (optional) =====
-- SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename='hf_connections';
