# Higgsfield Credit-Tracking Platform — Complete Build Plan
## Phase 0 → Phase 7 Roadmap

> **North star:** Client-wise Higgsfield credit usage report.
> **Goal:** Track how many HF credits each client cost you.

---

## QUICK START

**Right now (Phase 0):**
1. Copy the entire **`PHASE0_COMPLETE_PROMPT.md`** file
2. Paste it into a Claude Code session
3. Tell Claude Code: *"Build Phase 0 exactly as described. Stop before Phase 1."*
4. Test with your real Higgsfield MPC/CLI link
5. When client-wise credit totals work → Phase 0 is complete ✓

**Then (Phases 1–7):**
- Reference this document for phase-by-phase roadmap
- Each phase builds on the previous one

---

## STACK & TOOLS (all phases)

```
Frontend/Backend  : Next.js (App Router, TypeScript)
Auth + DB + Files : Supabase (Google OAuth, Postgres + RLS, Storage)
UI Components     : Tailwind CSS + shadcn/ui
Charts            : shadcn/charts (Recharts wrapped in Tailwind) — beautiful, pre-styled
Deploy            : Vercel (app) + Supabase (database)
HF Integration    : isolated adapter module (hf-adapter.ts)
```

**Why this stack?** Fast iteration with Claude Code. Supabase handles Google login, multi-tenant data isolation (RLS), and file storage — everything that normally takes weeks.

---

## PHASE OVERVIEW (7 phases total)

| Phase | Name | Duration | Goal |
|-------|------|----------|------|
| **0** | Integration spike | 1 day | Paste HF link → list generations → assign to client → see client-wise totals |
| **1** | Foundation auth + org | 2–3 days | Google OAuth, org create/join/approval, fixed roles |
| **2** | Clients | 2 days | CRUD, statuses (ongoing→trial→in_talk→outreach→paused→ended), ordering |
| **3** | Works | 3 days | Multi-step form, lifecycle (ongoing/paused/in_review/rework/completed) |
| **4** | Wire credit sync | 2 days | On-demand pull, two tables, Assign action, per-work credit tracking |
| **5** | Dashboard | 2 days | Near-deadline works, unassigned tokens, totals, client-status dropdown |
| **6** | Reports | 2 days | **Client-wise credit usage** (charts + tables), creator usage |
| **7** | Users + Settings | 1 day | Manage users, roles, HF connection, video types |

**Total:** ~15–17 working days (realistically 1.5–2 weeks of focused Claude Code sessions)

---

## DATA MODEL (all phases)

### Tables

```
organizations
├── id (pk)
├── name
├── created_at

memberships  (join requests + roles)
├── id (pk)
├── org_id (fk)
├── user_id (fk → auth.users)
├── role : master | manager | creator
├── status : pending | active
├── created_at

hf_connections  (one per org, this sprint)
├── id (pk)
├── org_id (fk)
├── hf_link (the MPC/CLI endpoint)
├── label (optional name)
├── created_at

clients
├── id (pk)
├── org_id (fk)
├── name
├── industry
├── status : ongoing | trial | in_talk | outreach | paused | ended
├── created_at

works
├── id (pk)
├── org_id (fk)
├── client_id (fk)
├── creator_id (fk → memberships)
├── video_type
├── max_credits (optional)
├── instructions_md_path (optional)
├── start_date, end_date, start_time, end_time (optional)
├── status : ongoing | paused | in_review | rework | completed
├── created_at

video_types  (for "+ add type" dropdown)
├── id (pk)
├── org_id (fk)
├── name

generations  (THE LEDGER — the whole product)
├── id (pk)
├── org_id (fk)
├── hf_connection_id (fk)
├── external_id (unique per connection)
├── thumbnail_url
├── name (prompt/generation name)
├── model (e.g., Nano Banana Pro, Kling 3.0)
├── credits : NUMERIC(12,4)  ← NOT float
├── generated_at (timestamp from HF)
├── client_id (fk, NULLABLE = unassigned)
├── work_id (fk, NULLABLE)
├── assigned_by
├── assigned_at
├── raw_json (keep raw HF payload for debugging)
├── created_at
```

**Critical:** `credits` is `NUMERIC(12,4)`, never binary float. HF credits are fractional (1.5, 4.25, etc.). Postgres NUMERIC stores exactly.

---

## PHASE DETAILS

