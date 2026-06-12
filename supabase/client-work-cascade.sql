-- supabase/client-work-cascade.sql — Final batch, Section 1.
-- Atomic client-status update with cascading work-status side effects.
-- Paste into Supabase SQL Editor. Idempotent.
--
-- Why one RPC instead of two calls:
--   The dropdown used to do a direct UPDATE on clients. With cascade we now
--   need to update child works too. Doing both client-side or in two RPCs is
--   NOT atomic — a partial failure leaves client.status changed but works
--   out of sync. A single SECURITY DEFINER function does both in one
--   transaction so either everything succeeds or nothing changes.
--
-- Enum note:
--   `work_status` (phase3.sql) does NOT contain 'ended' — only
--   ongoing | paused | in_review | rework | completed. So cascading to a
--   client status of "paused" OR "ended" both map works to 'paused' (the
--   only valid "locked" state). The UI shows the client's actual status as
--   the banner reason, so the user still sees "Locked — client ended".
--
-- Cascade rules (must match lib/work-helpers.ts logic referenced by UI):
--   client → paused  : non-completed works → paused
--   client → ended   : non-completed works → paused (same target, different reason)
--   client → ongoing / trial / in_talk / outreach :
--                       only paused works → ongoing (unlock)
--                       in_review/rework/completed are untouched
--
-- Authorization:
--   SECURITY DEFINER bypasses RLS on clients/works. The WHERE clauses on
--   org_id IN (SELECT user_active_org_ids()) re-enforce org scope — a user
--   who isn't an active member of the client's org affects 0 rows and the
--   function raises 42501 (insufficient_privilege).

CREATE OR REPLACE FUNCTION update_client_status_with_cascade(
  p_client_id UUID,
  p_new_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_client_org UUID;
  v_client_rows INT;
  v_works_affected INT := 0;
BEGIN
  -- 1) Validate the status string up front. The dropdown only sends values
  --    from CLIENT_STATUSES, but a hand-crafted RPC call could send junk.
  IF p_new_status NOT IN ('ongoing', 'trial', 'in_talk', 'outreach', 'paused', 'ended') THEN
    RAISE EXCEPTION 'Invalid client status: %', p_new_status
      USING ERRCODE = '22023';
  END IF;

  -- 2) Update the client. RETURNING into v_client_org both checks the row
  --    exists AND captures the org for the cascade query below — saves a
  --    second SELECT. NB: the clients table has no `updated_at` column
  --    (schema.sql), so we don't touch it — only `status`.
  UPDATE clients
    SET status = p_new_status::client_status
    WHERE id = p_client_id
      AND org_id IN (SELECT user_active_org_ids())
    RETURNING org_id INTO v_client_org;

  GET DIAGNOSTICS v_client_rows = ROW_COUNT;
  IF v_client_rows = 0 THEN
    -- Either the client doesn't exist or the caller isn't a member of its
    -- org. Either way: 42501 — caller can't see/touch this row.
    RAISE EXCEPTION 'Client not found or not a member of its organization'
      USING ERRCODE = '42501';
  END IF;

  -- 3) Cascade. paused + ended both lock works (work_status enum has no
  --    'ended' — paused is the only locked state). The works table has an
  --    auto trigger_set_updated_at trigger (phase3.sql) so we don't set
  --    updated_at explicitly.
  IF p_new_status IN ('paused', 'ended') THEN
    UPDATE works
      SET status = 'paused'
      WHERE client_id = p_client_id
        AND status NOT IN ('completed', 'paused') -- skip already-paused (no-op) + completed (never touch)
        AND org_id = v_client_org;
    GET DIAGNOSTICS v_works_affected = ROW_COUNT;
  ELSIF p_new_status IN ('ongoing', 'trial', 'in_talk', 'outreach') THEN
    -- Unlock: only paused works flip back to ongoing. We don't know which
    -- paused works were paused BY the cascade vs paused manually, but the
    -- product behavior is identical either way (creator can re-pause if
    -- they want).
    UPDATE works
      SET status = 'ongoing'
      WHERE client_id = p_client_id
        AND status = 'paused'
        AND org_id = v_client_org;
    GET DIAGNOSTICS v_works_affected = ROW_COUNT;
  END IF;

  RETURN jsonb_build_object(
    'client_id', p_client_id,
    'status', p_new_status,
    'works_affected', v_works_affected
  );
END;
$$;

-- Authenticated users call the function; the function's own checks enforce
-- org-scope. No one but the API surface needs to invoke it directly.
GRANT EXECUTE ON FUNCTION update_client_status_with_cascade(UUID, TEXT) TO authenticated;
