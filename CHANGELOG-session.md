# Eigen — Session Changelog (June 2026)

Everything built, fixed, and shipped during this development session.

---

## 1. Multi-Creator Works

Works can now be assigned to multiple creators instead of just one.

- **`work_creators` join table** — composite PK `(work_id, user_id)`, RLS policies, backfill migration from `works.creator_id`
- **Create Work dialog** — multi-select creator roster with checkboxes; first selected = primary (shown with "primary" pill)
- **Edit Work dialog** — hydrates creator list from `work_creators` on open; same multi-select UI
- **API (`PATCH /api/works/[id]`)** — accepts `creator_ids[]`, uses INSERT-then-DELETE-orphans sync pattern (never zero rows)
- **Status API** — `isOwn` check includes co-owners from `work_creators`
- **Assign Generation API** — creator role check includes co-owners; cross-client assignment requires master/manager
- **Works list page** — shows up to 2 creator names then "+N more" per card
- **Work detail page** — header shows "Creators: A, B, C +N more"
- **Dashboard** — `myWorkIds` includes co-owned works for needsAttention logic

**SQL migration:** `supabase/work-creators.sql`

---

## 2. Work Detail Page Overhaul

- **50/50 layout** — left column: Schedule; right column: Sync & Assign
- **Two-modal assign flow** — Modal A (multi-select generation picker) → Modal B (client dropdown + Actual/Wastage buttons)
- **Per-creator stats panel** — actual / wastage / rework breakdown per user
- **Rework tag** — only shown for cross-work entries (`genWorkId !== workId`); same-work entries skip the tag since the header badge already indicates rework status
- **Cross-client assignment** — API allows assigning to any client; wastage attributes to picked client; post-batch navigates to `/app/clients/{destClientId}`
- **Partial failure handling** — on partial batch failure, modal stays open with error instead of navigating away

---

## 3. Sync & Assign — Instant Modal with Shimmer

- Click "Sync & Assign" → **modal opens immediately**
- 6 shimmer placeholder rows animate while HF sync runs in background
- On success: real rows replace shimmer
- On failure: inline error card with "Retry sync" button
- Empty result: "Synced — but nothing new is waiting"
- Close/Cancel always available (never trapped during sync)

---

## 4. Instructions — File + Text Input

- **Create/Edit Work** — both file upload AND text input (not OR); text → `notes` column, file → `instructions_path`
- **Instructions icon button** — compact lime icon in work detail header (StickyNote / FileText / FileCode2 depending on content)
- **Lime corner dot** when BOTH file + notes present
- **Modal viewer** — shows file content + notes section; handles failed file download gracefully

---

## 5. Client Detail Page Enhancements

- **Time filter** — week / month / year / all selector via URL param `?range=`
- **Status-gated Create Work** — only for clients with status `trial`, `ongoing`, or `in_talk`
- **Per-work per-user credit report** (`WorkUserReport` component) — User / Actual / Wastage / Rework columns with totals row
- **Assigned + Wastage tables** — 2-column layout with undo buttons (Unassign / Mark Useful)
- **"via {work}" link** per generation row

---

## 6. Assign Tables — Undo Windows

- **60-second undo window** for Unassign and Mark Useful buttons
- Enforced both client-side (`UNDO_WINDOW_MS = 60000`) and server-side in API routes
- **Creator self-unassign** — within 60s of assignment
- **Creator un-waste** — within 60s if they're the waster
- **Master/manager** — anytime, no window restriction

---

## 7. State Management Sweep (useTransition)

Eliminated button flicker across all 19+ interactive components:

- Every `router.refresh()` / `router.push()` wrapped in `startTransition()`
- Every button: `disabled={busy || isPending}`
- Button text: `busy ? 'Saving…' : isPending ? 'Updating…' : 'Save'`
- Optimistic state with snapshot + revert on error

**Components updated:** create-work-dialog, edit-work-dialog, sync-and-assign, assign-tables, client-form-dialog, approval-controls, member-controls, member-hf-access, invite-user-section, org-section, danger-section, member-settings, client-time-filter, and more.

---

## 8. Navigation Progress Bar

