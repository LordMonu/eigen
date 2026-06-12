# Eigen — Build Notes for the Planning Session

> Context dump of everything that happened **outside the Phase 0–5 prompts** as
> the platform was actually built. Share this with the planning Claude so it
> can plan Phase 6+ with full ground truth (deviations made, bugs hit, real
> environment constraints, features already added).

---

## 1. Branding & visual identity (cross-cutting)

**The product is called "Eigen", not "HF Credit Tracker".**
- Double meaning kept on purpose:
  - *Physics* — an **eigenstate** is the value a quantum system collapses to once measured. An unassigned generation lives in superposition until you assign it, collapsing it to one definite client/cost. (Same quantum-physics universe as *Higgs field*.)
  - *German* — **eigen** means *"one's own / belonging to."* The product's job is determining whom each credit belongs to.
- Tagline: *"Every Higgsfield generation, resolved to the client it belongs to."*

**Theme:** black/lime, not the gray-950/blue of the phase prompts.
- Background: `bg-black` / `bg-neutral-950` / `bg-neutral-900`
- Primary accent: **lime-400** (`#a3e635`-ish) for CTAs, range-calendar selections, brand mark
- Status accents kept distinct (blue/purple/orange/green/yellow) for KPIs and badges
- Dark-mode is force-enabled at `<html className="dark">` with `style={{ colorScheme: 'dark' }}`

**Sidebar:** kept the **shadcn `Sidebar` component** (collapsible, accessible, with tooltips when collapsed) every phase, instead of the prompts' plain `<aside class="w-60">…`. Each phase added one nav item to this same sidebar.

**Chart colors:** the prompts assumed `--chart-1..5` were HSL; this project's `globals.css` actually stores them as **oklch**. The prompts' `hsl(var(--chart-1))` would have been invalid CSS. Changed to:
- Vibrant oklch hues (lime / blue / amber / purple / pink)
- Components reference `var(--chart-N)` directly, not `hsl(var(--chart-N))`
- Likewise `var(--border)` and `var(--muted-foreground)` instead of `hsl(...)`

---

## 2. Environment surprises (Next 16 + base-ui + React 19)

This stack is **not the Next 12/13/radix world the prompts assumed**. Several patterns from the prompts had to be adjusted to compile. Future phases should expect the same constraints.

