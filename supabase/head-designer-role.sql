-- EIGEN — add head_designer role with the same access level as manager.
-- Run this AFTER supabase/head-designer-role-enum.sql.

-- Clients
DROP POLICY IF EXISTS "Insert org clients" ON clients;
CREATE POLICY "Insert org clients" ON clients
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) IN ('master', 'manager', 'head_designer')
  );

DROP POLICY IF EXISTS "Update org clients" ON clients;
CREATE POLICY "Update org clients" ON clients
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) IN ('master', 'manager', 'head_designer')
  );

-- Video types + works + work instructions
DROP POLICY IF EXISTS "Master manager insert video types" ON video_types;
CREATE POLICY "Master manager insert video types" ON video_types
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) IN ('master', 'manager', 'head_designer')
  );

DROP POLICY IF EXISTS "Read works role-scoped" ON works;
CREATE POLICY "Read works role-scoped" ON works
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND (
      user_role_in_org(org_id) IN ('master', 'manager', 'head_designer')
      OR creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Master manager insert works" ON works;
CREATE POLICY "Master manager insert works" ON works
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) IN ('master', 'manager', 'head_designer')
  );

DROP POLICY IF EXISTS "Update works role-scoped" ON works;
CREATE POLICY "Update works role-scoped" ON works
  FOR UPDATE TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND (
      user_role_in_org(org_id) IN ('master', 'manager', 'head_designer')
      OR creator_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Master manager upload instructions" ON storage.objects;
CREATE POLICY "Master manager upload instructions" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'work-instructions'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_active_org_ids())
    AND user_role_in_org((storage.foldername(name))[1]::uuid) IN ('master', 'manager', 'head_designer')
  );

DROP POLICY IF EXISTS "Master manager delete instructions" ON storage.objects;
CREATE POLICY "Master manager delete instructions" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'work-instructions'
    AND (storage.foldername(name))[1]::uuid IN (SELECT user_active_org_ids())
    AND user_role_in_org((storage.foldername(name))[1]::uuid) IN ('master', 'manager', 'head_designer')
  );

-- Work creators
DROP POLICY IF EXISTS "Master/manager insert work_creators" ON work_creators;
CREATE POLICY "Master/manager insert work_creators" ON work_creators
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM works w
      WHERE w.id = work_creators.work_id
        AND w.org_id IN (SELECT user_active_org_ids())
        AND user_role_in_org(w.org_id) IN ('master', 'manager', 'head_designer')
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
        AND user_role_in_org(w.org_id) IN ('master', 'manager', 'head_designer')
    )
  );

-- Higgsfield generations visibility / assignment
DROP POLICY IF EXISTS "Read org generations" ON generations;
CREATE POLICY "Read org generations" ON generations
  FOR SELECT TO authenticated
  USING (
    org_id IN (SELECT user_active_org_ids())
    AND (
      user_role_in_org(org_id) IN ('master', 'manager', 'head_designer')
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
      user_role_in_org(org_id) IN ('master', 'manager', 'head_designer')
      OR hf_connection_id IN (
        SELECT connection_id FROM hf_connection_grants WHERE user_id = auth.uid()
      )
    )
  );

-- Industries
DROP POLICY IF EXISTS "Master/manager can insert industries" ON industries;
CREATE POLICY "Master/manager can insert industries"
  ON industries FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'active' AND role IN ('master', 'manager', 'head_designer')
    )
  );

-- Studio blueprints
DROP POLICY IF EXISTS "update own or privileged blueprints" ON prompt_blueprints;
CREATE POLICY "update own or privileged blueprints" ON prompt_blueprints FOR UPDATE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids())
    AND (created_by = auth.uid() OR user_role_in_org(org_id) IN ('master','manager','head_designer')));

DROP POLICY IF EXISTS "delete own or privileged blueprints" ON prompt_blueprints;
CREATE POLICY "delete own or privileged blueprints" ON prompt_blueprints FOR DELETE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids())
    AND (created_by = auth.uid() OR user_role_in_org(org_id) IN ('master','manager','head_designer')));

-- Studio outcomes
DROP POLICY IF EXISTS "update outcomes" ON generation_outcomes;
CREATE POLICY "update outcomes" ON generation_outcomes FOR UPDATE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids())
    AND (recorded_by = auth.uid() OR user_role_in_org(org_id) IN ('master','manager','head_designer')));

DROP POLICY IF EXISTS "delete outcomes" ON generation_outcomes;
CREATE POLICY "delete outcomes" ON generation_outcomes FOR DELETE TO authenticated
  USING (org_id IN (SELECT user_active_org_ids())
    AND user_role_in_org(org_id) IN ('master','manager','head_designer'));
