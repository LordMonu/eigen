// lib/client-helpers.ts — single source of truth for client statuses.

export const CLIENT_STATUSES = [
  'ongoing',
  'trial',
  'in_talk',
  'outreach',
  'paused',
  'ended',
] as const

export type ClientStatus = (typeof CLIENT_STATUSES)[number]

export const CLIENT_STATUS_LABELS: Record<ClientStatus, string> = {
  ongoing: 'Ongoing',
  trial: 'Trial',
  in_talk: 'In Talks',
  outreach: 'Outreach',
  paused: 'Paused',
  ended: 'Ended',
}

export const CLIENT_STATUS_COLORS: Record<ClientStatus, string> = {
  ongoing: 'bg-green-900/40 text-green-300 border-green-700',
  trial: 'bg-blue-900/40 text-blue-300 border-blue-700',
  in_talk: 'bg-purple-900/40 text-purple-300 border-purple-700',
  outreach: 'bg-yellow-900/40 text-yellow-300 border-yellow-700',
  paused: 'bg-neutral-800 text-neutral-400 border-neutral-700',
  ended: 'bg-red-900/40 text-red-300 border-red-700',
}

export const CLIENT_STATUS_DESCRIPTIONS: Record<ClientStatus, string> = {
  ongoing: 'Active client, currently producing work',
  trial: 'Creating trial videos to convert',
  in_talk: 'In conversations / meetings',
  outreach: 'Just reached out, awaiting response',
  paused: 'Was active, currently on hold',
  ended: 'Relationship has concluded',
}

/**
 * Sort clients by the fixed status order. Within each status, by name.
 */
export function sortClientsByStatus<
  T extends { status: ClientStatus; name: string },
>(clients: T[]): T[] {
  const order = CLIENT_STATUSES.reduce(
    (acc, s, i) => ({ ...acc, [s]: i }),
    {} as Record<string, number>
  )
  return [...clients].sort((a, b) => {
    const diff = order[a.status] - order[b.status]
    if (diff !== 0) return diff
    return a.name.localeCompare(b.name)
  })
}
