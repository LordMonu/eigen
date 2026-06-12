-- aggregation-rpcs.sql — performance migration. REQUIRED for prod.
-- Paste into the Supabase SQL Editor AFTER running all prior migrations.
-- These RPCs aggregate generations server-side in Postgres instead of
-- fetching every row to Node — eliminates the largest payload on the wire
-- and stops the 2-3s shimmer on every list/detail page.
--
-- All functions use SECURITY INVOKER so existing RLS policies apply.
-- Idempotent: safe to run multiple times.

-- ============================================================
-- WORKS LIST PAGE — /app/works
-- ============================================================

-- 1. Works + per-work credit total, all in one call.
-- Replaces: SELECT works + SELECT generations + JS reduce.
CREATE OR REPLACE FUNCTION works_with_credit_totals()
RETURNS TABLE(
  id uuid,
  title text,
  video_type text,
  status text,
  start_date date,
  end_date date,
  end_time time,
  max_credits text,
  creator_id uuid,
  client_id uuid,
  credit_sum numeric,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    w.id, w.title, w.video_type, w.status,
    w.start_date, w.end_date, w.end_time,
    w.max_credits, w.creator_id, w.client_id,
    COALESCE(g.credit_sum, 0) AS credit_sum,
    w.created_at
  FROM works w
  LEFT JOIN (
    SELECT work_id, SUM(credits::numeric) AS credit_sum
    FROM generations
    WHERE work_id IS NOT NULL
    GROUP BY work_id
  ) g ON g.work_id = w.id
  ORDER BY w.created_at DESC;
$$;

-- ============================================================
-- CLIENTS LIST PAGE — /app/clients
-- ============================================================

-- 2. Clients + total credits + generation count per client.
-- Replaces: SELECT clients + SELECT all generations + JS reduce.
CREATE OR REPLACE FUNCTION clients_with_credit_totals()
RETURNS TABLE(
  id uuid,
  name text,
  industry text,
  status text,
  total_credits numeric,
  generation_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    c.id, c.name, c.industry, c.status,
    COALESCE(g.credit_sum, 0),
    COALESCE(g.gen_count, 0)
  FROM clients c
  LEFT JOIN (
    SELECT client_id, SUM(credits::numeric) AS credit_sum, COUNT(*) AS gen_count
    FROM generations
    WHERE client_id IS NOT NULL
    GROUP BY client_id
  ) g ON g.client_id = c.id;
$$;

-- ============================================================
-- CLIENT DETAIL PAGE — /app/clients/[id]
-- ============================================================

-- 3. Per-work credit totals scoped to a single client + optional date range.
CREATE OR REPLACE FUNCTION client_works_with_credit_totals(
  p_client_id uuid,
  p_from_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  id uuid,
  title text,
  video_type text,
  status text,
  end_date date,
  max_credits text,
  creator_id uuid,
  credit_sum numeric,
  created_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    w.id, w.title, w.video_type, w.status,
    w.end_date, w.max_credits, w.creator_id,
    COALESCE((
      SELECT SUM(g.credits::numeric)
      FROM generations g
      WHERE g.work_id = w.id
        AND (p_from_date IS NULL OR g.hf_created_at >= p_from_date)
    ), 0),
    w.created_at
  FROM works w
  WHERE w.client_id = p_client_id
  ORDER BY w.created_at DESC;
$$;

-- 4. Total credits + generation count for a client + optional date range.
CREATE OR REPLACE FUNCTION client_credit_summary(
  p_client_id uuid,
  p_from_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  total_credits numeric,
  generation_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    COALESCE(SUM(credits::numeric), 0),
    COUNT(*)
  FROM generations
  WHERE client_id = p_client_id
    AND (p_from_date IS NULL OR hf_created_at >= p_from_date);
$$;

-- 5. Per-work, per-user credit breakdown (actual/wastage/rework) for a client.
-- Drives the WorkUserReport on the client detail page.
CREATE OR REPLACE FUNCTION client_work_user_breakdown(
  p_client_id uuid,
  p_from_date timestamptz DEFAULT NULL
)
RETURNS TABLE(
  work_id uuid,
  assigned_by uuid,
  actual_credits numeric,
  wastage_credits numeric,
  rework_credits numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    g.work_id,
    g.assigned_by,
    COALESCE(SUM(CASE
      WHEN NOT COALESCE(g.is_waste, false)
        AND (w.status IS NULL OR w.status <> 'rework')
        AND g.credits::numeric > 0
      THEN g.credits::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN COALESCE(g.is_waste, false)
        AND g.credits::numeric > 0
      THEN g.credits::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN NOT COALESCE(g.is_waste, false)
        AND w.status = 'rework'
        AND g.credits::numeric > 0
      THEN g.credits::numeric ELSE 0 END), 0)
  FROM generations g
  LEFT JOIN works w ON w.id = g.work_id
  WHERE g.client_id = p_client_id
    AND g.work_id IS NOT NULL
    AND g.assigned_by IS NOT NULL
    AND (p_from_date IS NULL OR g.hf_created_at >= p_from_date)
  GROUP BY g.work_id, g.assigned_by;
$$;

-- ============================================================
-- WORK DETAIL PAGE — /app/works/[id]
-- ============================================================

-- 6. Per-creator (actual/wastage/rework) credit breakdown for a single work + its client.
-- Drives the SyncAndAssign panel's "Credit breakdown by user" stats.
CREATE OR REPLACE FUNCTION work_creator_breakdown(
  p_client_id uuid,
  p_work_id uuid
)
RETURNS TABLE(
  assigned_by uuid,
  actual_credits numeric,
  wastage_credits numeric,
  rework_credits numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    g.assigned_by,
    COALESCE(SUM(CASE
      WHEN g.work_id = p_work_id AND NOT COALESCE(g.is_waste, false)
      THEN g.credits::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN g.work_id = p_work_id AND COALESCE(g.is_waste, false)
      THEN g.credits::numeric ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN w.status = 'rework' THEN g.credits::numeric ELSE 0 END), 0)
  FROM generations g
  LEFT JOIN works w ON w.id = g.work_id
  WHERE g.client_id = p_client_id
    AND g.assigned_by IS NOT NULL
  GROUP BY g.assigned_by;
$$;

-- 7. Total credits used on a single work (drives the "Budget" tile + progress bar).
CREATE OR REPLACE FUNCTION work_credit_total(p_work_id uuid)
RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(SUM(credits::numeric), 0)
  FROM generations
  WHERE work_id = p_work_id;
$$;

-- ============================================================
-- DASHBOARD — /app/dashboard
-- ============================================================

-- 8. Org-wide credit totals.
CREATE OR REPLACE FUNCTION dashboard_generation_stats()
RETURNS TABLE(
  total_credits numeric,
  unassigned_credits numeric,
  generation_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    COALESCE(SUM(credits::numeric), 0),
    COALESCE(SUM(CASE WHEN client_id IS NULL THEN credits::numeric ELSE 0 END), 0),
    COUNT(*)
  FROM generations;
$$;

-- 9. Credits across a set of work IDs (dashboard "credits I used" tile).
CREATE OR REPLACE FUNCTION credits_for_works(p_work_ids uuid[])
RETURNS numeric
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT COALESCE(SUM(credits::numeric), 0)
  FROM generations
  WHERE work_id = ANY(p_work_ids);
$$;

-- ============================================================
-- INDEXES — required for the .in() filters and aggregations above.
-- Missing any of these turns the queries into seq scans.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_generations_client_id ON generations(client_id);
CREATE INDEX IF NOT EXISTS idx_generations_work_id ON generations(work_id);
CREATE INDEX IF NOT EXISTS idx_generations_assigned_by ON generations(assigned_by);
CREATE INDEX IF NOT EXISTS idx_generations_hf_created_at ON generations(hf_created_at DESC);
CREATE INDEX IF NOT EXISTS idx_generations_is_waste ON generations(is_waste) WHERE is_waste = true;
CREATE INDEX IF NOT EXISTS idx_works_created_at ON works(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_works_client_id ON works(client_id);
CREATE INDEX IF NOT EXISTS idx_works_status ON works(status);
CREATE INDEX IF NOT EXISTS idx_work_creators_work_id ON work_creators(work_id);
CREATE INDEX IF NOT EXISTS idx_work_creators_user_id ON work_creators(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_user_id ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
