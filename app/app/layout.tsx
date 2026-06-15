// app/app/layout.tsx — persistent app shell for /app/* routes.
// AppShell (client) keeps sidebar/header mounted across navigations; only
// {children} swap per route. Membership is resolved once when entering /app.
import { Suspense } from 'react'
import { requireActiveMembership } from '@/lib/auth-helpers'
import { AppShell } from '@/components/app-shell'

async function AppShellWithMembership({
  children,
}: {
  children: React.ReactNode
}) {
  const membership = await requireActiveMembership()

  return (
    <AppShell
      membership={{
        org_name: membership.org_name,
        role: membership.role,
        full_name: membership.full_name,
      }}
    >
      {children}
    </AppShell>
  )
}

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <Suspense fallback={<AppShellFallback />}>
      <AppShellWithMembership>{children}</AppShellWithMembership>
    </Suspense>
  )
}

function AppShellFallback() {
  return (
    <div className="flex min-h-screen bg-black">
      <aside className="hidden w-64 shrink-0 border-r border-neutral-800 bg-neutral-950 md:block" />
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-14 shrink-0 items-center border-b border-neutral-800 px-4">
          <div className="h-4 w-32 animate-pulse rounded bg-neutral-900" />
        </div>
        <div className="flex-1 overflow-auto p-6">
          <div className="h-7 w-48 animate-pulse rounded bg-neutral-900" />
          <div className="mt-2 h-4 w-72 animate-pulse rounded bg-neutral-900" />
        </div>
      </div>
    </div>
  )
}
