-- ============================================================================
-- EIGEN — PHASE 1 MIGRATION (auth + orgs + roles + RLS)
-- Run this ONCE in the Supabase SQL Editor.
--
-- WARNING: Step 1 wipes Phase 0 data (it has no org_id). Your 17 synced
-- generations + assignments will be removed; re-sync after creating an org.
-- ============================================================================

-- ===== STEP 1: Clean up Phase 0 test data (no org_id) =====
-- Single statement + CASCADE because generations has a FK to clients.
TRUNCATE TABLE generations, clients CASCADE;

-- ===== ENUMS =====
DO $$ BEGIN
  CREATE TYPE membership_role AS ENUM ('master', 'manager', 'creator');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE membership_status AS ENUM ('pending', 'active', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== ORGANIZATIONS =====
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id)
);

-- ===== MEMBERSHIPS =====
CREATE TABLE IF NOT EXISTS memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role membership_role NOT NULL DEFAULT 'creator',
  status membership_status NOT NULL DEFAULT 'pending',
  full_name TEXT NOT NULL,
  requested_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  approved_at TIMESTAMP WITH TIME ZONE,
  approved_by UUID REFERENCES auth.users(id),
  UNIQUE(org_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id, status);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(org_id, status);

-- ===== ADD org_id TO EXISTING TABLES =====
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

ALTER TABLE generations
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;

-- After truncating Phase 0 data, make org_id required
ALTER TABLE clients ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE generations ALTER COLUMN org_id SET NOT NULL;

-- Names unique within an org, not globally
ALTER TABLE clients DROP CONSTRAINT IF EXISTS clients_name_key;
ALTER TABLE clients ADD CONSTRAINT clients_org_name_unique UNIQUE (org_id, name);

-- Generations dedupe per org
ALTER TABLE generations DROP CONSTRAINT IF EXISTS unique_external_id;
ALTER TABLE generations DROP CONSTRAINT IF EXISTS generations_external_id_key;
ALTER TABLE generations ADD CONSTRAINT generations_org_external_unique UNIQUE (org_id, external_id);

-- ===== HELPER FUNCTIONS FOR RLS =====
CREATE OR REPLACE FUNCTION user_active_org_ids()
RETURNS SETOF UUID
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT org_id FROM memberships
  WHERE user_id = auth.uid() AND status = 'active'
$$;

CREATE OR REPLACE FUNCTION user_role_in_org(check_org_id UUID)
RETURNS membership_role
LANGUAGE SQL
SECURITY DEFINER
STABLE
AS $$
  SELECT role FROM memberships
  WHERE user_id = auth.uid()
    AND org_id = check_org_id
    AND status = 'active'
  LIMIT 1
$$;

-- ===== ATOMIC: CREATE ORG + MASTER MEMBERSHIP =====
CREATE OR REPLACE FUNCTION create_org_with_master(
  org_name TEXT,
  user_full_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_org_id UUID;
  current_user_id UUID;
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO organizations (name, created_by)
  VALUES (org_name, current_user_id)
  RETURNING id INTO new_org_id;

  INSERT INTO memberships (org_id, user_id, role, status, full_name, approved_at, approved_by)
  VALUES (
    new_org_id,
    current_user_id,
    'master',
    'active',
    user_full_name,
    NOW(),
    current_user_id
  );

  RETURN new_org_id;
END;
$$;

-- ===== ATOMIC: REQUEST TO JOIN ORG =====
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
BEGIN
  current_user_id := auth.uid();
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO memberships (org_id, user_id, role, status, full_name)
  VALUES (target_org_id, current_user_id, 'creator', 'pending', user_full_name)
  RETURNING id INTO new_membership_id;

  RETURN new_membership_id;
END;
$$;

-- ===== ROW LEVEL SECURITY =====

-- ORGANIZATIONS
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read all orgs" ON organizations;
CREATE POLICY "Read all orgs" ON organizations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Master updates own org" ON organizations;
CREATE POLICY "Master updates own org" ON organizations
  FOR UPDATE TO authenticated
  USING (user_role_in_org(id) = 'master');

-- MEMBERSHIPS
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "See own memberships and org members" ON memberships;
CREATE POLICY "See own memberships and org members" ON memberships
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR org_id IN (SELECT user_active_org_ids())
  );

DROP POLICY IF EXISTS "Master manages memberships" ON memberships;
CREATE POLICY "Master manages memberships" ON memberships
  FOR UPDATE TO authenticated
  USING (user_role_in_org(org_id) = 'master');

DROP POLICY IF EXISTS "Master deletes memberships" ON memberships;
CREATE POLICY "Master deletes memberships" ON memberships
  FOR DELETE TO authenticated
  USING (user_role_in_org(org_id) = 'master');

-- CLIENTS
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read org clients" ON clients;
CREATE POLICY "Read org clients" ON clients
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

DROP POLICY IF EXISTS "Insert org clients" ON clients;
CREATE POLICY "Insert org clients" ON clients
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT user_active_org_ids()));

DROP POLICY IF EXISTS "Update org clients" ON clients;
CREATE POLICY "Update org clients" ON clients
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

DROP POLICY IF EXISTS "Delete org clients" ON clients;
CREATE POLICY "Delete org clients" ON clients
  FOR DELETE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

-- GENERATIONS
ALTER TABLE generations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Read org generations" ON generations;
CREATE POLICY "Read org generations" ON generations
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

DROP POLICY IF EXISTS "Insert org generations" ON generations;
CREATE POLICY "Insert org generations" ON generations
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT user_active_org_ids()));

DROP POLICY IF EXISTS "Update org generations" ON generations;
CREATE POLICY "Update org generations" ON generations
  FOR UPDATE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

-- ===== VERIFICATION (optional) =====
-- SELECT unnest(enum_range(NULL::membership_role));    -- master, manager, creator
-- SELECT unnest(enum_range(NULL::membership_status));  -- pending, active, rejected
-- SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- SELECT tablename, policyname FROM pg_policies WHERE schemaname='public';
