-- ============================================================================
-- EIGEN — PHASE 2 MIGRATION (Clients: status pipeline + role-aware RLS)
-- Run this ONCE in the Supabase SQL Editor (after Phase 1).
-- ============================================================================

-- ===== CLIENT STATUS ENUM =====
DO $$ BEGIN
  CREATE TYPE client_status AS ENUM (
    'ongoing', 'trial', 'in_talk', 'outreach', 'paused', 'ended'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== ADD status COLUMN TO clients =====
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS status client_status NOT NULL DEFAULT 'outreach';

CREATE INDEX IF NOT EXISTS idx_clients_org_status ON clients(org_id, status);

-- ===== ROLE-AWARE RLS for clients =====
-- Read: any active org member (creators need to see clients to assign generations)
-- Insert/Update: master + manager only
-- Delete: master only

DROP POLICY IF EXISTS "Read org clients" ON clients;
CREATE POLICY "Read org clients" ON clients
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

DROP POLICY IF EXISTS "Insert org clients" ON clients;
CREATE POLICY "Insert org clients" ON clients
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) IN ('master', 'manager')
  );

DROP POLICY IF EXISTS "Update org clients" ON clients;
CREATE POLICY "Update org clients" ON clients
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) IN ('master', 'manager')
  );

DROP POLICY IF EXISTS "Delete org clients" ON clients;
CREATE POLICY "Delete org clients" ON clients
  FOR DELETE TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) = 'master'  -- only master can delete
  );

-- ===== VERIFICATION (optional) =====
-- SELECT unnest(enum_range(NULL::client_status));  -- ongoing, trial, in_talk, outreach, paused, ended
-- SELECT name, status FROM clients;