- **Lime progress bar** at top of page, activates on internal anchor clicks
- Trickles progress, completes when pathname changes
- `components/navigation-progress.tsx`

---

## 9. Route-Level Loading Shimmer

9 `loading.tsx` files matching each route's layout:

- `/app/dashboard`
- `/app/clients`
- `/app/clients/[id]`
- `/app/works`
- `/app/works/[id]`
- `/app/sync`
- `/app/reports`
- `/app/users`
- `/app/settings`

---

## 10. HF Account Picker — Dialog Modal

- **Before:** inline absolute popover (clipped by `overflow-hidden`)
- **After:** full Dialog modal with "HF access K/N" button + Settings2 icon
- Toggle list, Grant all / Revoke all, optimistic state with revert
- `memberFullName` prop for modal description

---

## 11. User Invitation System

- **Master can invite** any user by email
- **Auto-approval** with HF account grant assignment during approval
- **`approve_membership_with_grants`** RPC — approves membership + grants selected HF accounts in one call
- **Approval dialog** — role picker (creator/manager) + HF account multi-select before confirming

---

## 12. Onboarding Rework

### Join Org (`/onboarding/join-org`)
- **Search-based** — no org directory shown by default
- Debounced `ilike` search (≥2 chars, 250ms)
- **Invitation banner** — shows pending invitations with one-click Accept

### Create Org (`/onboarding/create-org`)
- **Real-time name availability** check (debounced 350ms)
- 5-state machine: idle → checking → available → taken → invalid
- "Join the existing one" link for taken names
- 23505 race window caught with friendly error

**SQL migration:** `supabase/invitee-can-read-own-invitations.sql`

---

## 13. Sync Page Fix

- Client dropdown was showing UUID instead of name after selection
- Fixed to display client name properly

---

## 14. Settings Page (Phase 6)

- Video types management
- Org settings (name, etc.)
- Danger zone (delete org)
- Leave org
- Add HF account panel — no auto-redirect; shows verification URL in read-only Input with Copy button

---

## 15. Miscellaneous Removals

- **Industry dropdown removed** from Create/Edit Work dialogs (kept in Client dialogs)
- **"HF Credit Tracker" branding removed** — product is **Eigen**
- **Standalone "Higgsfield Account Access" section removed** from Users page — inlined into each Active Members row

---

## Bugs Fixed

| Bug | Fix |
|-----|-----|
| `creatorNameMap` name collision on work detail page | Renamed assigner lookup to `assignerNameMap` |
| TypeScript narrowing error on `instructionsFilename` | Compute filename from path before download, not inside success branch |
| Rework tag on every row | Added `if (genWorkId === workId) return null` check |
| Unassign API 10s vs client 20s mismatch | Bumped all to 60s everywhere |
| Waste API blocked creator un-waste | Allow creator un-waste within window if they're the waster |
| Modal A Cancel clickable during batch | Added `disabled={batchBusy}` |
| Optimistic state not reverted in member-hf-access | Added snapshot + revert pattern |
| Dropdown clipped by `overflow-hidden` | Refactored to Dialog modal |
| Silent failure in create-work-dialog for work_creators | Surface error message, suppress redirect |
| DELETE-then-INSERT race in PATCH API | Changed to INSERT-first-then-DELETE-orphans |
| Partial-success navigation bug in Sync & Assign | Only navigate on full success; stay on modal with error on partial failure |

---

## SQL Migrations to Run

1. `supabase/work-creators.sql` — multi-creator join table + backfill
2. `supabase/invitee-can-read-own-invitations.sql` — RLS for invitation banner

---

## Tech Stack Notes

- **Next.js 16** with Turbopack — `params: Promise<{id: string}>`, `proxy.ts` replaces `middleware.ts`
- **Supabase RLS** — `user_active_org_ids()`, `user_role_in_org()` SECURITY DEFINER helpers
- **No `SUPABASE_SERVICE_ROLE_KEY`** — all elevated ops via SECURITY DEFINER RPCs
- **RBAC** — `can(role, resource, permission)` with 3 roles: master / manager / creator
- **Theme** — black background, lime accents
- **All work on `main` branch** — no feature branches
