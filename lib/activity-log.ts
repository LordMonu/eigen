// lib/activity-log.ts — server-side activity logging via SECURITY DEFINER rpc.
import type { SupabaseClient } from '@supabase/supabase-js'

export type EntityType = 'work' | 'client' | 'user'
export type Action = 'status_changed' | 'edited' | 'archived' | 'created' | 'assigned' | 'unassigned' | 'wastage' | 'unwastage'

export async function logActivity(
  supabase: SupabaseClient,
  opts: {
    orgId: string
    entityType: EntityType
    entityId: string
    action: Action
    fromValue?: string | null
    toValue?: string | null
    actorName: string
  }
) {
  await supabase.rpc('log_activity', {
    p_org_id: opts.orgId,
    p_entity_type: opts.entityType,
    p_entity_id: opts.entityId,
    p_action: opts.action,
    p_from_value: opts.fromValue ?? null,
    p_to_value: opts.toValue ?? null,
    p_actor_name: opts.actorName,
  })
}
