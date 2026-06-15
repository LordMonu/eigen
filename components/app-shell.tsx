'use client'

// Persistent /app/* chrome. Sidebar + header stay mounted on client navigation;
// only the main content slot (children) swaps when the route changes.
import { memo, useRef, type ReactNode } from 'react'
import type { ActiveMembership } from '@/lib/auth-helpers'
import { AppSidebar } from '@/components/app-sidebar'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

export type ShellMembership = Pick<
  ActiveMembership,
  'org_name' | 'role' | 'full_name'
>

type AppShellProps = {
  membership: ShellMembership
  children: ReactNode
}

function membershipKey(m: ShellMembership) {
  return `${m.org_name}:${m.role}:${m.full_name}`
}

const AppHeader = memo(function AppHeader({ orgName }: { orgName: string }) {
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-800 px-4">
      <SidebarTrigger className="text-neutral-400" />
      <Separator
        orientation="vertical"
        className="mx-1 h-5 bg-neutral-800"
      />
      <span className="text-sm font-medium text-neutral-300">{orgName}</span>
    </header>
  )
})

const SidebarChrome = memo(function SidebarChrome({
  membership,
}: {
  membership: ShellMembership
}) {
  return (
    <AppSidebar
      orgName={membership.org_name}
      role={membership.role}
      fullName={membership.full_name}
    />
  )
})

export function AppShell({ membership, children }: AppShellProps) {
  // Keep a stable membership reference across layout re-renders so memoized
  // sidebar chrome does not re-render when only {children} change.
  const stableMembership = useRef(membership)
  if (membershipKey(membership) !== membershipKey(stableMembership.current)) {
    stableMembership.current = membership
  }

  return (
    <TooltipProvider delay={0}>
      <SidebarProvider>
        <SidebarChrome membership={stableMembership.current} />
        <SidebarInset className="bg-black">
          <AppHeader orgName={stableMembership.current.org_name} />
          <div className="flex-1 overflow-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
