'use client'

// Persistent /app/* chrome. Sidebar + header stay mounted on client navigation;
// only the main content slot (children) swaps when the route changes.
import { memo, useMemo, type ReactNode } from 'react'
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

const AppHeader = memo(function AppHeader({ orgName }: { orgName: string }) {
  return (
    <header className="sticky top-0 z-30 flex h-14 shrink-0 items-center gap-2 border-b border-neutral-800 bg-black px-4 lg:hidden">
      <SidebarTrigger className="text-neutral-400" />
      <Separator
        orientation="vertical"
        className="mx-1 h-5 bg-neutral-800"
      />
      <span className="truncate text-sm font-medium text-neutral-300">{orgName}</span>
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
  // Keep sidebar props stable across route transitions without mutating refs
  // during render, so React can keep this shell optimized.
  const stableMembership = useMemo(
    () => ({
      org_name: membership.org_name,
      role: membership.role,
      full_name: membership.full_name,
    }),
    [membership.org_name, membership.role, membership.full_name],
  )

  return (
    <TooltipProvider delay={0}>
      <SidebarProvider>
        <SidebarChrome membership={stableMembership} />
        <SidebarInset className="flex h-svh max-h-svh min-h-0 flex-col overflow-hidden bg-black">
          <AppHeader orgName={stableMembership.org_name} />
          <div className="min-h-0 flex-1 overflow-y-auto lg:pt-0">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
