-- Industries table: same pattern as video_types.
-- Run in Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS industries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  display_order INT NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(org_id, name)
);

ALTER TABLE industries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can read industries"
  ON industries FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'active'
    )
  );

CREATE POLICY "Master/manager can insert industries"
  ON industries FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('master', 'manager')
    )
  );

CREATE POLICY "Master can update industries"
  ON industries FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'master'
    )
  );

CREATE POLICY "Master can delete industries"
  ON industries FOR DELETE
  USING (
    org_id IN (
      SELECT org_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'active' AND role = 'master'
    )
  );
