-- aggregation-rpcs.sql — performance migration. REQUIRED for prod.
-- Paste into the Supabase SQL Editor AFTER running all prior migrations.
-- These RPCs aggregate generations server-side in Postgres instead of
-- fetching every row to Node — eliminates the largest payload on the wire
-- and stops the 2-3s shimmer on every list/detail page.
--
-- All functions use SECURITY INVOKER so existing RLS policies apply.
-- Idempotent: DROP + CREATE handles return-type changes (e.g. soft-delete.sql).

DROP FUNCTION IF EXISTS works_with_credit_totals();
DROP FUNCTION IF EXISTS clients_with_credit_totals();
DROP FUNCTION IF EXISTS client_works_with_credit_totals(uuid, timestamptz);
DROP FUNCTION IF EXISTS client_credit_summary(uuid, timestamptz);
DROP FUNCTION IF EXISTS client_work_user_breakdown(uuid, timestamptz);
DROP FUNCTION IF EXISTS work_creator_breakdown(uuid, uuid);
DROP FUNCTION IF EXISTS work_credit_total(uuid);
DROP FUNCTION IF EXISTS dashboard_generation_stats();
DROP FUNCTION IF EXISTS credits_for_works(uuid[]);
DROP FUNCTION IF EXISTS sync_generation_stats(text);
DROP FUNCTION IF EXISTS report_analytics(timestamptz, timestamptz);

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
  created_at timestamptz,
  deleted_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    w.id, w.title, w.video_type, w.status,
    w.start_date, w.end_date, w.end_time,
    w.max_credits, w.creator_id, w.client_id,
    COALESCE(g.credit_sum, 0) AS credit_sum,
    w.created_at,
    w.deleted_at
  FROM works w
  LEFT JOIN (
    SELECT work_id, SUM(credits::numeric) AS credit_sum
    FROM generations
    WHERE work_id IS NOT NULL
    GROUP BY work_id
  ) g ON g.work_id = w.id
  ORDER BY w.deleted_at NULLS FIRST, w.created_at DESC;
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
  generation_count bigint,
  deleted_at timestamptz
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    c.id, c.name, c.industry, c.status,
    COALESCE(g.total_credits, 0) AS total_credits,
    COALESCE(g.generation_count, 0) AS generation_count,
    c.deleted_at
  FROM clients c
  LEFT JOIN (
    SELECT client_id,
           SUM(credits::numeric) AS total_credits,
           COUNT(*)              AS generation_count
    FROM generations
    WHERE client_id IS NOT NULL
    GROUP BY client_id
  ) g ON g.client_id = c.id
  ORDER BY c.deleted_at NULLS FIRST, c.name;
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

-- ============================================================
-- SYNC PAGE — /app/sync
-- Server-side stats so the client never pulls the full generations table.
-- ===========

