-- activity-log.sql — audit trail for status changes, edits, and archives.
-- Paste into Supabase SQL Editor. Idempotent.

CREATE TABLE IF NOT EXISTS activity_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  entity_type text NOT NULL CHECK (entity_type IN ('work', 'client', 'user')),
  entity_id   uuid NOT NULL,
  action      text NOT NULL, -- 'status_changed', 'edited', 'archived'
  from_value  text,          -- previous status/value (nullable for new creations)
  to_value    text,          -- new status/value
  actor_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_name  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_log_entity ON activity_log (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_org ON activity_log (org_id, created_at DESC);

-- RLS: members can read their org's log; inserts happen via SECURITY DEFINER rpc.
ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members read own org activity" ON activity_log;
CREATE POLICY "Members read own org activity" ON activity_log
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'active' AND deleted_at IS NULL
    )
  );

-- SECURITY DEFINER RPC so client code can insert without needing direct INSERT policy.
CREATE OR REPLACE FUNCTION log_activity(
  p_org_id      uuid,
  p_entity_type text,
  p_entity_id   uuid,
  p_action      text,
  p_from_value  text,
  p_to_value    text,
  p_actor_name  text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO activity_log (org_id, entity_type, entity_id, action, from_value, to_value, actor_id, actor_name)
  VALUES (p_org_id, p_entity_type, p_entity_id, p_action, p_from_value, p_to_value, auth.uid(), p_actor_name);
END;
$$;
