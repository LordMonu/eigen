/**
 * EIGEN — Role-Based Access Control Config
 *
 * Single source of truth for all page / section / button / action permissions.
 * To change any access: flip yes → no or no → yes. Nothing else needs to change.
 *
 * Roles: master | manager | creator
 *
 * How it's used in code:
 *   import { can } from '@/lib/rbac'
 *   if (can(membership.role, 'clients', 'create')) { ... }
 */

export type Role = 'master' | 'manager' | 'creator'

export type Permission = 'view' | 'create' | 'edit' | 'delete'

export type AccessMap = Record<Role, Record<Permission, boolean>>

// ---------------------------------------------------------------------------
// ACCESS CONFIG
// ---------------------------------------------------------------------------

export const ACCESS = {

  // ── DASHBOARD ─────────────────────────────────────────────────────────────
  dashboard: {
    master:  { view: true,  create: false, edit: false, delete: false },
    manager: { view: true,  create: false, edit: false, delete: false },
    creator: { view: true,  create: false, edit: false, delete: false },
    //        ^^ creator sees personal view (own works/credits), not org-wide
  },

  // ── CLIENTS ───────────────────────────────────────────────────────────────
  clients: {
    master:  { view: true,  create: true,  edit: true,  delete: true  },
    manager: { view: true,  create: true,  edit: true,  delete: false },
    creator: { view: true,  create: false, edit: false, delete: false },
  },

  // client status update (the inline dropdown on client detail)
  clients_status: {
    master:  { view: true,  create: false, edit: true,  delete: false },
    manager: { view: true,  create: false, edit: true,  delete: false },
    creator: { view: true,  create: false, edit: false, delete: false },
  },

  // ── WORKS ─────────────────────────────────────────────────────────────────
  works: {
    master:  { view: true,  create: true,  edit: true,  delete: true  },
    manager: { view: true,  create: true,  edit: true,  delete: false },
    creator: { view: true,  create: false, edit: false, delete: false },
    //        ^^ creator view is scoped to their own works via RLS
  },

  // send-for-review button (creator action: ongoing/rework → in_review)
  works_submit_review: {
    master:  { view: false, create: false, edit: false, delete: false },
    manager: { view: false, create: false, edit: false, delete: false },
    creator: { view: true,  create: false, edit: true,  delete: false },
    //        ^^ only own works — enforced server-side in /api/works/[id]/status
  },

  // approve / rework / complete buttons (manager action on in_review works)
  works_review_actions: {
    master:  { view: true,  create: false, edit: true,  delete: false },
    manager: { view: true,  create: false, edit: true,  delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // pause / resume
  works_pause: {
    master:  { view: true,  create: false, edit: true,  delete: false },
    manager: { view: true,  create: false, edit: true,  delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // ── SYNC & ASSIGN ─────────────────────────────────────────────────────────
  sync: {
    master:  { view: true,  create: false, edit: true,  delete: false },
    manager: { view: true,  create: false, edit: true,  delete: false },
    creator: { view: true,  create: false, edit: true,  delete: false },
    //        ^^ everyone can sync + assign; RLS controls which generations they see
  },

  // ── WORK DETAIL: ASSIGN GENERATIONS ──────────────────────────────────────
  work_assign: {
    master:  { view: true,  create: false, edit: true,  delete: false },
    manager: { view: true,  create: false, edit: true,  delete: false },
    creator: { view: true,  create: false, edit: true,  delete: false },
    //        ^^ creator can assign to their own works only — enforced server-side
  },

  // ── REPORTS ───────────────────────────────────────────────────────────────
  reports: {
    master:  { view: true,  create: false, edit: false, delete: false },
    manager: { view: true,  create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // reports CSV export
  reports_export: {
    master:  { view: true,  create: true,  edit: false, delete: false },
    manager: { view: true,  create: true,  edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // ── USERS PAGE ────────────────────────────────────────────────────────────
  users: {
    master:  { view: true,  create: false, edit: true,  delete: true  },
    manager: { view: true,  create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
    //        ^^ manager sees read-only list for work assignment, cannot approve/edit/delete
  },

  // approve / reject pending join requests
  users_approvals: {
    master:  { view: true,  create: false, edit: true,  delete: true  },
    manager: { view: false, create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // change active member's role
  users_role_edit: {
    master:  { view: true,  create: false, edit: true,  delete: false },
    manager: { view: false, create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // remove active member from org
  users_remove: {
    master:  { view: true,  create: false, edit: false, delete: true  },
    manager: { view: false, create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // HF account grants (assign which creators access which HF accounts)
  users_hf_grants: {
    master:  { view: true,  create: true,  edit: true,  delete: true  },
    manager: { view: false, create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // ── SETTINGS PAGE ─────────────────────────────────────────────────────────
  settings: {
    master:  { view: true,  create: false, edit: false, delete: false },
    manager: { view: false, create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
    //        ^^ non-masters get a stripped "leave org" view, not full settings
  },

  // HF connections (add / enable / disable / remove)
  settings_hf_connections: {
    master:  { view: true,  create: true,  edit: true,  delete: true  },
    manager: { view: false, create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // video types (add / rename / delete)
  settings_video_types: {
    master:  { view: true,  create: true,  edit: true,  delete: true  },
    manager: { view: false, create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // org name / description edit
  settings_org: {
    master:  { view: true,  create: false, edit: true,  delete: false },
    manager: { view: false, create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // delete org (danger zone)
  settings_delete_org: {
    master:  { view: true,  create: false, edit: false, delete: true  },
    manager: { view: false, create: false, edit: false, delete: false },
    creator: { view: false, create: false, edit: false, delete: false },
  },

  // leave org (non-master self-removal)
  settings_leave_org: {
    master:  { view: false, create: false, edit: false, delete: false },
    manager: { view: true,  create: false, edit: false, delete: true  },
    creator: { view: true,  create: false, edit: false, delete: true  },
  },

  // ── STUDIO ────────────────────────────────────────────────────────────────
  // Prompt Architect + virality engine. Everyone can create/enhance their own
  // prompts; only master/manager can delete others'.
  studio: {
    master:  { view: true,  create: true,  edit: true,  delete: true  },
    manager: { view: true,  create: true,  edit: true,  delete: true  },
    creator: { view: true,  create: true,  edit: true,  delete: false },
  },

} satisfies Record<string, AccessMap>

export type Resource = keyof typeof ACCESS

// ---------------------------------------------------------------------------
// HELPER — use this everywhere in the app
// ---------------------------------------------------------------------------

/**
 * Check whether a role can perform an action on a resource.
 *
 * @example
 *   can('creator', 'clients', 'create')  // false
 *   can('master',  'reports', 'view')    // true
 */
export function can(
  role: Role,
  resource: Resource,
  permission: Permission,
): boolean {
  return ACCESS[resource][role][permission]
}