CREATE OR REPLACE FUNCTION sync_generation_stats(p_hf_label text DEFAULT NULL)
RETURNS TABLE(
  unassigned_count bigint,
  unassigned_credits numeric,
  assigned_count bigint,
  assigned_credits numeric,
  wasted_count bigint,
  wasted_credits numeric,
  irrelevant_count bigint,
  irrelevant_credits numeric
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  SELECT
    COUNT(*) FILTER (
      WHERE client_id IS NULL AND NOT COALESCE(is_irrelevant, false)
    ),
    COALESCE(SUM(credits::numeric) FILTER (
      WHERE client_id IS NULL AND NOT COALESCE(is_irrelevant, false)
    ), 0),
    COUNT(*) FILTER (
      WHERE client_id IS NOT NULL
        AND NOT COALESCE(is_waste, false)
        AND NOT COALESCE(is_irrelevant, false)
    ),
    COALESCE(SUM(credits::numeric) FILTER (
      WHERE client_id IS NOT NULL
        AND NOT COALESCE(is_waste, false)
        AND NOT COALESCE(is_irrelevant, false)
    ), 0),
    COUNT(*) FILTER (
      WHERE COALESCE(is_waste, false) AND NOT COALESCE(is_irrelevant, false)
    ),
    COALESCE(SUM(credits::numeric) FILTER (
      WHERE COALESCE(is_waste, false) AND NOT COALESCE(is_irrelevant, false)
    ), 0),
    COUNT(*) FILTER (WHERE COALESCE(is_irrelevant, false)),
    COALESCE(SUM(credits::numeric) FILTER (
      WHERE COALESCE(is_irrelevant, false)
    ), 0)
  FROM generations
  WHERE p_hf_label IS NULL OR hf_connection_label = p_hf_label;
$$;

-- ===========
-- REPORTS PAGE — /app/reports
-- Aggregate in Postgres instead of shipping every generation row to Node.
-- ===========

CREATE OR REPLACE FUNCTION report_analytics(
  p_from timestamptz,
  p_to timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH period_gens AS (
    SELECT *
    FROM generations
    WHERE hf_created_at >= p_from AND hf_created_at <= p_to
  ),
  pg AS (
    SELECT * FROM period_gens WHERE NOT COALESCE(is_irrelevant, false)
  ),
  pg_useful AS (
    SELECT * FROM pg WHERE NOT COALESCE(is_waste, false)
  ),
  rework_works AS (
    SELECT id FROM works WHERE status = 'rework'
  ),
  total AS (
    SELECT
      COALESCE(SUM(credits::numeric), 0) AS total_credits,
      COUNT(*)::bigint AS generation_count
    FROM pg_useful
  ),
  by_client_chart AS (
    SELECT
      g.client_id AS id,
      c.name,
      ROUND(SUM(g.credits::numeric), 2) AS credits,
      COUNT(*)::bigint AS count
    FROM pg_useful g
    LEFT JOIN clients c ON c.id = g.client_id
    WHERE g.client_id IS NOT NULL
    GROUP BY g.client_id, c.name
  ),
  by_creator_chart AS (
    SELECT
      w.creator_id AS id,
      m.full_name AS name,
      ROUND(SUM(g.credits::numeric), 2) AS credits,
      COUNT(*)::bigint AS count
    FROM pg_useful g
    JOIN works w ON w.id = g.work_id
    LEFT JOIN memberships m ON m.user_id = w.creator_id AND m.status = 'active'
    WHERE g.work_id IS NOT NULL
    GROUP BY w.creator_id, m.full_name
  ),
  by_model_chart AS (
    SELECT
      display_name AS name,
      ROUND(SUM(credits::numeric), 2) AS credits,
      COUNT(*)::bigint AS count
    FROM pg_useful
    GROUP BY display_name
  ),
  by_day AS (
    SELECT
      (hf_created_at AT TIME ZONE 'UTC')::date::text AS date,
      ROUND(SUM(credits::numeric), 2) AS credits,
      COUNT(*)::bigint AS count
    FROM pg_useful
    GROUP BY 1
    ORDER BY 1
  ),
  client_filter AS (
    SELECT
      c.id,
      c.name,
      c.industry,
      (SELECT COUNT(*) FROM works w WHERE w.client_id = c.id)::int AS total_works,
      ROUND(COALESCE(SUM(CASE
        WHEN NOT COALESCE(g.is_waste, false)
          AND (g.work_id IS NULL OR g.work_id NOT IN (SELECT id FROM rework_works))
        THEN g.credits::numeric ELSE 0 END), 0), 2) AS useful_credits,
      ROUND(COALESCE(SUM(CASE
        WHEN COALESCE(g.is_waste, false)
          AND (g.work_id IS NULL OR g.work_id NOT IN (SELECT id FROM rework_works))
        THEN g.credits::numeric ELSE 0 END), 0), 2) AS wastage_credits,
      ROUND(COALESCE(SUM(CASE
        WHEN NOT COALESCE(g.is_waste, false)
          AND g.work_id IN (SELECT id FROM rework_works)
        THEN g.credits::numeric ELSE 0 END), 0), 2) AS rework_useful_credits,
      ROUND(COALESCE(SUM(CASE
        WHEN COALESCE(g.is_waste, false)
          AND g.work_id IN (SELECT id FROM rework_works)
        THEN g.credits::numeric ELSE 0 END), 0), 2) AS rework_wastage_credits
    FROM clients c
    LEFT JOIN pg g ON g.client_id = c.id
    GROUP BY c.id, c.name, c.industry
  ),
  model_filter AS (
    SELECT
      display_name AS name,
      ROUND(COALESCE(SUM(CASE WHEN NOT COALESCE(is_waste, false) THEN credits::numeric ELSE 0 END), 0), 2) AS useful_credits,
      ROUND(COALESCE(SUM(CASE WHEN COALESCE(is_waste, false) THEN credits::numeric ELSE 0 END), 0), 2) AS wastage_credits
    FROM pg
    GROUP BY display_name
  ),
  user_report AS (
    SELECT
      m.user_id AS id,
      m.full_name AS name,
      ROUND(COALESCE((
        SELECT SUM(credits::numeric) FROM pg_useful WHERE assigned_by = m.user_id
      ), 0), 2) AS credits_assigned,
      (SELECT COUNT(*) FROM period_gens WHERE wasted_by = m.user_id AND COALESCE(is_waste, false))::int AS wastage_count,
      ROUND(COALESCE((
        SELECT SUM(credits::numeric) FROM period_gens
        WHERE wasted_by = m.user_id AND COALESCE(is_waste, false)
      ), 0), 2) AS wastage_credits,
      (SELECT COUNT(*) FROM works w
        WHERE w.creator_id = m.user_id AND w.status = 'completed'
          AND w.end_date IS NOT NULL AND w.updated_at IS NOT NULL
          AND (w.updated_at AT TIME ZONE 'UTC')::date <= w.end_date)::int AS completed_on_time,
      (SELECT COUNT(*) FROM works w
        WHERE w.creator_id = m.user_id AND w.end_date IS NOT NULL
          AND w.status <> 'completed'
          AND w.end_date < (CURRENT_DATE))::int AS deadline_missed,
      (SELECT COUNT(*) FROM works w
        WHERE w.creator_id = m.user_id AND w.status = 'completed')::int AS completed_total,
      (SELECT COUNT(*) FROM works w
        WHERE w.creator_id = m.user_id AND w.status <> 'completed')::int AS active_works
    FROM memberships m
    WHERE m.status = 'active' AND m.role = 'creator'
  ),
  unique_models AS (
    SELECT COALESCE(jsonb_agg(DISTINCT display_name ORDER BY display_name), '[]'::jsonb)
    FROM pg_useful
  ),
  drilldown AS (
    SELECT COALESCE(jsonb_agg(
      jsonb_build_object(
        'id', g.id,
        'display_name', g.display_name,
        'result_url', COALESCE(g.result_url, ''),
        'media_type', COALESCE(g.media_type, ''),
        'credits', g.credits::numeric,
        'hf_created_at', g.hf_created_at,
        'client_id', g.client_id,
        'work_id', g.work_id,
        'assigned_by', g.assigned_by,
        'is_waste', COALESCE(g.is_waste, false),
        'is_irrelevant', COALESCE(g.is_irrelevant, false),
        'wasted_by', g.wasted_by
      ) ORDER BY g.hf_created_at DESC
    ), '[]'::jsonb) AS rows
    FROM pg_useful g
  )
  SELECT jsonb_build_object(
    'totalCredits', (SELECT total_credits FROM total),
    'totalGenerations', (SELECT generation_count FROM total),
    'clientData', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', bc.id, 'name', bc.name, 'credits', bc.credits, 'count', bc.count
      ) ORDER BY bc.credits DESC)
      FROM by_client_chart bc
    ), '[]'::jsonb),
    'creatorData', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', bc.id, 'name', bc.name, 'credits', bc.credits, 'count', bc.count
      ) ORDER BY bc.credits DESC)
      FROM by_creator_chart bc
    ), '[]'::jsonb),
    'modelData', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', bm.name, 'credits', bm.credits, 'count', bm.count
      ) ORDER BY bm.credits DESC)
      FROM by_model_chart bm
    ), '[]'::jsonb),
    'trendData', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'date', bd.date, 'credits', bd.credits, 'count', bd.count
      ) ORDER BY bd.date)
      FROM by_day bd
    ), '[]'::jsonb),
    'filterClientData', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', cf.id, 'name', cf.name, 'industry', cf.industry,
        'totalWorks', cf.total_works,
        'usefulCredits', cf.useful_credits, 'wastageCredits', cf.wastage_credits,
        'reworkUsefulCredits', cf.rework_useful_credits,
        'reworkWastageCredits', cf.rework_wastage_credits,
        'models', '[]'::jsonb
      ) ORDER BY (cf.useful_credits + cf.wastage_credits) DESC)
      FROM client_filter cf
      WHERE cf.total_works > 0 OR cf.useful_credits > 0 OR cf.wastage_credits > 0
    ), '[]'::jsonb),
    'filterModelData', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'name', mf.name, 'usefulCredits', mf.useful_credits, 'wastageCredits', mf.wastage_credits
      ) ORDER BY mf.useful_credits DESC)
      FROM model_filter mf
    ), '[]'::jsonb),
    'userReportData', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', ur.id, 'name', ur.name,
        'credits_assigned', ur.credits_assigned,
        'wastage_count', ur.wastage_count,
        'wastage_credits', ur.wastage_credits,
        'completed_on_time', ur.completed_on_time,
        'deadline_missed', ur.deadline_missed,
        'completed_total', ur.completed_total,
        'active_works', ur.active_works
      ) ORDER BY ur.name)
      FROM user_report ur
    ), '[]'::jsonb),
    'generations', (SELECT rows FROM drilldown),
    'uniqueModels', (SELECT * FROM unique_models)
  ) INTO result;

  RETURN result;
END;
$$;
