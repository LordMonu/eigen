-- ============================================================================
-- EIGEN — PHASE 3 MIGRATION (Works: lifecycle, video types, storage, RLS)
-- Run this ONCE in the Supabase SQL Editor (after Phase 2).
-- ============================================================================

-- ===== WORK STATUS ENUM =====
DO $$ BEGIN
  CREATE TYPE work_status AS ENUM (
    'ongoing', 'paused', 'in_review', 'rework', 'completed'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ===== VIDEO TYPES (per-org) =====
CREATE TABLE IF NOT EXISTS video_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(org_id, name)
);

CREATE INDEX IF NOT EXISTS idx_video_types_org ON video_types(org_id);

-- ===== WORKS =====
CREATE TABLE IF NOT EXISTS works (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES auth.users(id),
  title TEXT,
  video_type TEXT,
  max_credits NUMERIC(12,4),
  instructions_path TEXT,                  -- path in Storage
  start_date DATE,
  end_date DATE,
  start_time TIME,
  end_time TIME,
  status work_status NOT NULL DEFAULT 'ongoing',
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_works_org_status ON works(org_id, status);
CREATE INDEX IF NOT EXISTS idx_works_creator ON works(creator_id, status);
CREATE INDEX IF NOT EXISTS idx_works_client ON works(client_id);

-- ===== ADD work_id TO generations =====
ALTER TABLE generations
  ADD COLUMN IF NOT EXISTS work_id UUID REFERENCES works(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_generations_work ON generations(work_id);

-- ===== AUTO updated_at TRIGGER =====
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_works_updated_at ON works;
CREATE TRIGGER set_works_updated_at
  BEFORE UPDATE ON works
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ===== RLS: VIDEO TYPES =====
ALTER TABLE video_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Read org video types" ON video_types;
CREATE POLICY "Read org video types" ON video_types
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT user_active_org_ids()));

DROP POLICY IF EXISTS "Master manager insert video types" ON video_types;
CREATE POLICY "Master manager insert video types" ON video_types
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) IN ('master', 'manager')
  );

-- ===== RLS: WORKS =====
ALTER TABLE works ENABLE ROW LEVEL SECURITY;

-- Read: master/manager see all org works; creator sees only their own
DROP POLICY IF EXISTS "Read works role-scoped" ON works;
CREATE POLICY "Read works role-scoped" ON works
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND (
      user_role_in_org(org_id) IN ('master', 'manager')
      OR creator_id = auth.uid()
    )
  );

-- Insert: master/manager only
DROP POLICY IF EXISTS "Master manager insert works" ON works;
CREATE POLICY "Master manager insert works" ON works
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) IN ('master', 'manager')
  );

-- Update: master/manager any; creator only their own (transitions enforced in API)
DROP POLICY IF EXISTS "Update works role-scoped" ON works;
CREATE POLICY "Update works role-scoped" ON works
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND (
      user_role_in_org(org_id) IN ('master', 'manager')
      OR creator_id = auth.uid()
    )
  );

-- Delete: master only
DROP POLICY IF EXISTS "Master delete works" ON works;
CREATE POLICY "Master delete works" ON works
  FOR DELETE TO authenticated
  USING (user_role_in_org(org_id) = 'master');

-- ===== STORAGE BUCKET FOR INSTRUCTIONS =====
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'work-instructions',
  'work-instructions',
  false,
  5242880,  -- 5MB
  ARRAY['text/markdown', 'text/plain', 'application/octet-stream']
)
ON CONFLICT (id) DO NOTHING;

-- Path structure: {org_id}/{work_id}/instructions.md

DROP POLICY IF EXISTS "Read org work instructions" ON storage.objects;
CREATE POLICY "Read org work instructions" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'work-instructions'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_active_org_ids())
  );

DROP POLICY IF EXISTS "Master manager upload instructions" ON storage.objects;
CREATE POLICY "Master manager upload instructions" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'work-instructions'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_active_org_ids())
    AND user_role_in_org((storage.foldername(name))[1]::uuid) IN ('master', 'manager')
  );

DROP POLICY IF EXISTS "Master manager delete instructions" ON storage.objects;
CREATE POLICY "Master manager delete instructions" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'work-instructions'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_active_org_ids())
    AND user_role_in_org((storage.foldername(name))[1]::uuid) IN ('master', 'manager')
  );

-- ===== VERIFICATION (optional) =====
-- SELECT unnest(enum_range(NULL::work_status));
-- SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename;
-- SELECT id, name FROM storage.buckets WHERE id = 'work-instructions';