### 2a. base-ui (not radix) under shadcn
The shadcn registry style is `base-nova`, which uses **`@base-ui/react`**, not radix. Differences that bit us:
- `<Select.Value />` renders the **raw value** by default. Radix used to render the item's text. Every dropdown where value ≠ visible label was showing IDs/status codes. Fix: function-child form — `<SelectValue>{(v) => labelFor(v)}</SelectValue>`. Applied to: clients filter, client edit dialog, dashboard pipeline card, create-work creator picker, reports drilldown (client + creator), approval-controls role.
- base-ui's `Select.Root` is generic — `onValueChange` typed as `unknown`, not `string`. Always cast: `onValueChange={(v) => f(v as string)}`.
- `AlertDialogTrigger` uses **`render={<Button … />}`** (not radix's `asChild`).
- `Dialog` requires `open` / `onOpenChange`; same API as radix but the wrapper around it (`p-0`, `grid-rows-[auto_1fr_auto]` for header/scroll/footer) is what we settled on for large dialogs.
- `TooltipProvider` uses `delay` (not radix's `delayDuration`).

### 2b. React 19 lint rules block patterns the prompts used
- **`react-hooks/set-state-in-effect`**: synchronous `setState` inside `useEffect` is now an error. Two cures we standardized:
  - Mount-time data fetch: define the async fn inside the effect, use a `cancelled` ref so the post-await `setState` is guarded.
  - "Reset form on dialog open": **don't** use an effect that sets state on `open` change. Instead, mount the form only when `open === true` and let `useState` defaults initialize the fields (key-remount pattern). We used this on the client form dialog, create-work dialog, and add-account panel.
- **`react-hooks/immutability`**: a hoisted `function loadX()` declared *after* the `useEffect` that calls it is flagged. Either declare it before, or inline it in the effect.

### 2c. react-day-picker v10 (Calendar)
- shadcn's `calendar.tsx` template referenced a `table:` className that **no longer exists** in v10's `ClassNames` type — had to delete that line for tsc to pass.
- `<Calendar mode="range" selected={range} />` with **no `onSelect`** is the read-only pattern (we use it on the work detail Schedule card).
- Cell size is controlled by `[--cell-size:--spacing(N)]` on the Calendar's `className`. Set to `12` for the create-work picker, `11` for the work-detail read-only.
- `DateRange` from `react-day-picker` is `{ from?: Date; to?: Date }`. **Don't** convert with `.toISOString().slice(0,10)` — that's UTC, drifts at IST midnight. We have a `toIsoDate(d: Date)` helper that builds `YYYY-MM-DD` from local `getFullYear/getMonth/getDate`.

### 2d. Next 16 / Turbopack
- **`middleware.ts` → `proxy.ts`** (Next 16 deprecation). Already done in commit `faed8ee`. Future phases keep the new name.
- **`turbopack.root`** must be set in `next.config.ts` because this project lives in a `.claude/worktrees/...` path under the parent repo — Next otherwise infers the parent as the workspace root and emits a multi-lockfile warning. Pinned to `import.meta.dirname`.
- **`loading.tsx` in `app/app/`** is essential for the dynamic `/app/*` routes — without it, every sidebar click blocked ~1–2s while waiting for server. With it, the skeleton appears instantly and the real page streams in.
- **Don't run two `npm run dev` sessions on the same project** — they share `.next/dev/cache/turbopack/` and corrupt each other ("Failed to lookup task ids" panic, missing `.sst` files). Recovery: `pkill -f next-server; rm -rf .next`.
- **Dynamically-built Tailwind classnames get purged.** `` bg-${isCreator ? 'orange' : 'purple'}-950/30 `` becomes invisible. Use static conditionals: `isCreator ? 'bg-orange-950/30 …' : 'bg-purple-950/30 …'`. (Fixed silently in the dashboard.)

### 2e. Strict lint
- ESLint config bans `@typescript-eslint/no-explicit-any`. All `as any` and `(item: any) => …` from prompts had to be typed. Notable rewrite: the HF adapter's raw payload types are now explicit `HFJob` / `HFTransaction` / `HFTransactionPayload` interfaces.
- `<img>` requires an eslint-disable line above each intentional usage (we use `<img>` for HF thumbnails because next/image can't proxy unknown remote hosts without config).

---

## 3. Supabase realities that aren't in the prompts

### 3a. Cold-connection fetch timeouts
- Supabase is behind Cloudflare. From Node's `fetch` (undici), the **first cold TCP/TLS connection** sometimes exceeds undici's connect timeout and throws `TypeError: fetch failed` (`UND_ERR_CONNECT_TIMEOUT`).
- Manifested early as "no Higgsfield account / RLS violations" that looked like permission bugs but were network bugs.
- Solution baked in to both Supabase clients (browser + server): `global: { fetch: fetchWithRetry }` wrapping a small 4-attempt exponential-backoff retry around `fetch`. **Only network throws** are retried — HTTP errors are returned as-is so real schema/RLS errors aren't masked.

### 3b. Storage buckets do NOT get created by the SQL migration
The Phase 3 prompt's `INSERT INTO storage.buckets …` **silently fails** in the SQL Editor (storage RLS doesn't grant the postgres role insert). The `work-instructions` bucket has to be created via Dashboard → Storage → New bucket → Private. This was a major time-sink during Phase 3 testing — calling it out for future storage-related work.

### 3c. RLS in Phase 0
Phase 0 ran with no auth and the anon key, so RLS had to be **explicitly OFF** for `clients` and `generations`. Phase 1 turns it back on with policies. Mentioned here because the Phase 0 prompt didn't include the RLS-off step and we tripped on it.

### 3d. `service_role` key NOT used
We never added `SUPABASE_SERVICE_ROLE_KEY` to `.env.local`. All server-side writes use the anon key + RLS policies (with a SECURITY DEFINER rpc where needed for cross-policy writes, e.g. `hf_rotate_tokens`). Future phases should preserve this — adding service-role is a one-way trapdoor.

### 3e. Migration files in `supabase/`
We keep each phase's SQL as a file in `supabase/` (`schema.sql`, `phase1.sql`, `phase2.sql`, `phase3.sql`, `hf-connections.sql`) **for documentation only**. They're not autorun — the user pastes them into the SQL Editor. Future phases should keep this pattern (one file per migration block, idempotent guards like `DROP POLICY IF EXISTS` / `CREATE TABLE IF NOT EXISTS`).

---

## 4. Performance work (commit `a9b76f7`)

Sidebar nav was a ~2s blocking delay because every `/app/*` route is dynamic, runs through middleware (`getUser`) + layout (`requireActiveMembership`) + page queries, all sequential, all to India→AWS. Three changes brought it to perceived-instant:

1. **`app/app/loading.tsx`** — skeleton fallback Next can prefetch; navigation feels instant while the server renders.
2. **`requireActiveMembership` wrapped in React `cache()`** — layout + page share one Supabase RTT per request instead of two.
3. **`Promise.all` parallelization** of the two-query pages (clients, users). The works pages were already optimal (subsequent queries genuinely depend on first results).

---

## 5. UX add-ons beyond the prompts (asked for during testing)

These all landed; they aren't in the phase specs but are now baseline behavior:

- **Sign-out confirmation modal** in the sidebar footer (AlertDialog). Footer shows user info on the left and an **icon-only** logout button on the right.
- **Create Work modal** is `w-[min(90vw,72rem)] h-[90vh]` with `grid-rows-[auto_1fr_auto]` (sticky header + footer, scrollable middle). Calendar cells are bigger via `[--cell-size:--spacing(12)]`.
- **Range calendar** (`mode="range"`, 2 months side-by-side) replaces the two date inputs in step 1 of Create Work.
  - Calendar **range highlights overridden to lime** because the default `--primary` in this theme is light-gray oklch → invisible on dark bg, and `--muted` was practically invisible too. Now: `bg-lime-400` for start/end pills, `bg-lime-900/40` for range middle.
- **Read-only range calendar** on the work detail page (`/app/works/[id]`) replaces the old Start/End text cards. Component: `app/app/works/[id]/schedule-calendar.tsx`. Uses `mode="range"` + `selected={range}` + **no `onSelect`** for read-only, parses YYYY-MM-DD in local time (no UTC drift).
- **Add Higgsfield account is inline** (not a popup). Expands a panel below the button.

---

## 6. Bug fixes worth flagging for future phases

- **Hydration mismatch** (commit `d35ce71`): `toLocaleDateString()` with no locale produces different strings on server vs browser. Locked all 8 callsites to `toLocaleDateString('en-US')`. Future phases: always pass an explicit locale to date/number formatters that render on both sides.
- **Dropdowns showed IDs** after selection: see 2a above.
- **React Strict Mode + `cancelled` refs**: in dev, Strict Mode does setup→cleanup→setup. If you set `cancelled.current = true` in cleanup, you **must reset it in setup**, otherwise the next effect run is dead-on-arrival. We hit this in the add-account polling and fixed it (commit `a3684dc`).
- **Phase 1 destructive truncate**: the Phase 1 migration's `TRUNCATE generations; TRUNCATE clients;` failed because of an FK; user fixed with `TRUNCATE TABLE generations, clients CASCADE;`. Future migrations that truncate should be single-statement + CASCADE.

---

## 7. Major out-of-spec feature: **multi-account Higgsfield connections**

(commits `2debdcc`, `3b4ac03`, `a3684dc`)

This was in the original v2 backlog ("Multiple HF accounts per org"). Pulled forward and built because the master needed it. **It's also the only way the platform deploys to Vercel** — see below.

### The pivot: CLI execSync → token-based REST
The phase prompts assume Sync calls `execSync('higgsfield generate list --json')`. **That can never work on Vercel** (no `higgsfield` binary in the runtime). After researching the CLI binary and the MCP server's OAuth metadata, I confirmed the Higgsfield REST API at `fnf.higgsfield.ai` is the same OAuth-protected backend the CLI and MCP both use:

- `GET fnf.higgsfield.ai/agents/jobs` (the prompt's "generate list")
- `GET fnf.higgsfield.ai/agents/transactions`
- `GET fnf.higgsfield.ai/agents/balance`
- `POST fnf-device-auth.higgsfield.ai/authorize` (device code)
- `POST fnf-device-auth.higgsfield.ai/token` (poll until approved)
- `POST fnf-device-auth.higgsfield.ai/refresh`

All accept a Bearer access token; same data shapes as the CLI returned. Verified reproduces 17 generations / 198 credits exactly (identical to the old CLI path).

### What got built around it
- `lib/hf-adapter.ts` rewritten to pure REST. Same `Generation` output shape, so nothing downstream changed.
- `lib/hf-auth.ts` — device-code start/poll/refresh helpers.
- `lib/hf-crypto.ts` — **AES-256-GCM** encrypt/decrypt using `HF_TOKEN_ENC_KEY` (32 bytes, hex in `.env.local`). Tokens are encrypted at rest. The browser never receives plaintext (RLS lets members read ciphertext for sync but the cipher is useless without the server-only key).
- `lib/hf-connection.ts` — `withActiveHFToken(supabase, orgId, fn)`: loads active connection, decrypts token, runs `fn(token)`, transparently refreshes + persists rotated tokens on HTTP 401, retries once.
- `supabase/hf-connections.sql` — table with `org_id, label, hf_email, access_token_enc, refresh_token_enc, expires_at, is_active`. Unique partial index ensures **one active per org**. RLS: members read; master writes/deletes. SECURITY DEFINER `hf_rotate_tokens(p_id, p_access_enc, p_refresh_enc, p_expires_at)` lets the sync route persist rotated tokens without master-level access.
- `/app/settings` (master only) lists connections with **Set active** / **Remove** actions, plus an inline **+ Add Higgsfield account** panel.
- `/api/hf/connect/start` (device init) + `/api/hf/connect/poll` (master only).
- `/api/hf/connect/import-cli` — local-dev shortcut that reads `~/.config/higgsfield/credentials.json` and stores it as a connection. Returns 404 cleanly on prod (no CLI). Useful escape hatch.
- Sync now returns **HTTP 409 "No Higgsfield account connected"** when there's no active connection — surface this in any future UI that triggers a sync.

### What's required for prod (Vercel)
- Set `HF_TOKEN_ENC_KEY` to the **same** 64-hex value as `.env.local` in Vercel env vars. Different value → can't decrypt existing tokens.
- No other env or infra changes — the entire flow is HTTPS.

### What this unlocks for future planning
- Per-client / per-work HF account routing: trivial extension since `hf_connections` is already a table with `label`.
- "Connection healthchecks" (last-sync-status, balance display): just call `fetchHFBalance(token)` from `/app/settings`.
- Workspace selection (the `workspace` command in the CLI) — Higgsfield has a per-account billing-workspace concept; could add this to the connection record (`workspace_id`) if needed.

### Update: per-account access for creators + role editing (commit `231db1a` + role-edit follow-up)

The single-active-account model evolved into a **multi-account / per-creator grant** model:
- `is_active` no longer means "the single one to sync from" — it means "this account is enabled for sync". Multiple can be on at once, and master can toggle Enable/Disable in Settings without revoking creator grants.
- New table `hf_connection_grants(connection_id, user_id)` controls which creators can sync from which accounts. Master + manager auto-access **all** enabled connections. Creators access only the granted ones.
- `generations.hf_connection_id` stamps the source account on every row. RLS on `generations` was rewritten to:
  - SELECT: master/manager see everything in their org; creators see only generations whose `hf_connection_id` they have a grant for.
  - UPDATE: same. (INSERT unchanged because the sync route already constrains what it inserts.)
- Sync route fans out across every accessible enabled connection via `forEachAccessibleConnection`, stamps each generation with `hf_connection_id`, and reports per-account errors in the response.
- `lib/hf-connection.ts` rewritten: the old single-active `withActiveHFToken` is gone; the new `forEachAccessibleConnection(supabase, orgId, userId, role, fn)` returns `ConnectionResult<T>[]` (one item per accessible account, with `connectionId`, `label`, `data`, and optional `error`).
- UI:
  - `/app/settings` (master only) — Enable/Disable toggles per account.
  - `/app/users` (master only) — new **"Higgsfield Account Access"** section with collapsible creator rows; each expands to a list of all org connections with checkboxes (`AccountGrantsManager`). Includes "Grant all" / "Revoke all" shortcuts.
- Sidebar order is now: Dashboard, Clients, Works, Sync & Assign, Reports, Users, **Settings** (Settings is master-only).

### Role editing for active members + member removal

Active member rows on `/app/users` now have a `MemberControls` widget (`app/app/users/member-controls.tsx`) so master can:
- **Change role at any time** to master / manager / creator via a dropdown — direct Supabase update, allowed by the existing `Master manages memberships` RLS policy.
- **Remove an active member** via an AlertDialog confirmation — direct DELETE, allowed by `Master deletes memberships` RLS.
- **Last-master guard:** if a row is the only `master` in the org, the dropdown shows "Master" but demotion attempts surface an inline error ("Promote another member to master first"), and the Remove button is disabled. Computed in `users/page.tsx` via `masterCount = (active || []).filter(m => m.role === 'master').length`, then passed as `isLastMaster` to `MemberControls`.
- The row also flags `isYou` (compared to `membership.user_id`) so the confirm dialog warns master if they're about to demote/remove themselves.
- Approve flow (`approval-controls.tsx`) is unchanged — that handles pending requests only. Active-member editing is `MemberControls`. No new RLS or migration needed.

### Onboarding gotcha worth flagging

If a tester signs in with a Google account that **already has an active membership** in the DB (e.g. they previously created an org with that account and forgot), the landing page short-circuits straight to `/app/dashboard` — no onboarding shown, no role choice. To re-test onboarding for a given email, **delete the membership row** for that user (or the whole org via `DELETE FROM organizations WHERE id = '…'`, which cascades to memberships/clients/etc). Future planning: consider a "leave org" affordance for masters to make this self-service.

---

## 8. Things still on the table

- **Google OAuth onboarding for new users**: not a bug — Google blocks accounts not listed in the GCP OAuth consent screen's **Test users** while the app is in Testing mode. Fix is GCP-side: add test users (cap 100), or publish the app (instant for External + no sensitive scopes). Mentioned because the user hit this and thought it was a code bug.
- **Phase 3 storage bucket**: see 3b above — `work-instructions` bucket must be created via Dashboard, not SQL.
- **Range calendar in dark mode**: `--primary` is near-white in this theme's dark mode; any future use of `bg-primary` for highlights/pills will be invisible on dark backgrounds. Prefer lime-400.

---

## 9. Commit map (`main`, not pushed)

```
a3684dc  fix(hf-connect): poll never fired (Strict Mode left cancelled ref = true)
3b4ac03  fix(hf-connections): inline add panel + robust device-token detection + CLI import
2debdcc  feat: multiple Higgsfield accounts (token-based, works localhost + prod)
d35ce71  fix: hydration error + dropdown shows IDs + work schedule calendar
5027837  phase5: reports (north-star client-wise credit usage)
faed8ee  chore: rename middleware.ts → proxy.ts (Next 16 deprecation)
e60f53b  phase4: role-aware dashboard
3ece0d7  fix: range calendar visibility + 90vh modal
babab3d  feat: range calendar in create work modal + 80vh modal
a9b76f7  perf: instant sidebar nav for /app/* routes
596a6f7  phase3: works module (lifecycle, multi-step create, per-work credit attribution)
18e4f07  phase2: clients module (status pipeline + role-aware RLS)
8aa800c  phase1: auth + orgs + roles + multi-tenant RLS
161e738  phase0
```

---

## 10. TL;DR for the planner

When writing Phase 6+ prompts:

1. **Name is Eigen**, theme is black/lime, sidebar is shadcn (collapsible). Don't reintroduce "HF Credit Tracker" or plain `<aside>`.
2. **Use base-ui patterns**, not radix: `render={<Component/>}` for triggers, function-child for `<SelectValue>` when value ≠ label, base-ui Select onValueChange returns `unknown`.
3. **React 19 lint is strict** — no synchronous `setState` in effects; no `any`; reset `cancelled` refs in effect setup.
4. **Dates**: always pass explicit `'en-US'` locale to `toLocaleDateString`; for DATE columns, parse YYYY-MM-DD in local time.
5. **Tailwind classes must be static strings** (no runtime template interpolation), or they get purged.
6. **Sync goes through token REST + `withActiveHFToken`**. The old CLI execSync path no longer exists. If a phase wants new HF data, add it to `lib/hf-adapter.ts` as a REST call.
7. **Storage buckets** need manual Dashboard creation; SQL inserts to `storage.buckets` are silently denied.
8. **Migrations are paste-into-SQL-Editor**, not autorun. Idempotent guards, single-statement CASCADE for truncates.
9. **Don't add a `SUPABASE_SERVICE_ROLE_KEY`** — use SECURITY DEFINER rpcs for cross-policy writes.
10. **`HF_TOKEN_ENC_KEY` must match between localhost and prod env**, or existing tokens become un-decryptable.