### PHASE 0 — Integration Spike (1 day)
**Goal:** Prove the core loop works. Paste HF link → see generations → assign → see client totals.

**What you build:**
- `lib/hf-adapter.ts` — fetches from HF, returns `{externalId, thumbnail, name, model, credits, timestamp}`
- `/app/sync` page — paste HF link, Sync button, Table A (unassigned), Assign dropdown, Table B (client totals)
- `lib/supabase.ts` — reusable Supabase client
- Schema: `clients` + `generations` tables

**Acceptance:**
- Paste YOUR REAL HF link
- Sync pulls real generations (with thumbnails)
- Assign 2–3 to different clients
- Client totals are correct

**Instructions:**
→ Use **`PHASE0_COMPLETE_PROMPT.md`** — copy-paste the entire file into Claude Code.

---

### PHASE 1 — Foundation: Auth + Org + Roles (2–3 days)
**Goal:** Add Google OAuth, org create/join/approval, fixed roles, multi-tenant isolation.

**What you build:**
- `/` page → Get Started → Google login
- `/onboarding` → Create org (become master) | Join org (request → pending)
- Master can approve join requests or @-mention invite
- Fixed roles: master (all), manager (clients/works/assign), creator (own works only)
- Supabase RLS: every table has `org_id`; users only see their org's rows

**Acceptance:**
- User A creates an org (becomes master)
- User B requests to join, waits in pending screen
- User A approves
- User B lands on dashboard with role-scoped access

---

### PHASE 2 — Clients (2 days)
**Goal:** Build client CRUD with statuses and ordering.

**What you build:**
- `/app/clients` card grid sorted: ongoing → trial → in_talk → outreach → paused → ended
- `/app/clients/[id]` detail page: manager can update status
- Status dropdown filter: select category → show count of clients in that category

**Acceptance:**
- Create clients in each status
- See them sorted in fixed order on cards page
- Change status on detail page
- Dropdown counts update

---

### PHASE 3 — Works (3 days)
**Goal:** Multi-step work creation form, lifecycle, role-scoped views.

**What you build:**
- Multi-step "Create work" form launched from client page:
  - Step 1: optional dates/times
  - Step 2: creator (required), video type + "add type" dropdown, max credits (optional)
  - Step 3: optional .md upload to Supabase storage
- `/app/works` list with filter tabs: all | rework | ongoing | paused | completed
- Creators see only their works; managers/master see all
- Work status lifecycle: ongoing → (send for review) → in_review → {rework | completed} | paused

**Acceptance:**
- Manager creates work for a creator
- Creator sees it on their works list
- Creator hits "Send for review" → status = in_review
- Manager marks rework or completed

---

### PHASE 4 — Wire Credit Sync (2 days)
**Goal:** Integrate Phase 0 sync + assign into the real, org-scoped app.

**What you build:**
- `/app/works/[id]` shows two tables:
  - Table A: unassigned generations for this org (pull on page load + manual Sync button — NO scheduler)
  - Table B: generations assigned to THIS work's client
- Assign button: pick a client/work → sets client_id + work_id + assigned_at
- All org-scoped via RLS
- On-demand pull (no cron/scheduler)

**Acceptance:**
- Open a work, hit Sync
- See real HF generations (thumbnails, names, credits)
- Assign to the client
- Table B updates
- Client credit total changes immediately

---

### PHASE 5 — Dashboard (2 days)
**Goal:** Aggregated metrics.

**What you build:**
- Near-deadline works (next 7 days)
- **Unassigned tokens** = SUM(credits) WHERE client_id IS NULL (live as you assign)
- **Total tokens** = SUM(all credits)
- Total works per client
- Client-status dropdown: select category → show count

**Acceptance:**
- Numbers match database
- Unassigned tokens decrease when you assign in Works
- Dropdown counts are correct

---

### PHASE 6 — Reports: Client-wise Credit Usage (2 days)
**Goal:** Answer "which client cost us the most HF credits?" in one screen.

**What you build:**
- **Client-wise credit usage** (bar chart + table): client → total credits → % of total
  - Use shadcn/charts (Recharts + Tailwind) for beautiful rendering
- Creator-wise usage (bar/line chart)
- Generations list with filters: model, date range
- Optional: breakdown by model, by video type

**Acceptance:**
- Charts render correctly
- Numbers match the underlying data
- Date filters work
- Manager can answer "which client cost us the most" instantly

