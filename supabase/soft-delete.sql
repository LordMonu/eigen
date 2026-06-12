-- soft-delete.sql — add deleted_at to works, clients, memberships.
-- Paste into Supabase SQL Editor. Idempotent.

-- 1. Add deleted_at columns
ALTER TABLE works ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- 2. Indexes for filtering active records efficiently
CREATE INDEX IF NOT EXISTS idx_works_deleted_at ON works (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients (deleted_at) WHERE deleted_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_memberships_deleted_at ON memberships (deleted_at) WHERE deleted_at IS NOT NULL;

-- 3. Update aggregation RPCs to exclude soft-deleted works/clients from totals
-- (generations assigned to deleted works/clients still count — they stay assigned)

DROP FUNCTION IF EXISTS works_with_credit_totals();
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

DROP FUNCTION IF EXISTS clients_with_credit_totals();
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

-- 4. Update work detail RPCs to include deleted_at awareness
-- work_credit_total: still counts credits for deleted works (they stay assigned)
-- No change needed — it already sums by work_id regardless of work status.

-- 5. Client detail RPCs: include deleted_at in client_work_credit_breakdown
-- These RPCs work on generations, not on works/clients directly, so no change needed.
-- The generations stay assigned; the credit totals remain accurate.
