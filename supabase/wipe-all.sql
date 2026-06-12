-- DANGER: wipes ALL data on this Supabase project.
-- Schema, tables, policies, and storage buckets are preserved.
-- Run in Supabase Dashboard → SQL Editor (runs as superuser, bypasses RLS).

begin;

-- App tables — restart identity cascade clears child FKs in one shot.
truncate table
  generations,
  work_creators,
  works,
  clients,
  hf_connection_grants,
  hf_connections,
  invitations,
  memberships,
  organizations,
  industries,
  video_types
restart identity cascade;

-- Storage objects: Supabase blocks direct DELETE on storage.objects to
-- prevent orphans. Empty buckets manually in Dashboard → Storage →
-- (pick bucket) → select all → Delete. Buckets to empty: work-instructions.

-- Auth users — cascades to identities, sessions, refresh_tokens, mfa_*.
delete from auth.users;

commit;