---

### PHASE 7 — Users + Settings (1 day)
**Goal:** User management and platform configuration.

**What you build:**
- `/app/users` list memberships with role + status, master can remove/promote (within fixed roles)
- `/app/settings` manage HF connection (paste/replace link), video types
- Label sections "Custom permissions (coming v2)" where you'll expand later

**Acceptance:**
- Master can see all users, change roles
- HF connection link can be updated
- Video types can be added/edited

---

## CRITICAL IMPLEMENTATION RULES

1. **Credits are NUMERIC(12,4), never binary float.** Non-negotiable for a financial ledger.
2. **No scheduler.** Pull HF data on-demand (page load + Sync button). No cron.
3. **hf-adapter.ts is the ONLY file that knows HF's shape.** Everything else speaks your `Generation` type.
4. **client_id = NULL means unassigned.** Table A queries `WHERE client_id IS NULL`.
5. **Dedupe on external_id.** If you sync twice, don't create duplicate rows. Use UNIQUE constraint.
6. **Multi-tenant via RLS.** Every table carries `org_id`; RLS policies restrict rows to the user's org.
7. **Fixed roles only (this sprint):** master, manager, creator. Custom rules are v2.
8. **Client sort order:** `['ongoing', 'trial', 'in_talk', 'outreach', 'paused', 'ended']`. Hardcode as a constant.
9. **Work statuses:** ongoing, paused, in_review (send for review → this), rework, completed. Not a simple string — use an enum.

---

## v2 BACKLOG (explicitly out of scope)

- Fully customizable per-user view/edit permissions
- Multiple HF accounts per org
- One HF account shared across multiple orgs
- Adobe + other platform credits
- Email/WhatsApp notifications
- Background refresh, audit logs, exports
- Advanced filtering, saved reports

---

## SUMMARY: BUILD ORDER

1. **Phase 0** → paste `PHASE0_COMPLETE_PROMPT.md` into Claude Code
2. **Phase 1** → paste its prompt into Claude Code (in next section)
3. **Phases 2–7** → each has a similar prompt structure; reference this document for details

**Total time:** ~15–17 working days for someone driving Claude Code (1.5–2 weeks of focused sessions).

---

## SUPABASE SETUP (one-time)

1. Go to **supabase.com** → sign up free
2. Create a new project (region: Bangalore/India)
3. Copy Project URL + anon key → `.env.local`
4. Set up Google OAuth: Auth → Providers → Google → add credentials
5. Run all SQL schemas (each phase adds tables as needed)
6. Enable RLS (Supabase → Security → Policies)

**After Phase 0:** Supabase is your dev + staging database. After Phase 7: connect Vercel, deploy.

---

## CHARTS: USING shadcn/charts

Phase 6 (Reports) uses **shadcn/charts**, which is Recharts pre-styled with Tailwind. Install:
```bash
npx shadcn-ui@latest add chart
```

Then use components like `BarChart`, `LineChart`, `PieChart` from `@/components/ui/chart`. They're beautiful out of the box and match your Tailwind theme.

---

## FOLDER STRUCTURE (final, Phase 7)

```
hf-credit-platform/
├── app/
│   ├── page.tsx (Get Started landing)
│   ├── auth/
│   │   └── callback.tsx (Google OAuth redirect)
│   ├── onboarding/
│   │   ├── create-org/page.tsx
│   │   ├── join-org/page.tsx
│   │   └── pending/page.tsx
│   └── app/
│       ├── layout.tsx (sidebar, role guard)
│       ├── dashboard/page.tsx
│       ├── clients/
│       │   ├── page.tsx
│       │   └── [id]/page.tsx
│       ├── works/
│       │   ├── page.tsx
│       │   └── [id]/page.tsx
│       ├── reports/page.tsx
│       ├── users/page.tsx
│       └── settings/page.tsx
├── lib/
│   ├── supabase.ts
│   ├── hf-adapter.ts (ISOLATED — only this knows HF's shape)
│   └── auth-helpers.ts (role guards, org check)
├── components/
│   ├── ui/ (shadcn components)
│   └── (custom components as needed)
└── .env.local (Supabase credentials — .gitignored)
```

---

*Last updated: June 4, 2026. See `PHASE0_COMPLETE_PROMPT.md` to start building today.*
